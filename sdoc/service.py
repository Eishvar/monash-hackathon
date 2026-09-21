"""Application service: process emails into the database, human review with recompute + audit, export, metrics.

The API layer (api/index.py) only routes requests here. Everything is written against the `Repository` and
`AttachmentStore` interfaces so it runs on Supabase in the cloud and on in-memory fakes in tests."""
import os
import time
import uuid
from dataclasses import asdict

from sdoc.classify import classify
from sdoc.config import FIELDS, cache_dir, llm_enabled, resolve_model
from sdoc.db import MemoryRepo, Repository, SupabaseHandle, SupabaseRepo
from sdoc.decide import decide
from sdoc.llm import LLM, DiskCache, OpenAICompatLLM, RepoCache, TieredCache
from sdoc.metrics import compute_metrics
from sdoc.parse import Doc
from sdoc.pipeline import Pipeline, Result
from sdoc.store import AttachmentStore, SupabaseStore

DEFAULT_RECORD = {"category": "GENERAL", "status": "OK", "review_reason": None, "has_defect": False,
                  "defect_fields": [], "decided_by": "rule"}
BATCH_BUDGET_S = 45  # stay well inside the serverless function timeout
METRIC_COLUMNS = "email_id,category,status,review_reason,has_defect,defect_fields,decided_by,reviewed"


class NotFound(LookupError):
    pass


class BadRequest(ValueError):
    pass


def result_row(email_id: str, res: Result, run_id: str | None) -> dict:
    return {
        "email_id": email_id,
        **res.record,
        "fields": res.details.get("fields", []),
        "provisional_fields": res.details.get("provisional_fields", []),
        "explanation": res.details.get("explanation"),
        "notes": res.details.get("notes", []),
        "processing_error": None,
        "reviewed": False,
        "run_id": run_id,
    }


def to_record(result: dict) -> dict:
    """Result row -> the exact submission shape (a failed row is exported as an unreadable escalation)."""
    if result["status"] == "ERROR":
        return {**DEFAULT_RECORD, "category": result["category"], "status": "NEEDS_REVIEW", "review_reason": "unreadable"}
    return {k: result[k] for k in DEFAULT_RECORD}


