"""FastAPI entry point, deployed as a Vercel Python function.

Keep this file thin: routes parse the request and call into `sdoc.service`.
All routes live under /api/py so Next.js can proxy them in dev (see next.config.ts) and vercel.json rewrites them in prod.
"""
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

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
    ids: list[str] | None = None
    limit: int = 10
    only_unprocessed: bool = True
    run_id: str | None = None


class ReviewRequest(BaseModel):
    action: str  # confirm | correct
    corrections: dict[str, dict[str, str | None]] = {}  # {field: {"si": "...", "bl": "..."}}
    note: str | None = None


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except NotFound as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except BadRequest as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/py/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/py/emails")
def list_emails(category: str | None = None, status: str | None = None, limit: int = 50, offset: int = 0,
                svc: Service = Depends(get_service)):
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
