# Architecture

## Flow
```
            ┌────────────── Vercel (serverless) ──────────────┐
 Supabase   │ FastAPI  /api/py/*   (Python, sdoc/ package)    │    LLM APIs (OpenAI-compatible)
 Storage ──►│ 1 Parse  → 2 Classify → 3 Extract → 4 Compare    │◄──► Groq (text) / OpenRouter (vision)
 (emails,   │   txt/docx/  rules→LLM    rules→LLM   normalize   │
 attach.)   │   xlsx/pdf,              →vision     →adjudicate │
            │   scan detect                         → 5 Decide │
            └───────────────┬──────────────────────────────────┘
                            ▼
                  Supabase Postgres: results, reviews (audit), runs
                            ▲
            Next.js UI (Vercel): inbox triage · SI vs BL report · review queue · metrics
```
Local path (for fast iteration): `scripts/run_pipeline.py` runs the same `sdoc/` code over the bundle and writes
`outputs/submission.json`, then `scripts/score.py` scores it.

## Stages (all in `sdoc/`)
1. **Parse** (`parse/`): file → `DocText{text, tables, method: text|vision, error}`. Detects corrupt files
   (→ unreadable) and image-only PDFs (→ render pages to PNG for the vision LLM).
2. **Classify** (`classify.py`): rule scorer over body intent phrases, attachment presence/names and spam signals.
   Confident → `decided_by="rule"`. Ambiguous → LLM with JSON output → `decided_by="llm"`.
3. **Extract** (`extract.py`): verify doc type (title/keywords, LLM fallback) → label-alias parser
   (`FIELD_ALIASES`) produces the 7 fields, each with a source-evidence snippet. LLM fallback for missing or
   low-confidence fields; vision LLM for scans. LLM values must quote evidence that exists in the source text.
4. **Compare** (`normalize.py`, `compare.py`): per-field normalisers (party name, port/UN-LOCODE, container count
   incl. table rows, weight in kg incl. tonnes and row sums) → `equal | format_diff | mismatch | uncertain`.
   `uncertain` pairs (e.g. near-identical party names) go to the LLM adjudicator: real discrepancy vs formatting.
5. **Decide** (`decide.py`): not a comparison → done; <2 docs → missing_attachment; unparseable → unreadable;
   wrong type → wrong_doc_type; a required value blank → missing_value; else OK / MISMATCH + exact defect_fields.
   An LLM writes a short reviewer explanation for MISMATCH and NEEDS_REVIEW.
6. **Human review**: reviewer confirms or corrects field values → re-run Decide → result updated + audit row.
   Failed processing is stored as a visible state and can be retried.

## Data model (Supabase)
- `emails` (id, sender, subject, body, attachments jsonb)
- `documents` (email_id, role SI|BL, storage_path, format, parse_status, parse_method, text)
- `results` (email_id PK, category, status, review_reason, has_defect, defect_fields, decided_by,
  fields jsonb {field: {si, bl, si_evidence, bl_evidence, verdict}}, explanation, run_id, reviewed, updated_at)
- `reviews` (id, email_id, action confirm|correct, before jsonb, after jsonb, note, created_at) — audit trail
- `runs` (id, started_at, finished_at, provider, models, stats jsonb, score jsonb)

## API (`api/index.py`, prefix `/api/py`)
`GET /health` · `GET /emails?category&status` · `GET /emails/{id}` · `POST /process/{id}` (process / retry) ·
`POST /process-batch` (small batches; the UI loops for the full inbox) · `GET /review-queue` ·
`POST /reviews/{id}` · `GET /export/submission` · `GET /metrics` (counts, rule share, LLM calls, latency)
