# Plan — 2-day build (started 2026-09-19)

## Next session
M0–M4 done and verified in the cloud. The backend is complete: `https://monash-hackathon-five.vercel.app/api/py/*`
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
- [ ] **M5 UI**: inbox triage (category/status filters), email report (SI vs BL side by side + evidence +
      explanation), review queue (confirm/correct, retry), process-inbox progress, metrics page
- [ ] **M6 ship**: final deploy, README (problem, architecture diagram, score evidence, decisions, limits, roadmap),
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
