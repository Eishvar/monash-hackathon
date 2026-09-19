# SDOC Verifier — Averis x Monash Hackathon 2026

Inbox triage + Shipping Instruction (SI) vs draft Bill of Lading (BL) discrepancy checker, built for
shipping-documentation teams (Averis Shipping Documentation Services, RGE group). **2-day build.**
**Start every session by reading `docs/PLAN.md`** (current milestone, score log, next steps).

## The job (full detail: docs/SPEC.md)
For EVERY email output one record (shape = `sdoc-hackathon-bundle/sample_submission.json`):
- `category`: `BL_COMPARISON | SI_REQUEST | INVOICE_QUERY | GENERAL | SPAM`
- BL_COMPARISON only → compare SI (the reference) vs BL on 7 fields:
  `shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg`
- `status`: `OK | MISMATCH | NEEDS_REVIEW`; `review_reason`: `wrong_doc_type | missing_attachment | unreadable | missing_value | null`
- `has_defect` (true iff MISMATCH); `defect_fields` = the EXACT set of differing fields; `decided_by`: `"rule" | "llm"`
- Other categories: `status OK, has_defect false, defect_fields []`.
- Score = 0.5·end-to-end (routed + exact defect fields) + 0.3·classification macro-F1 + 0.2·defect F1. **False alarms cost points.**
- UI: SI vs BL values side by side (e.g. `SI: 3 / BL: 4`); all 7 match → "No mismatch detected."

## How we win (docs/RUBRIC.md) — prioritise in this order
1. **Working core prototype (25/100)**: the end-to-end flow works reliably and is deployed. Never leave the main flow broken.
2. Architecture (15), Technology integration (15), Validation (15): clean modules, justified choices, measured accuracy.
3. Problem understanding, Innovation, Practical value (10 each).
**MANDATORY (heavy penalty if weak):** meaningful AI in core functionality + meaningful cloud infrastructure.

## Architecture (docs/ARCHITECTURE.md, rationale in docs/DECISIONS.md)
Cascade **rules → LLM → vision LLM → human review**. Principle: **"the LLM reads, code decides."**
LLMs: classify ambiguous emails, extract fields from messy/scanned docs, adjudicate candidate mismatches
(real vs formatting), write reviewer explanations. Field normalisation + final status are deterministic Python.
- Backend: Python 3.12-compatible package `sdoc/` + FastAPI in `api/index.py` (Vercel Python function, routes `/api/py/*`)
- Frontend: Next.js 16 + TypeScript + Tailwind in `src/` (built Day 2). Next 16 has breaking changes: before writing
  Next code, read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/`.
- Cloud: Vercel (compute, CI/CD) + Supabase (Postgres + Storage). Processing must run in the cloud, not only locally.
- LLM: one OpenAI-compatible client in `sdoc/llm.py`. Provider/model per task come from `.env`
  (Groq default, OpenRouter for vision). Never hardcode a provider or model name elsewhere.

## Layout
```
api/index.py        FastAPI entry (thin: routes only, calls sdoc/)
sdoc/               pipeline: config, llm, parse/, classify, extract, normalize, compare, decide, pipeline, db
scripts/            run_pipeline.py (→ outputs/submission.json), score.py (organizer scorer wrapper)
tests/              pytest (normalizers, compare, decide)
src/                Next.js UI
docs/               SPEC, RUBRIC, ARCHITECTURE, DECISIONS, DATA_NOTES, PLAN, WORKFLOW
sdoc-hackathon-bundle/   dataset (read-only input)
sdoc-hackathon-docker/   organizer kit incl. ANSWER KEY — gitignored, never read (see Rules)
```

## Commands (Windows PowerShell)
- Setup: `python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt; npm install`
- Pipeline: `python scripts/run_pipeline.py` → `outputs/submission.json`
- Score: `python scripts/score.py` (aggregate scores only)
- Tests: `pytest -q`
- Dev: `uvicorn api.index:app --reload --port 8000` + `npm run dev` (Next proxies `/api/py/*` to :8000)

## Rules
- **NEVER read anything in `sdoc-hackathon-docker/data_v2/`** (answer key + dataset generator). Score only via
  `scripts/score.py`. Never special-case email IDs or tune to specific answers; judges may use hidden data.
- Never bulk-read the bundle. Inspect data with small scripts that print summaries; open at most a few files.
- After any accuracy change: run pipeline + score, append the result to the score log in `docs/PLAN.md`.
- Parse/normalize/compare are pure functions with pytest coverage. All LLM calls go through `sdoc/llm.py`:
  JSON output validated by Pydantic, cached by content hash, retried with backoff. Failures are visible
  (status + reason), never silent.
- Record non-obvious choices (and any disagreement with the scorer) in `docs/DECISIONS.md`, one short entry each.
- Secrets only in `.env` (gitignored); keep `.env.example` in sync.
- End of session: tick `docs/PLAN.md`, write its "Next session" note, commit. Keep this file under 100 lines.
