# Plan — 2-day build (started 2026-09-19)

## Next session
**UI redesign (gameplan.md) done 2026-09-22**: sidebar shell, dark default, inbox table, split-panel email page + Review Activity drawer, review queue, metrics route map (`src/lib/ports.ts`, `ShippingRouteMap.tsx`), floating Operator Guide. Backend is OpenRouter-only (D19). **Gmail view (2026-09-22):** `/gmail` has a Simulate inbound email menu (5 scenarios, D20). **Process page (2026-09-22):** PDF upload -> `/upload` (D21). **Still to do (backend + UI):** CSV export (`/export/csv`) + JSON export buttons (wire the disabled Export button on the Inbox), manual upload endpoint + upload panel on Process, Gmail ingestion route (user does the Google OAuth setup afterwards).

## Previous notes
**All milestones M0–M6 are done.** Remaining work is yours (Claude cannot do it): (1) record the ~4-minute demo video from
`docs/DEMO.md`; (2) the repo is **private** — decide whether judges need it public before submitting (tracked files and git
history contained no keys when checked; only `.env.example` is tracked; re-check if you add anything); (3) submit the live URL,
repo and video wherever the organisers ask. If you touch the code again: `pytest -q`, `npm run lint`, `npx tsc --noEmit`,
`npm run build`; CI runs the same on every push.
UI is in `src/` (pages: `/`, `/emails/[id]`, `/review`, `/process`, `/metrics`); dev = `uvicorn api.index:app --port 8000`
+ `npm run dev`. Reprocessing an email resets its `reviewed` flag (documented on the Process page).
Earlier note, backend state: M0–M4 done and verified in the cloud. The backend is complete: `https://monash-hackathon-five.vercel.app/api/py/*`
(docs at `/api/py/docs`) serves emails/results from Supabase; `python scripts/cloud_run.py --reprocess` reprocessed all 520
emails on Vercel (747 s, 6 cold vision LLM calls ≈ $0.009, 125 cache hits) and the exported submission scored **1.0000**.
Next is **M5 (UI)**: Next.js 16 in `src/` (read `AGENTS.md` + `node_modules/next/dist/docs/` first; the frontend-design
plugin is recommended). Screens: inbox triage with category/status filters, email report (SI vs BL side by side like
`SI: 3 / BL: 4`, "No mismatch detected.", evidence, explanation, provisional scan values), review queue
(confirm/correct -> `POST /reviews/{id}`), process-inbox progress (`POST /process-batch`), metrics page (`GET /metrics`).
Then M6 (README, CI, demo). Models are swapped via `.env`, never in code.
Known small issues: `norm_port` on scan OCR keeps the country when there is no comma ("NHAVA SHEVA INDIA" vs
"NHAVA SHEVA, INDIA" -> provisional mismatch; irrelevant to scoring). Cloud batches take 12-50 s per 15 emails
(Supabase round-trips); the API is unauthenticated (README limitation).
Suggested opening prompt: "Read docs/PLAN.md and do M5. Plan first."

