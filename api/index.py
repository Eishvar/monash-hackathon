"""FastAPI entry point, deployed as a Vercel Python function.

Keep this file thin: routes parse the request and call into the `sdoc` package.
All routes live under /api/py so Next.js can proxy them in dev (see next.config.ts).
"""
from fastapi import FastAPI

app = FastAPI(title="SDOC Verifier API", docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")


@app.get("/api/py/health")
def health() -> dict:
    return {"status": "ok"}
