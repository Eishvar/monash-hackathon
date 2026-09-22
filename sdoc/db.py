"""Persistence: a small repository interface, a Supabase implementation and an in-memory one for tests."""
import threading
from datetime import datetime, timezone
from typing import Protocol

RESULT_COLUMNS = (
    "email_id category status review_reason has_defect defect_fields decided_by fields provisional_fields "
    "explanation notes trace processing_error reviewed run_id updated_at"
).split()
PAGE = 1000


def snippet(body: str | None, n: int = 110) -> str:
    """First line-ish of an email body for list previews."""
    return " ".join((body or "").split())[:n]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository(Protocol):
    def upsert_emails(self, emails: list[dict]) -> None: ...
    def delete_emails(self, ids: list[str]) -> None: ...
    def get_email(self, email_id: str) -> dict | None: ...
    def list_email_ids(self, only_unprocessed: bool = False, limit: int | None = None, offset: int = 0) -> list[str]: ...
    def list_emails(self, category: str | None, status: str | None, limit: int, offset: int, preview: bool = False, q: str | None = None) -> list[dict]: ...
    def upsert_result(self, result: dict) -> None: ...
    def get_result(self, email_id: str) -> dict | None: ...
    def all_results(self, columns: str = "*") -> list[dict]: ...
    def review_queue(self) -> list[dict]: ...
    def email_headers(self, ids: list[str]) -> dict[str, dict]: ...
    def get_run(self, run_id: str) -> dict | None: ...
    def add_review(self, review: dict) -> None: ...
    def list_reviews(self, email_id: str) -> list[dict]: ...
    def all_reviews(self) -> list[dict]: ...
    def upsert_run(self, run: dict) -> None: ...
    def latest_run(self) -> dict | None: ...
    def cache_get(self, key: str) -> dict | None: ...
    def cache_put(self, key: str, response: dict) -> None: ...


class SupabaseHandle:
    """One Supabase client per thread. FastAPI runs sync routes in a thread pool and the client's HTTP/2 connection
    is not thread-safe, so concurrent requests sharing one client failed with `httpx.ReadError` (WinError 10035)."""

    def __init__(self, url: str, key: str):
        self._url, self._key, self._local = url, key, threading.local()

    @property
    def client(self):
        if getattr(self._local, "client", None) is None:
            from supabase import create_client

            self._local.client = create_client(self._url, self._key)
        return self._local.client

    def table(self, name: str):
        return self.client.table(name)

    @property
    def storage(self):
        return self.client.storage


class SupabaseRepo:
    def __init__(self, client):
        self.c = client
        self._no_trace = False  # set when the `trace` column is missing (schema line not applied yet): never fail processing over it

    def _all(self, query_builder, order: str) -> list[dict]:
        rows, start = [], 0
        while True:
            chunk = query_builder().order(order).range(start, start + PAGE - 1).execute().data
            rows += chunk
            if len(chunk) < PAGE:
                return rows
            start += PAGE

    def upsert_emails(self, emails: list[dict]) -> None:
        for i in range(0, len(emails), 100):
            self.c.table("emails").upsert(emails[i : i + 100]).execute()

    def delete_emails(self, ids: list[str]) -> None:
        if ids:  # results and reviews go with them (on delete cascade)
            self.c.table("emails").delete().in_("email_id", ids).execute()

    def get_email(self, email_id: str) -> dict | None:
        rows = self.c.table("emails").select("*").eq("email_id", email_id).limit(1).execute().data
        return rows[0] if rows else None

    def list_email_ids(self, only_unprocessed: bool = False, limit: int | None = None, offset: int = 0) -> list[str]:
        ids = [r["email_id"] for r in self._all(lambda: self.c.table("emails").select("email_id"), "email_id")]
        if only_unprocessed:
            done = {r["email_id"] for r in self._all(lambda: self.c.table("results").select("email_id"), "email_id")}
            ids = [i for i in ids if i not in done]
        return ids[offset : offset + limit] if limit is not None else ids[offset:]

    def list_emails(self, category: str | None, status: str | None, limit: int, offset: int, preview: bool = False, q: str | None = None) -> list[dict]:
        cols = "category,status,review_reason,has_defect,defect_fields,decided_by,reviewed,processing_error"
        embed = "results!inner" if (category or status) else "results"
        query = self.c.table("emails").select(f"email_id,sender,subject,attachments{',body' if preview else ''},{embed}({cols})")
        if category:
            query = query.eq("results.category", category)
        if status:
            query = query.eq("results.status", status)
        if q and q.strip():
            term = q.strip()
            if term.isdigit():
                padded = f"email_{term.zfill(3)}"
                query = query.or_(f"email_id.ilike.%{term}%,email_id.eq.{padded},subject.ilike.%{term}%,sender.ilike.%{term}%")
            else:
                query = query.or_(f"email_id.ilike.%{term}%,subject.ilike.%{term}%,sender.ilike.%{term}%")
        rows = query.order("email_id").range(offset, offset + limit - 1).execute().data
        out = []
        for r in rows:
            res = r.pop("results", None)
            res = res[0] if isinstance(res, list) and res else (res or None)
            if preview:
                r["snippet"] = snippet(r.pop("body", None))
            out.append({**r, "result": res})
        return out

    def upsert_result(self, result: dict) -> None:
        row = {**result, "updated_at": now()}
        if self._no_trace:
            row.pop("trace", None)
        try:
            self.c.table("results").upsert(row).execute()
        except Exception as exc:
            if "trace" not in row or "trace" not in str(exc):
                raise
            self._no_trace = True
            row.pop("trace")
            self.c.table("results").upsert(row).execute()

    def get_result(self, email_id: str) -> dict | None:
        rows = self.c.table("results").select("*").eq("email_id", email_id).limit(1).execute().data
        return rows[0] if rows else None

    def all_results(self, columns: str = "*") -> list[dict]:
        return self._all(lambda: self.c.table("results").select(columns), "email_id")

    def review_queue(self) -> list[dict]:
        return self._all(
            lambda: self.c.table("results").select("*").or_("status.eq.NEEDS_REVIEW,status.eq.ERROR").eq("reviewed", False),
            "email_id",
        )

    def email_headers(self, ids: list[str]) -> dict[str, dict]:
        if not ids:
            return {}
        rows = self.c.table("emails").select("email_id,subject,sender").in_("email_id", ids).execute().data
        return {r["email_id"]: r for r in rows}

    def add_review(self, review: dict) -> None:
        self.c.table("reviews").insert(review).execute()

    def list_reviews(self, email_id: str) -> list[dict]:
        return self.c.table("reviews").select("*").eq("email_id", email_id).order("id").execute().data

    def all_reviews(self) -> list[dict]:
        return self._all(lambda: self.c.table("reviews").select("*"), "id")

    def upsert_run(self, run: dict) -> None:
        self.c.table("runs").upsert(run).execute()

    def get_run(self, run_id: str) -> dict | None:
        rows = self.c.table("runs").select("*").eq("id", run_id).limit(1).execute().data
        return rows[0] if rows else None

    def latest_run(self) -> dict | None:
        rows = self.c.table("runs").select("*").order("started_at", desc=True).limit(1).execute().data
        return rows[0] if rows else None

    def cache_get(self, key: str) -> dict | None:
        rows = self.c.table("llm_cache").select("response").eq("key", key).limit(1).execute().data
        return rows[0]["response"] if rows else None

    def cache_put(self, key: str, response: dict) -> None:
        self.c.table("llm_cache").upsert({"key": key, "response": response}).execute()


