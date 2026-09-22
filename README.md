# Shippr: SI vs Draft BL Verifier (SDOC Verifier)

[![CI](https://github.com/Eishvar/monash-hackathon/actions/workflows/ci.yml/badge.svg)](https://github.com/Eishvar/monash-hackathon/actions/workflows/ci.yml)

**Inbox triage + Shipping Instruction (SI) vs draft Bill of Lading (BL) discrepancy checker** for shipping-documentation
teams. Built for the Averis x Monash Hackathon 2026 (Averis Shipping Documentation Services, RGE group).

**Live app: https://monash-hackathon-five.vercel.app** · API docs: `/api/py/docs` · **[Technical documentation](docs/DOCUMENTATION.md)** · [Demo script and slides](docs/PRESENTATION.md)

## The problem

A shipping-documentation inbox mixes five kinds of email: requests to check a draft BL against the SI, new SI submissions,
invoice queries, operational noise and spam. Checking a BL means comparing seven fields by eye across PDF, Word, Excel and
text attachments, where the same field is labelled a dozen ways (`Load Port`, `POL`, `Port of Loading (POL)`). The data is
full of traps: subjects that mislead, attachments that are the wrong document, corrupt or scanned files, blank values.
A checker that cries wolf is worse than none: **false alarms cost points**.

## What it does

For every email it outputs one record: a **category**, and for BL comparisons a **status**
(`OK` / `MISMATCH` / `NEEDS_REVIEW`), the **exact set of differing fields**, and why it escalated when it will not guess.
The UI shows SI and BL values side by side (`SI: 3 / BL: 4`), or **"No mismatch detected."**, and lets a person
confirm or correct a value; the reviewer **sees the recomputed verdict before saving**, the status is recomputed by the same
deterministic code, and an audit row is written. Every email also records **how it was decided** (which stage ran, rule / AI /
code, how long).

Try it (2 minutes): open the inbox, filter **Status → Mismatch** and open `email_004` (the "How this was decided" stepper and the
side-by-side fields); open `email_001` for the all-clear case; open the **Review queue**, then `email_516` (a blank SI weight):
type a value and watch **Result after saving** change before you save; open `email_512` (a scanned PDF) to see AI-suggested
values; finish on **Metrics** (accuracy, discrepancies, cascade funnel, human in the loop).

## How it works

```mermaid
flowchart LR
    E[Email + attachments<br/>Supabase Postgres + Storage] --> P[Parse<br/>txt · docx · xlsx · pdf<br/>corrupt / scan detection]
    P --> C{Classify}
    C -- "rule fires" --> R[Rules]
    C -- "rules abstain" --> L[Text LLM<br/>OpenRouter]
    R --> X[Extract 7 fields<br/>label aliases]
    L --> X
    X -- "gap in a field" --> L2[LLM gap-fill<br/>evidence must be quoted]
    X -- "scanned PDF" --> V[Vision LLM<br/>OpenRouter]
    X --> N[Normalise + compare<br/>deterministic Python]
    L2 --> N
    N -- "near-identical values" --> A[LLM adjudicator<br/>can only clear a mismatch]
    N --> D[Decide status<br/>deterministic Python]
    A --> D
    V --> H
    D -- "OK / MISMATCH" --> O[Report + audit trail]
    D -- "unreadable / missing / wrong type / blank" --> H[Human review<br/>confirm or correct → recompute]
    H --> O
```

Plain text: `parse → classify (rules → LLM) → extract (rules → LLM → vision) → normalise/compare → decide → human review`.

**Principle: the LLM reads, code decides.** AI classifies ambiguous emails, extracts from messy or scanned documents,
adjudicates near-identical values and writes reviewer explanations. Normalisation and the final status are deterministic,
tested Python. The trust rules that make that safe:

- An LLM value may only **fill a field the rules left empty**, must **quote evidence found verbatim in the document**,
  and is never accepted for a placeholder (`____`, `N/A`, `TBA`), so genuine `missing_value` cases still escalate.
- The adjudicator is gated by typo-level similarity (≥ 0.95) and can only **clear** a mismatch, never create one.
- Explanations never change a status. Scanned documents stay `NEEDS_REVIEW / unreadable` and the vision model's values are
  *suggestions* for a human to confirm.
- Email bodies are untrusted input: every LLM answer is schema-validated JSON, and code, not the model, makes the decision.
- An LLM failure degrades to the rule result and is recorded (never silent); a failed email becomes a visible, retryable `ERROR`.

## Results

Scored with the organiser's scorer (aggregate output only; the answer key is never read). The final row was reproduced
**in the cloud**: all 520 emails reprocessed on Vercel + Supabase and exported from the database.

| When | Change | Final score | End-to-end | Escalations | Decided by rules |
|---|---|---|---|---|---|
| start | sample submission (everything "GENERAL") | 0.012 | 0/46 | 0/20 | – |
| M1 | parsers + rules, no AI | 0.940 | 45/46 | 19/20 | 100% |
| M1 | classifier + placeholder + PDF fixes | **1.000** | 46/46 | 20/20 | 100% |
| M2 | + LLM tier (text, vision, adjudicator) | **1.000** | 46/46 | 20/20 | 88% |
| M4 | processed **in the cloud** (Vercel + Supabase), exported from the database | **1.000** | 46/46 | 20/20 | 88% |
| final | reprocessed in the cloud with the decision trace enabled (821 s, 0 errors, about $0.03 cold) | **1.000** | 46/46 | 20/20 | 88% |

- **Honest caveat.** The provided dataset is friendly to rules (rules alone also score 1.000), and the rules and prompts were
  tuned on it, one finding (`send me the draft BL` is a BL_COMPARISON) from the scorer's aggregate output
  ([decision D8](docs/DECISIONS.md)). A perfect local score is not a promise about hidden data.
- **So we measure generalisation separately.** 36 hand-written emails in different wording (none from the dataset):
  classification accuracy **67% with rules only → 100% with rules + LLM**. A test also asserts that a rule never fires wrongly
  on that set: rules abstain rather than guess, and the LLM covers the rest.
- **Held-out benchmark with known answers** (`python scripts/benchmark.py`). 500 random SI/BL pairs generated by
  `sdoc/synth.py` in txt, docx, xlsx and pdf with three label vocabularies: equivalent formatting (`LIMITED` = `LTD`,
  `22 MT` = `22,000 KG`), planted defects, one-word near-miss names, blanks, wrong documents, missing and corrupt files.
  Result: **0.0% false alarms**, 99.8% exact match, defect precision 0.997 / recall 1.000, escalation precision and recall 1.0.
  The one miss is a real limit we did not hide: tonne values with decimals can differ by float rounding (`16.1 MT` vs
  `16,100 KG`); the fix is a tolerance in `sdoc/normalize.py`.
- **Robustness tests.** The same generators back the pytest stress tests: identical content is never flagged; changing one
  field flags exactly that field; blanks and wrong document types escalate.
- **Cost and speed.** 88% of emails are decided by rules with no AI call. Every LLM response is cached by content hash
  (disk + a `llm_cache` table), so a repeat run makes **0 LLM calls** (520 emails in about 3.5 s locally). The cloud run's 6 cold
  vision calls cost ≈ **$0.009**. Cloud batches of 15 emails take 12-50 s (database round-trips); a full cloud reprocess of
  520 emails takes about 14 minutes.
- **171 automated tests** run in CI on every push (Python 3.12) alongside the frontend's lint, type-check and build.

## Requirements map

| Requirement | Where it is |
|---|---|
| **AI in core functionality** | Email classification fallback, field extraction fallback, vision extraction for scans, mismatch adjudication, reviewer explanations (`sdoc/llm.py`, `classify.py`, `extract.py`, `adjudicate.py`, `explain.py`). Models are swappable through `.env`. |
| **Cloud infrastructure** | Pipeline runs as a **Vercel Python function** (FastAPI); emails, attachments, results, review audit trail and LLM cache live in **Supabase** (Postgres + private Storage); inference via OpenRouter (Gemini 2.5 Flash); GitHub → Vercel deploys on every push. |
| Architecture and decisions | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md) (22 short records) |
| Validation | Score log above, held-out benchmark, `scripts/evaluate.py` (ablation + unseen phrasings), 171 tests, `/metrics` page |
| Practical value | REST API an RPA bot or SAP could call, audit trail, human-in-the-loop review, cost metrics |

## Run it locally (Windows PowerShell)

```powershell
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt; npm install
copy .env.example .env          # add OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (rules-only runs need no keys)

python scripts/run_pipeline.py            # -> outputs/submission.json (add --no-llm for rules only)
python scripts/score.py                   # organiser's scorer, aggregate numbers
pytest -q                                 # 171 tests, no keys needed
python scripts/benchmark.py               # held-out synthetic benchmark (rules only, seconds)

# cloud-backed app: run supabase/schema.sql once in the Supabase SQL editor, then
python scripts/seed_supabase.py           # emails, attachments, warm LLM cache
uvicorn api.index:app --port 8000         # API
npm run dev                               # UI on :3000, proxies /api/py/* to :8000
python scripts/cloud_run.py               # drive the deployed API over the whole inbox, export and score
python scripts/evaluate.py                # ablation + unseen-phrasing accuracy -> outputs/metrics.json
```

**Swap a model** without touching code: set `LLM_TEXT_MODEL`, `LLM_VISION_MODEL` (or per task, e.g. `LLM_MODEL_CLASSIFY`)
in `.env`. Defaults live in one block in `sdoc/config.py`. See `.env.example`.

## API (`/api/py`, interactive docs at `/api/py/docs`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness and which settings are configured (booleans only) |
| GET | `/emails?category&status&limit&offset&q` | Inbox with each email's result; `q` searches ID, subject, sender |
| GET | `/emails/{id}` | Email, result (side-by-side fields, explanation, notes), audit trail |
| POST | `/process/{id}` | Process or retry one email |
| POST | `/process-batch` | Process a small batch (≤ 50) inside the serverless time budget |
| GET | `/review-queue` | Cases waiting for a person |
| POST | `/reviews/{id}` | `confirm` / `correct` values → status recomputed + audit row |
| POST | `/reviews/{id}/preview` | Dry run: the verdict the corrections would produce (writes nothing) |
| GET | `/metrics/reviews` | Human-in-the-loop counts, verdict changes, recent reviews |
| GET | `/metrics/pipeline` | Cascade funnel (rules / AI / vision / human) and per-stage latency |
| GET | `/export/csv` | Mismatches and escalations as a spreadsheet |
| GET | `/export/submission` | Every email in the scorer's exact JSON shape |
| GET | `/metrics` | Counts, rule share, LLM calls, tokens, estimated cost |

## Limits and roadmap

- Known limit: tonne values with decimals can differ by float rounding (see Results); the fix is a comparison tolerance.
- **The API is unauthenticated** (a deliberate demo trade-off). Roadmap: a shared-key header on write routes, then real
  authentication with per-team access. Request sizes are already capped, and repeat calls hit the cache.
- No attachment preview in the UI yet (needs signed Storage URLs). Values come from the parsed documents.
- OCR on scans is imperfect (`STATIONERYLLC`), which is why scans always go to a human. Roadmap: field-level confidence and
  highlighting the region on the page.
- Cloud throughput is bounded by per-email database round-trips and LLM rate limits; a queue and batch writes would
  remove both. Single-tenant data model.
- Integrations: an inbound webhook so an RPA bot or SAP can push new emails, and a write-back of the verdict to the mailbox.

## Repository layout

```
api/index.py     FastAPI routes (thin), deployed as a Vercel Python function
sdoc/            pipeline: config, llm, parse/, classify, extract, normalize, compare, decide, adjudicate,
                 explain, pipeline, trace, synth, service, db, store, metrics
src/             Next.js 16 UI: inbox, email report, review panel, review queue, process, metrics, Gmail-style demo view
supabase/        schema.sql (tables, RLS on, private bucket created by the seed script)
scripts/         run_pipeline, score, evaluate, benchmark, seed_supabase, cloud_run, eval_extraction
tests/           pytest: parsers, normalisers, compare/decide, AI layer with fakes, stress, API, unseen phrasings
docs/            DOCUMENTATION, PRESENTATION, ARCHITECTURE, DECISIONS, SPEC, DATA_NOTES, RUBRIC, PLAN, DEMO
```

Built in two days with Claude Code (plan-first milestones, documented in `docs/PLAN.md`).
