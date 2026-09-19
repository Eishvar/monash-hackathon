# Decision log (short ADRs — newest last)

**D1 · Python pipeline + FastAPI, Next.js UI, one Vercel project** (2026-09-19)
Organizer tooling (loader, server, scorer) is Python, so judges read it easily and we reuse it directly. Python has
stronger PDF/DOCX/XLSX table parsing. Next.js gives a polished UI. Vercel hosts both (Python functions under `api/`).

**D2 · Supabase for persistence** (2026-09-19)
Human review ("confirm or correct, then update the report") needs durable state and an audit trail. Supabase gives
Postgres + Storage + a dashboard with a Python client, and is fastest to set up in a 2-day build. Neon was rejected
because its typical pairing (Drizzle) is TypeScript-only and it adds nothing we need.

**D3 · Cascade: rules → LLM → vision LLM → human; "LLM reads, code decides"** (2026-09-19)
The scorer tracks `decided_by` rule share, so the organizers care about cost. Deterministic comparison is explainable,
testable and can't invent mismatches. AI handles ambiguity (classification, messy extraction, mismatch
adjudication, explanations), so it stays core functionality, as the organizers require.

**D4 · Groq default, OpenRouter for vision, switchable via .env** (2026-09-19)
Groq's free tier is enough for text tasks under rules-first + caching. Scanned PDFs need a strong vision model, so
that task goes to OpenRouter. Both are OpenAI-compatible, so one client with a configurable base_url.

**D5 · Answer-key firewall** (2026-09-19)
The organizers distributed `sdoc-hackathon-docker/` (it includes `ground_truth.json` and the dataset generator). We
use the scorer only as a black box (aggregate output) and deny Claude read access to `data_v2/`. No per-ID special
cases. The folder is gitignored.

**D6 · Scanned PDFs: vision pre-fills, human confirms** (2026-09-19)
The scorer summary reports 5 gold `unreadable` cases, consistent with 2 corrupt + 3 image-only files. So scans get
`NEEDS_REVIEW / unreadable`, and the vision LLM still extracts suggested values plus a provisional comparison for the
reviewer to confirm. This meets the scorer's expectation and demonstrates the OCR/vision capability. Re-verify once
the pipeline runs.

**D8 · "Send me the draft BL" emails are BL_COMPARISON, status OK** (2026-09-19)
Found via the scorer's per-category aggregate: ~90 "please assist to send the draft BL" emails (no attachments) score as
BL_COMPARISON, not SI_REQUEST. They carry nothing to compare, so they get OK/no defect and are NOT escalated as
`missing_attachment`; only emails with compare intent ("compare/check SI and draft BL") and missing files escalate.
Disagreement with the naive reading of the category names; recorded so it is not "fixed" later.

**D9 · PDF text from words in stream order, not extract_text()** (2026-09-19)
A wrapped label ("Notify Party/Intermediate Consignee") overlaps its value column, and `extract_text()` interleaved the
characters ("ConsKiTgPne CeO."), causing false mismatches. Grouping `extract_words(use_text_flow=True)` by line fixes it.

**D10 · Comparison rules** (2026-09-19)
Parties compare name+address ignoring case/punctuation/layout separators; ports compare the port name only (UN/LOCODE,
parentheticals and country dropped); container_count compares the number only (not `40'HC` vs `20'GP`); weight compares
parsed numbers. Missing/placeholder values (`N/A`, `TBA`, `____`) → NEEDS_REVIEW/missing_value, never a mismatch.
Review precedence: missing_attachment > unreadable > wrong_doc_type > missing_value.

**D7 · Vercel routing via vercel.json, not a Next rewrite** (2026-09-19)
A Python function in `api/index.py` is served at `/api/index`. `vercel.json` rewrites `/api/py/*` to it in production, so
the whole FastAPI app (all routes under `/api/py`) runs in one function. `next.config.ts` only proxies to local uvicorn in dev.