class MemoryRepo:
    """In-memory Repository for tests and offline demos."""

    def __init__(self):
        self.emails: dict[str, dict] = {}
        self.results: dict[str, dict] = {}
        self.reviews: list[dict] = []
        self.runs: dict[str, dict] = {}
        self.cache: dict[str, dict] = {}

    def upsert_emails(self, emails):
        self.emails.update({e["email_id"]: dict(e) for e in emails})

    def delete_emails(self, ids):
        for i in ids:
            self.emails.pop(i, None)
            self.results.pop(i, None)
        self.reviews = [r for r in self.reviews if r["email_id"] not in ids]

    def get_email(self, email_id):
        return self.emails.get(email_id)

    def list_email_ids(self, only_unprocessed=False, limit=None, offset=0):
        ids = sorted(i for i in self.emails if not (only_unprocessed and i in self.results))
        return ids[offset : offset + limit] if limit is not None else ids[offset:]

    def list_emails(self, category, status, limit, offset, preview=False, q=None):
        rows = []
        term = q.strip().lower() if q and q.strip() else None
        padded = f"email_{term.zfill(3)}" if term and term.isdigit() else ""
        for i in sorted(self.emails):
            e, res = self.emails[i], self.results.get(i)
            if (category or status) and res is None:
                continue
            if category and res["category"] != category or status and res["status"] != status:
                continue
            if term:
                match = (
                    term in e["email_id"].lower()
                    or (padded and e["email_id"].lower() == padded)
                    or term in (e.get("subject") or "").lower()
                    or term in (e.get("sender") or "").lower()
                )
                if not match:
                    continue
            row = {k: e[k] for k in ("email_id", "sender", "subject", "attachments")} | {"result": res}
            rows.append(row | {"snippet": snippet(e.get("body"))} if preview else row)
        return rows[offset : offset + limit]

    def upsert_result(self, result):
        self.results[result["email_id"]] = {**result, "updated_at": now()}

    def get_result(self, email_id):
        return self.results.get(email_id)

    def all_results(self, columns="*"):
        return [self.results[i] for i in sorted(self.results)]

    def review_queue(self):
        return [r for r in self.all_results() if r["status"] in ("NEEDS_REVIEW", "ERROR") and not r.get("reviewed")]

    def add_review(self, review):
        self.reviews.append({"id": len(self.reviews) + 1, "created_at": now(), **review})

    def list_reviews(self, email_id):
        return [r for r in self.reviews if r["email_id"] == email_id]

    def all_reviews(self):
        return list(self.reviews)

    def upsert_run(self, run):
        self.runs[run["id"]] = {**self.runs.get(run["id"], {}), **run}

    def get_run(self, run_id):
        return self.runs.get(run_id)

    def email_headers(self, ids):
        return {i: {k: self.emails[i].get(k) for k in ("email_id", "subject", "sender")} for i in ids if i in self.emails}

    def latest_run(self):
        return max(self.runs.values(), key=lambda r: r.get("started_at", ""), default=None)

    def cache_get(self, key):
        return self.cache.get(key)

    def cache_put(self, key, response):
        self.cache[key] = response