class Service:
    def __init__(self, repo: Repository, store: AttachmentStore, llm: LLM | None = None):
        self.repo, self.store, self.llm = repo, store, llm

    def _usage(self) -> dict:
        return self.llm.usage.as_dict() if hasattr(self.llm, "usage") else {}

    # -- processing ----------------------------------------------------------------------------------------
    def process(self, email_id: str, run_id: str | None = None) -> dict:
        email = self.repo.get_email(email_id)
        if email is None:
            raise NotFound(email_id)
        try:
            row = result_row(email_id, Pipeline(self.llm, store=self.store).process_email(email), run_id)
        except Exception as exc:  # visible, retryable failure instead of a silent default
            rule = classify(email.get("body", ""), email.get("attachments", []))
            row = {
                **DEFAULT_RECORD, "email_id": email_id, "category": rule.category, "status": "ERROR",
                "processing_error": f"{type(exc).__name__}: {exc}"[:500], "run_id": run_id, "reviewed": False,
            }
        self.repo.upsert_result(row)
        return row

    def process_batch(self, ids: list[str] | None = None, limit: int = 10, only_unprocessed: bool = True,
                      run_id: str | None = None, budget_s: float = BATCH_BUDGET_S) -> dict:
        run_id = run_id or uuid.uuid4().hex[:12]
        targets = ids if ids is not None else self.repo.list_email_ids(only_unprocessed=only_unprocessed, limit=limit)
        before, t0, done = self._usage(), time.monotonic(), []
        for email_id in targets:
            if time.monotonic() - t0 > budget_s:
                break
            self.process(email_id, run_id)
            done.append(email_id)
        self._record_run(run_id, before, len(done))
        return {"run_id": run_id, "processed": done, "remaining": len(self.repo.list_email_ids(only_unprocessed=True)),
                "seconds": round(time.monotonic() - t0, 1)}

    def _record_run(self, run_id: str, before: dict, n: int) -> None:
        after = self._usage()
        existing = self.repo.get_run(run_id)  # by id: interleaved runs must not reset each other's stats
        stats = dict((existing or {}).get("stats") or {})
        stats["emails_processed"] = stats.get("emails_processed", 0) + n
        for k in ("llm_calls", "cache_hits", "prompt_tokens", "completion_tokens"):
            stats[k] = stats.get(k, 0) + after.get(k, 0) - before.get(k, 0)
        by_task = dict(stats.get("by_task") or {})
        for task, count in (after.get("by_task") or {}).items():
            by_task[task] = by_task.get(task, 0) + count - (before.get("by_task") or {}).get(task, 0)
        stats["by_task"] = {t: c for t, c in by_task.items() if c}
        by_model = {m: list(v) for m, v in (stats.get("by_model") or {}).items()}
        for m, (p, c) in (after.get("by_model") or {}).items():
            bp, bc = (before.get("by_model") or {}).get(m, (0, 0))
            cur = by_model.setdefault(m, [0, 0])
            cur[0] += p - bp
            cur[1] += c - bc
        stats["by_model"] = by_model
        run = {"id": run_id, "stats": stats}
        if not existing:
            run["models"] = {t: f"{resolve_model(t).provider}/{resolve_model(t).model}" for t in ("classify", "vision")}
        self.repo.upsert_run(run)

    # -- reading ---------------------------------------------------------------------------------------------
    def list_emails(self, category=None, status=None, limit=50, offset=0) -> list[dict]:
        return self.repo.list_emails(category, status, min(limit, 200), offset)

    def email_detail(self, email_id: str) -> dict:
        email = self.repo.get_email(email_id)
        if email is None:
            raise NotFound(email_id)
        return {"email": email, "result": self.repo.get_result(email_id), "reviews": self.repo.list_reviews(email_id)}

    def review_queue(self) -> list[dict]:
        queue = self.repo.review_queue()
        headers = self.repo.email_headers([r["email_id"] for r in queue])
        return [
            {"email_id": r["email_id"], "subject": headers.get(r["email_id"], {}).get("subject"),
             "sender": headers.get(r["email_id"], {}).get("sender"), "result": r}
            for r in queue
        ]

    # -- human review: confirm / correct -> recompute -> audit ---------------------------------------------------------
    def review(self, email_id: str, action: str, corrections: dict[str, dict[str, str | None]] | None = None,
               note: str | None = None) -> dict:
        if action not in ("confirm", "correct"):
            raise BadRequest("action must be 'confirm' or 'correct'")
        result = self.repo.get_result(email_id)
        if result is None:
            raise NotFound(email_id)
        corrections = corrections or {}
        for f, sides in corrections.items():
            if f not in FIELDS or not set(sides) <= {"si", "bl"}:
                raise BadRequest(f"bad correction for {f!r}: fields must be one of {FIELDS}, sides 'si'/'bl'")
        if action == "correct" and not corrections:
            raise BadRequest("'correct' needs at least one correction")
        if result["status"] == "ERROR" and not corrections:
            # Confirming would clear the error and hide a failed email from the queue while its status stays ERROR.
            raise BadRequest("this email failed to process: retry processing, or supply values for the fields")

        before = {k: result.get(k) for k in ("status", "review_reason", "defect_fields", "has_defect", "fields")}
        rows = result.get("fields") or result.get("provisional_fields") or []
        new = dict(result)
        if rows or corrections:
            values = {f: {"si": None, "bl": None} for f in FIELDS}
            for r in rows:
                values[r["field"]] = {"si": r["si"], "bl": r["bl"]}
            for f, sides in corrections.items():
                values[f].update({s: (v.strip() if isinstance(v, str) and v.strip() else None) for s, v in sides.items()})
            d = decide(Doc("SI", {f: values[f]["si"] for f in FIELDS}), Doc("BL", {f: values[f]["bl"] for f in FIELDS}))
            new.update(status=d.status, review_reason=d.review_reason, has_defect=d.has_defect,
                       defect_fields=d.defect_fields, fields=[asdict(r) for r in d.fields])
        new.update(reviewed=True, processing_error=None)
        self.repo.upsert_result(new)
        after = {k: new.get(k) for k in before}
        self.repo.add_review({"email_id": email_id, "action": action, "before": before, "after": after,
                              "note": note or ("corrected: " + ", ".join(corrections) if corrections else None)})
        return self.repo.get_result(email_id)

    # -- outputs -----------------------------------------------------------------------------------------------
    def export_submission(self) -> dict[str, dict]:
        results = {r["email_id"]: r for r in self.repo.all_results()}
        return {i: to_record(results[i]) if i in results else dict(DEFAULT_RECORD) for i in self.repo.list_email_ids()}

    def metrics(self) -> dict:
        results = self.repo.all_results(METRIC_COLUMNS)  # light columns: this endpoint is hit on every page load
        records = {r["email_id"]: to_record(r) for r in results}
        run = self.repo.latest_run() or {}
        stats = run.get("stats") or {}
        usage = {**stats, "by_task": stats.get("by_task", {})}
        m = compute_metrics(records, usage)
        total = len(self.repo.list_email_ids())
        m.update(total_emails=total, processed=len(results), unprocessed=total - len(results),
                 errors=sum(r["status"] == "ERROR" for r in results),
                 review_queue=sum(r["status"] in ("NEEDS_REVIEW", "ERROR") and not r.get("reviewed") for r in results),
                 reviewed=sum(bool(r.get("reviewed")) for r in results),
                 latest_run={k: run.get(k) for k in ("id", "models", "score", "started_at")} if run else None)
        return m


def build_service() -> Service:
    """Service wired to Supabase + the LLM, from environment variables (used by the API and scripts)."""
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set")
    client = SupabaseHandle(url, key)
    repo = SupabaseRepo(client)
    llm = None
    if llm_enabled() and os.getenv("OPENROUTER_API_KEY"):
        llm = OpenAICompatLLM(cache=TieredCache(DiskCache(cache_dir()), RepoCache(repo)))
    return Service(repo, SupabaseStore(client), llm)


__all__ = ["Service", "build_service", "MemoryRepo", "NotFound", "BadRequest", "to_record"]
