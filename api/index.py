"""FastAPI entry point, deployed as a Vercel Python function.

Keep this file thin: routes parse the request and call into `sdoc.service`.
All routes live under /api/py so Next.js can proxy them in dev (see next.config.ts) and vercel.json rewrites them in prod.
"""
import os
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from sdoc.service import BadRequest, NotFound, Service, build_service

app = FastAPI(title="SDOC Verifier API", docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")


@lru_cache
def _service() -> Service:
    return build_service()


def get_service() -> Service:
    try:
        return _service()
    except RuntimeError as exc:  # missing Supabase configuration
        raise HTTPException(503, str(exc)) from exc


class BatchRequest(BaseModel):
    ids: list[str] | None = Field(default=None, max_length=50)  # small caps: the API is open, and each email may call an LLM
    limit: int = Field(default=10, ge=1, le=50)
    only_unprocessed: bool = True
    run_id: str | None = Field(default=None, max_length=64)


class ReviewRequest(BaseModel):
    action: str  # confirm | correct
    corrections: dict[str, dict[str, str | None]] = Field(default={}, max_length=7)  # {field: {"si": "...", "bl": "..."}}
    note: str | None = Field(default=None, max_length=500)


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except NotFound as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except BadRequest as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/py/health")
def health() -> dict:
    # Which settings are present (booleans only, never values): makes a misconfigured deployment self-diagnosing.
    names = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY")
    return {"status": "ok", "configured": {n: bool(os.getenv(n)) for n in names}, "vercel_env": os.getenv("VERCEL_ENV")}


@app.get("/api/py/emails")
def list_emails(category: str | None = Query(None, pattern="^[A-Z_]{1,20}$"), status: str | None = Query(None, pattern="^[A-Z_]{1,20}$"),
                limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), svc: Service = Depends(get_service)):
    return svc.list_emails(category, status, limit, offset)


@app.get("/api/py/emails/{email_id}")
def email_detail(email_id: str, svc: Service = Depends(get_service)):
    return _call(svc.email_detail, email_id)


@app.post("/api/py/process/{email_id}")
def process(email_id: str, svc: Service = Depends(get_service)):
    return _call(svc.process, email_id)


@app.post("/api/py/process-batch")
def process_batch(req: BatchRequest, svc: Service = Depends(get_service)):
    return _call(svc.process_batch, req.ids, req.limit, req.only_unprocessed, req.run_id)


@app.get("/api/py/review-queue")
def review_queue(svc: Service = Depends(get_service)):
    return svc.review_queue()


@app.post("/api/py/reviews/{email_id}")
def review(email_id: str, req: ReviewRequest, svc: Service = Depends(get_service)):
    return _call(svc.review, email_id, req.action, req.corrections, req.note)


@app.get("/api/py/export/submission")
def export_submission(svc: Service = Depends(get_service)):
    return svc.export_submission()


@app.get("/api/py/metrics")
def metrics(svc: Service = Depends(get_service)):
    return svc.metrics()
