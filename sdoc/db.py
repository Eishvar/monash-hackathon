"""Persistence: a small repository interface, a Supabase implementation and an in-memory one for tests."""
import threading
from datetime import datetime, timezone
from typing import Protocol

RESULT_COLUMNS = (
    "email_id category status review_reason has_defect defect_fields decided_by fields provisional_fields "
    "explanation notes processing_error reviewed run_id updated_at"
).split()
PAGE = 1000


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository(Protocol):
    def upsert_emails(self, emails: list[dict]) -> None: ...
    def get_email(self, email_id: str) -> dict | None: ...
    def list_email_ids(self, only_unprocessed: bool = False, limit: int | None = None, offset: int = 0) -> list[str]: ...
    def list_emails(self, category: str | None, status: str | None, limit: int, offset: int) -> list[dict]: ...
    def upsert_result(self, result: dict) -> None: ...
    def get_result(self, email_id: str) -> dict | None: ...
    def all_results(self) -> list[dict]: ...
    def review_queue(self) -> list[dict]: ...
    def add_review(self, review: dict) -> None: ...
    def list_reviews(self, email_id: str) -> list[dict]: ...
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

    def get_email(self, email_id: str) -> dict | None:
        rows = self.c.table("emails").select("*").eq("email_id", email_id).limit(1).execute().data
        return rows[0] if rows else None

    def list_email_ids(self, only_unprocessed: bool = False, limit: int | None = None, offset: int = 0) -> list[str]:
        ids = [r["email_id"] for r in self._all(lambda: self.c.table("emails").select("email_id"), "email_id")]
        if only_unprocessed:
            done = {r["email_id"] for r in self._all(lambda: self.c.table("results").select("email_id"), "email_id")}
            ids = [i for i in ids if i not in done]
        return ids[offset : offset + limit] if limit is not None else ids[offset:]

    def list_emails(self, category: str | None, status: str | None, limit: int, offset: int) -> list[dict]:
        cols = "category,status,review_reason,has_defect,defect_fields,decided_by,reviewed,processing_error"
        embed = "results!inner" if (category or status) else "results"
        q = self.c.table("emails").select(f"email_id,sender,subject,attachments,{embed}({cols})")
        if category:
            q = q.eq("results.category", category)
        if status:
            q = q.eq("results.status", status)
        rows = q.order("email_id").range(offset, offset + limit - 1).execute().data
        out = []
        for r in rows:
            res = r.pop("results", None)
            res = res[0] if isinstance(res, list) and res else (res or None)
            out.append({**r, "result": res})
        return out

    def upsert_result(self, result: dict) -> None:
        self.c.table("results").upsert({**result, "updated_at": now()}).execute()

    def get_result(self, email_id: str) -> dict | None:
        rows = self.c.table("results").select("*").eq("email_id", email_id).limit(1).execute().data
        return rows[0] if rows else None

    def all_results(self) -> list[dict]:
        return self._all(lambda: self.c.table("results").select("*"), "email_id")

    def review_queue(self) -> list[dict]:
        rows = (
            self.c.table("results")
            .select("*")
            .or_("status.eq.NEEDS_REVIEW,status.eq.ERROR")
            .eq("reviewed", False)
            .order("email_id")
            .execute()
            .data
        )
        return rows

    def add_review(self, review: dict) -> None:
        self.c.table("reviews").insert(review).execute()

    def list_reviews(self, email_id: str) -> list[dict]:
        return self.c.table("reviews").select("*").eq("email_id", email_id).order("id").execute().data

    def upsert_run(self, run: dict) -> None:
        self.c.table("runs").upsert(run).execute()

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

    def get_email(self, email_id):
        return self.emails.get(email_id)

    def list_email_ids(self, only_unprocessed=False, limit=None, offset=0):
        ids = sorted(i for i in self.emails if not (only_unprocessed and i in self.results))
        return ids[offset : offset + limit] if limit is not None else ids[offset:]

    def list_emails(self, category, status, limit, offset):
        rows = []
        for i in sorted(self.emails):
            e, res = self.emails[i], self.results.get(i)
            if (category or status) and res is None:
                continue
            if category and res["category"] != category or status and res["status"] != status:
                continue
            rows.append({k: e[k] for k in ("email_id", "sender", "subject", "attachments")} | {"result": res})
        return rows[offset : offset + limit]

    def upsert_result(self, result):
        self.results[result["email_id"]] = {**result, "updated_at": now()}

    def get_result(self, email_id):
        return self.results.get(email_id)

    def all_results(self):
        return [self.results[i] for i in sorted(self.results)]

    def review_queue(self):
        return [r for r in self.all_results() if r["status"] in ("NEEDS_REVIEW", "ERROR") and not r.get("reviewed")]

    def add_review(self, review):
        self.reviews.append({"id": len(self.reviews) + 1, "created_at": now(), **review})

    def list_reviews(self, email_id):
        return [r for r in self.reviews if r["email_id"] == email_id]

    def upsert_run(self, run):
        self.runs[run["id"]] = {**self.runs.get(run["id"], {}), **run}

    def latest_run(self):
        return max(self.runs.values(), key=lambda r: r.get("started_at", ""), default=None)

    def cache_get(self, key):
        return self.cache.get(key)

    def cache_put(self, key, response):
        self.cache[key] = response
