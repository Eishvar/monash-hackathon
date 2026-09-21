"""Application service: process emails into the database, human review with recompute + audit, export, metrics.

The API layer (api/index.py) only routes requests here. Everything is written against the `Repository` and
`AttachmentStore` interfaces so it runs on Supabase in the cloud and on in-memory fakes in tests."""
import csv
import io
import os
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from sdoc.classify import classify
from sdoc.config import FIELDS, cache_dir, llm_enabled, resolve_model
from sdoc.db import MemoryRepo, Repository, SupabaseHandle, SupabaseRepo
from sdoc.decide import decide
from sdoc.llm import LLM, DiskCache, OpenAICompatLLM, RepoCache, TieredCache
from sdoc.metrics import compute_metrics
from sdoc.parse import Doc
from sdoc.pipeline import Pipeline, Result
from sdoc.ingest import UploadError, build_upload
from sdoc.simulate import MAX_SIMULATED, MAX_UPLOADS, SCENARIOS, build_email, is_simulated, is_upload
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

    # -- Gmail-view demo: simulated inbound mail ----------------------------------------------------------------
    def simulate_email(self, scenario: str) -> dict:
        """An inbound email arrives and is verified immediately (no click needed). Simulated rows stay out of the
        scored export and the metrics; `reset_simulated` removes them."""
        if scenario not in SCENARIOS:
            raise BadRequest(f"unknown scenario {scenario!r}; choose one of {list(SCENARIOS)}")
        if sum(map(is_simulated, self.repo.list_email_ids())) >= MAX_SIMULATED:
            raise BadRequest("too many simulated emails: clear them first")
        email, files = build_email(scenario)
        for name, (data, content_type) in files.items():
            self.store.write(name, data, content_type)
        self.repo.upsert_emails([email])
        return {"email": email, "result": self.process(email["email_id"])}

    def _reset(self, is_mine) -> dict:
        ids = [i for i in self.repo.list_email_ids() if is_mine(i)]
        names = [a for i in ids for a in (self.repo.get_email(i) or {}).get("attachments", [])]
        self.store.delete(names)
        self.repo.delete_emails(ids)
        return {"deleted": len(ids)}

    def reset_simulated(self) -> dict:
        return self._reset(is_simulated)

    # -- Process page: manual PDF upload -----------------------------------------------------------------------------
    def ingest_upload(self, files: list[tuple[str, bytes]], roles: list[str] | None = None) -> dict:
        """PDFs (an exported email and/or SI / draft BL) become an email that is processed straight away."""
        if sum(map(is_upload, self.repo.list_email_ids())) >= MAX_UPLOADS:
            raise BadRequest("too many uploaded emails: remove them first")
        try:
            email, stored, detected = build_upload(files, roles)
        except UploadError as exc:
            raise BadRequest(str(exc)) from exc
        for name, (data, content_type) in stored.items():
            self.store.write(name, data, content_type)
        self.repo.upsert_emails([email])
        return {"email": email, "result": self.process(email["email_id"]), "detected": detected}

    def reset_uploads(self) -> dict:
        return self._reset(is_upload)

    # -- reading ---------------------------------------------------------------------------------------------
    def list_emails(self, category=None, status=None, limit=50, offset=0, preview=False) -> list[dict]:
        return self.repo.list_emails(category, status, min(limit, 200), offset, preview)

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
    @staticmethod
    def _recompute(result: dict, corrections: dict) -> dict:
        """Pure: the result row's decision fields after applying `corrections`, through the same `decide()` as the pipeline."""
        rows = result.get("fields") or result.get("provisional_fields") or []
        if not (rows or corrections):
            return {}
        values = {f: {"si": None, "bl": None} for f in FIELDS}
        for r in rows:
            values[r["field"]] = {"si": r["si"], "bl": r["bl"]}
        for f, sides in corrections.items():
            values[f].update({s: (v.strip() if isinstance(v, str) and v.strip() else None) for s, v in sides.items()})
        d = decide(Doc("SI", {f: values[f]["si"] for f in FIELDS}), Doc("BL", {f: values[f]["bl"] for f in FIELDS}))
        return dict(status=d.status, review_reason=d.review_reason, has_defect=d.has_defect,
                    defect_fields=d.defect_fields, fields=[asdict(r) for r in d.fields])

    def _validated_result(self, email_id: str, corrections: dict, action: str = "correct") -> dict:
        if action not in ("confirm", "correct"):
            raise BadRequest("action must be 'confirm' or 'correct'")
        result = self.repo.get_result(email_id)
        if result is None:
            raise NotFound(email_id)
        for f, sides in corrections.items():
            if f not in FIELDS or not set(sides) <= {"si", "bl"}:
                raise BadRequest(f"bad correction for {f!r}: fields must be one of {FIELDS}, sides 'si'/'bl'")
        if action == "correct" and not corrections:
            raise BadRequest("'correct' needs at least one correction")
        if result["status"] == "ERROR" and not corrections:
            # Confirming would clear the error and hide a failed email from the queue while its status stays ERROR.
            raise BadRequest("this email failed to process: retry processing, or supply values for the fields")
        return result

    def preview_review(self, email_id: str, corrections: dict[str, dict[str, str | None]] | None = None) -> dict:
        """Dry run of `review`: what the verdict would become. Writes nothing."""
        corrections = corrections or {}
        result = self._validated_result(email_id, corrections, "correct" if corrections else "confirm")
        new = {**result, **self._recompute(result, corrections)}
        return {k: new.get(k) for k in ("status", "review_reason", "has_defect", "defect_fields", "fields")}

    def review(self, email_id: str, action: str, corrections: dict[str, dict[str, str | None]] | None = None,
               note: str | None = None) -> dict:
        corrections = corrections or {}
        result = self._validated_result(email_id, corrections, action)
        before = {k: result.get(k) for k in ("status", "review_reason", "defect_fields", "has_defect", "fields")}
        new = {**result, **self._recompute(result, corrections)}
        new.update(reviewed=True, processing_error=None)
        self.repo.upsert_result(new)
        after = {k: new.get(k) for k in before}
        self.repo.add_review({"email_id": email_id, "action": action, "before": before, "after": after,
                              "note": note or ("corrected: " + ", ".join(corrections) if corrections else None)})
        return self.repo.get_result(email_id)

    def review_stats(self) -> dict:
        """Human-in-the-loop numbers over the audit trail: how many reviews, what they changed, what still waits."""
        reviews = self.repo.all_reviews()
        transitions: dict[str, int] = {}
        fields_corrected: dict[str, int] = {}
        for r in reviews:
            b, a = r.get("before") or {}, r.get("after") or {}
            if b.get("status") != a.get("status"):
                key = f"{b.get('status')}→{a.get('status')}"
                transitions[key] = transitions.get(key, 0) + 1
            if r.get("action") != "correct":
                continue
            was = {f["field"]: f for f in (b.get("fields") or [])}
            for f in a.get("fields") or []:
                old = was.get(f["field"])
                if old is None:  # scan / provisional case: nothing was recorded before, so count what was entered
                    changed = f.get("si") is not None or f.get("bl") is not None
                else:
                    changed = (old.get("si"), old.get("bl")) != (f.get("si"), f.get("bl"))
                if changed:
                    fields_corrected[f["field"]] = fields_corrected.get(f["field"], 0) + 1
        open_rows = self.repo.all_results("email_id,status,reviewed")
        recent = sorted(reviews, key=lambda r: str(r.get("created_at") or ""), reverse=True)[:8]
        headers = self.repo.email_headers([r["email_id"] for r in recent])
        return {
            "total": len(reviews),
            "confirmed": sum(r.get("action") == "confirm" for r in reviews),
            "corrected": sum(r.get("action") == "correct" for r in reviews),
            "verdict_changed": sum(transitions.values()),
            "transitions": transitions,
            "fields_corrected": fields_corrected,
            "queue_open": sum(r["status"] in ("NEEDS_REVIEW", "ERROR") and not r.get("reviewed") for r in open_rows),
            "recent": [{"email_id": r["email_id"], "subject": headers.get(r["email_id"], {}).get("subject"),
                        "action": r.get("action"), "before_status": (r.get("before") or {}).get("status"),
                        "after_status": (r.get("after") or {}).get("status"), "note": r.get("note"),
                        "created_at": r.get("created_at")} for r in recent],
        }

    def pipeline_stats(self) -> dict:
        """How the cascade decided every email (rules -> AI -> vision -> human), from columns already stored."""
        rows = self.repo.all_results("email_id,category,status,review_reason,decided_by,reviewed,provisional_fields")
        bl = [r for r in rows if r["category"] == "BL_COMPARISON"]
        funnel = {
            "emails": len(rows),
            "decided_by_rules": sum(r["decided_by"] == "rule" for r in rows),
            "needed_ai": sum(r["decided_by"] == "llm" for r in rows),
            "bl_comparisons": len(bl),
            "ok": sum(r["status"] == "OK" for r in bl),
            "mismatch": sum(r["status"] == "MISMATCH" for r in bl),
            "needs_review": sum(r["status"] in ("NEEDS_REVIEW", "ERROR") for r in bl),
            "vision_used": sum(bool(r.get("provisional_fields")) for r in rows),
            "human_reviewed": sum(bool(r.get("reviewed")) for r in rows),
        }
        return {"funnel": funnel, "stages": {}}

    # -- outputs -----------------------------------------------------------------------------------------------
    def export_submission(self, include_extra: bool = False) -> dict[str, dict]:
        """The organiser's submission shape. By default dataset emails only (what the scorer expects); the UI's
        download also includes simulated and uploaded emails."""
        results = {r["email_id"]: r for r in self.repo.all_results()}
        ids = [i for i in self.repo.list_email_ids() if include_extra or not (is_simulated(i) or is_upload(i))]
        return {i: to_record(results[i]) if i in results else dict(DEFAULT_RECORD) for i in ids}

    def export_csv(self) -> str:
        """Mismatches (and cases waiting for a human) as a spreadsheet: which emails, which fields, and why (the AI explanation)."""
        rows = [r for r in self.repo.all_results()
                if r["category"] == "BL_COMPARISON" and r["status"] in ("MISMATCH", "NEEDS_REVIEW", "ERROR")]
        headers = self.repo.email_headers([r["email_id"] for r in rows])
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["email_id", "subject", "sender", "status", "review_reason", "mismatched_fields", "si_vs_bl_values", "explanation", "human_reviewed"])
        for r in rows:
            h = headers.get(r["email_id"], {})
            by_field = {f["field"]: f for f in (r.get("fields") or r.get("provisional_fields") or [])}
            diffs = "; ".join(f"{f}: SI={by_field[f]['si']} | BL={by_field[f]['bl']}" for f in r["defect_fields"] if f in by_field)
            w.writerow([r["email_id"], h.get("subject") or "", h.get("sender") or "", r["status"], r.get("review_reason") or "",
                        ", ".join(r["defect_fields"]), diffs.replace("\n", " "), (r.get("explanation") or "").replace("\n", " "),
                        "yes" if r.get("reviewed") else "no"])
        return out.getvalue()

    def routes(self) -> list[dict]:
        """One row per BL comparison with its port of loading / discharge as written in the documents (SI value, else BL).
        Emails without document values (e.g. a request for a draft BL) have no ports; the UI falls back to the subject."""
        rows = [r for r in self.repo.all_results("email_id,category,status,fields,provisional_fields") if r["category"] == "BL_COMPARISON"]
        ids = [r["email_id"] for r in rows]
        headers: dict[str, dict] = {}
        for i in range(0, len(ids), 80):  # chunked: keeps the `in` filter's URL short
            headers.update(self.repo.email_headers(ids[i : i + 80]))
        out = []
        for r in rows:
            by = {f["field"]: f for f in (r.get("fields") or r.get("provisional_fields") or [])}

            def port(key: str) -> str | None:
                f = by.get(key)
                v = ((f.get("si") or f.get("bl")) if f else None) or ""
                return v.split("\n")[0].strip() or None

            out.append({"email_id": r["email_id"], "status": r["status"], "subject": headers.get(r["email_id"], {}).get("subject"),
                        "sender": headers.get(r["email_id"], {}).get("sender"), "pol": port("port_of_loading"), "pod": port("port_of_discharge")})
        return out

    def processed_daily(self, days: int = 14) -> list[dict]:
        """Emails processed per UTC day for the last `days` days (zero-filled), from each result's last-processed time."""
        counts: dict[str, int] = {}
        for r in self.repo.all_results("email_id,updated_at"):
            if r.get("updated_at"):
                day = str(r["updated_at"])[:10]
                counts[day] = counts.get(day, 0) + 1
        today = datetime.now(timezone.utc).date()
        span = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
        return [{"date": d, "count": counts.get(d, 0)} for d in span]

    def metrics(self) -> dict:
        results = self.repo.all_results(METRIC_COLUMNS)  # light columns: hit on every page load
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