## User TODO (accounts, can't be automated)
- [x] Install GitHub CLI + `gh auth login` (binary at `C:\Program Files\GitHub CLI\gh.exe`, not on PATH in Claude's shell)
- [x] Create a **private** GitHub repo and push
- [x] Vercel: import the repo, confirm the first deploy works
- [x] Supabase project + URL/service key in `.env`; Groq + OpenRouter keys in `.env`
- [x] **M4 step 1:** run `supabase/schema.sql` in Supabase dashboard -> SQL Editor -> New query -> Run
- [x] **M4 step 2:** Vercel project -> Settings -> Environment Variables: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `GROQ_API_KEY`, `OPENROUTER_API_KEY` (Production), then redeploy

## Milestones
### Day 1 — backend
- [x] **M0 local**: git, answer-key lockdown, CLAUDE.md + docs, Next.js + FastAPI skeleton
- [x] **M0 cloud**: GitHub repo, hello-world deploy of Next.js + `/api/py/health` on Vercel (de-risks the Python function)
      — repo github.com/Eishvar/monash-hackathon (private); live at https://monash-hackathon-five.vercel.app (health verified)
- [x] **M1 parse + rules** (score 1.000 on the local bundle, 7 pytest tests): parsers for txt/docx/xlsx/pdf + corrupt/scan detection; label-alias extractor; normalizers;
      compare; decide; rule classifier → first `submission.json` + score (baseline, no LLM)
- [x] **M2 AI layer** (score 1.000 with LLM; 88% rule share; 18 pytest tests; repeat run = 0 LLM calls, 3.5 s): `sdoc/llm.py` (provider switch, cache, Pydantic validation, retries); LLM classify fallback;
      LLM extract fallback; vision for scans; mismatch adjudicator; explanations → re-score
- [x] **M3 tests + validation** (114 tests at that point): stress tests over txt/docx/xlsx x 3 label vocabularies, unit/suffix
      normalisation, `tests/data/paraphrases.json` (36 unseen phrasings: rules-only 67% -> rules+LLM 100%), `sdoc/metrics.py`,
      `scripts/evaluate.py` -> `outputs/metrics.json` (bundle: rules-only 1.000 vs rules+LLM 1.000; the bundle is rule-friendly,
      the paraphrase set is the generalisation evidence)
- [x] **M4 cloud backend** (124 tests; seeded; cloud run exported 520 records, score 1.0000): Supabase schema + seed (emails + attachments to Storage); FastAPI endpoints; cloud batch
      processing; review → recompute → audit

### Day 2 — frontend + submission (new session; install the frontend-design plugin first)
- [x] **M5 UI** (built + browser-verified locally against live Supabase at desktop and phone width, light/dark; lint, tsc, build, 125 pytest green; review round-trip and process loop exercised, test data reverted): inbox triage (category/status filters), email report (SI vs BL side by side + evidence +
      explanation), review queue (confirm/correct, retry), process-inbox progress, metrics page
- [x] **M6 ship** (README, CI green on GitHub Actions, docs/DEMO.md, security + code review fixes D18, 133 tests): final deploy, README (problem, architecture diagram, score evidence, decisions, limits, roadmap),
      GitHub Actions running pytest, demo script / video, pitch notes

## Score log (python scripts/score.py)
| When | Change | Final | S1 macro-F1 | S3 defect-F1 | E2E | Escalation R/P | Rule % |
|---|---|---|---|---|---|---|---|
| 09-19 | sample_submission (all GENERAL) | 0.012 | 0.041 | 0.000 | 0/46 | 0/20 | – |
| 09-19 | M1 first run: parsers + rules, "send draft BL" put in SI_REQUEST | 0.940 | 0.849 | 0.98 | 45/46 | 19/20 | 100% |
| 09-19 | "send/issue draft BL" → BL_COMPARISON (OK, nothing to compare); scam-spam terms; placeholder blanks (`____MT`, `TBA`) | 0.980 | 0.982 | – | 45/46 | 20/20 | 100% |
| 09-19 | PDF words in stream order (wrapped label overlapped value); SI_REQUEST narrowed to "shipping instruction for" | 1.000 | 1.000 | 1.000 | 46/46 | 20/20 | 100% |
| 09-20 | M2 first LLM run (Groq qwen3.8-27b + Gemini 2.5 Flash vision): LLM classifies the 60 unmatched emails | 0.9946 | 0.982 | 1.000 | 46/46 | 20/20 | 88% |
| 09-20 | Prompt: bulk "reminder to submit SI" is GENERAL; rate-limit backoff; token caps; scan explanations | 1.000 | 1.000 | 1.000 | 46/46 | 20/20 | 88% (63 LLM) |
| 09-20 | M4: processed via API into Supabase (local uvicorn), export from the DB | 1.000 | 1.000 | 1.000 | 46/46 | 20/20 | 88% |
| 09-20 | M4: reprocessed on the deployed Vercel app + Supabase (`cloud_run.py --reprocess`), export from the DB | 1.000 | 1.000 | 1.000 | 46/46 | 20/20 | 88% |
| 09-22 | Groq removed: all text + vision on OpenRouter `google/gemini-2.5-flash` (local run, 85 LLM calls, 0 failures) | 1.000 | 1.000 | 1.000 | 46/46 | 20/20 | 88% |
| 09-22 | Held-out synthetic benchmark, rules only (`scripts/benchmark.py`, n=500, seed 7; 4 formats x 3 label vocabularies, planted defects) | – | – | defect F1 0.999 (P 0.997, R 1.000) | exact 99.8% (499/500) | escalation R/P 1.0/1.0, reasons 100% | false-alarm rate 0.0%; 1 miss = float rounding `16.1 MT` vs `16,100 KG` (known limit, decision logic untouched) |
| 09-22 | Held-out synthetic benchmark, rules + LLM (`--llm --n 80`, 6 LLM calls, cache cold) | – | – | defect F1 0.988 (P 0.977, R 1.000) | exact 98.8% (79/80) | escalation R/P 1.0/1.0 | false-alarm rate 0.0%; same MT rounding case |
