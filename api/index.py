"""FastAPI entry point, deployed as a Vercel Python function.

Keep this file thin: routes parse the request and call into `sdoc.service`.
All routes live under /api/py so Next.js can proxy them in dev (see next.config.ts) and vercel.json rewrites them in prod.
"""
import os
from functools import lru_cache

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field

from sdoc.ingest import MAX_TOTAL_BYTES
from sdoc.samples import SAMPLES, sample_pdf
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


class SimulateRequest(BaseModel):
    scenario: str = Field(max_length=30)


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
    names = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY")
    return {"status": "ok", "configured": {n: bool(os.getenv(n)) for n in names}, "vercel_env": os.getenv("VERCEL_ENV")}


@app.get("/api/py/emails")
def list_emails(category: str | None = Query(None, pattern="^[A-Z_]{1,20}$"), status: str | None = Query(None, pattern="^[A-Z_]{1,20}$"),
                limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), preview: bool = False,
                q: str | None = Query(None, max_length=100),
                svc: Service = Depends(get_service)):
    return svc.list_emails(category, status, limit, offset, preview, q=q)


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


@app.post("/api/py/reviews/{email_id}/preview")
def review_preview(email_id: str, req: ReviewRequest, svc: Service = Depends(get_service)):
    """Dry run: the verdict the corrections would produce. Nothing is saved."""
    return _call(svc.preview_review, email_id, req.corrections)


@app.get("/api/py/metrics/reviews")
def metrics_reviews(svc: Service = Depends(get_service)):
    return svc.review_stats()


@app.get("/api/py/metrics/pipeline")
def metrics_pipeline(svc: Service = Depends(get_service)):
    return svc.pipeline_stats()


@app.get("/api/py/export/submission")
def export_submission(include_extra: bool = False, svc: Service = Depends(get_service)):
    return svc.export_submission(include_extra)


@app.post("/api/py/gmail/simulate")
def simulate_email(req: SimulateRequest, svc: Service = Depends(get_service)):
    return _call(svc.simulate_email, req.scenario)


@app.delete("/api/py/gmail/simulated")
def reset_simulated(svc: Service = Depends(get_service)):
    return svc.reset_simulated()


@app.post("/api/py/upload")
def upload(files: list[UploadFile] = File(...), roles: list[str] = Form(default=[]), svc: Service = Depends(get_service)):
    """Multipart upload of PDFs (an exported email and/or SI / draft BL). Stores them, creates the email, processes it."""
    blobs = [(f.filename or "upload.pdf", f.file.read(MAX_TOTAL_BYTES + 1)) for f in files[:8]]
    return _call(svc.ingest_upload, blobs, roles)


@app.delete("/api/py/uploads")
def reset_uploads(svc: Service = Depends(get_service)):
    return svc.reset_uploads()


@app.get("/api/py/samples/{kind}")
def sample(kind: str):
    if kind not in SAMPLES:
        raise HTTPException(404, f"unknown sample {kind!r}")
    return Response(sample_pdf(kind), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{SAMPLES[kind]}"'})


@app.get("/api/py/export/csv")
def export_csv(svc: Service = Depends(get_service)):
    # utf-8 BOM so Excel opens it with the right encoding
    return Response("\ufeff" + svc.export_csv(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="shippr-discrepancies.csv"'})


@app.get("/api/py/metrics/routes")
def metrics_routes(svc: Service = Depends(get_service)):
    return svc.routes()


@app.get("/api/py/metrics/daily")
def metrics_daily(days: int = Query(14, ge=1, le=60), svc: Service = Depends(get_service)):
    return svc.processed_daily(days)


@app.get("/api/py/metrics")
def metrics(svc: Service = Depends(get_service)):
    return svc.metrics()
