# Plan — 2-day build (started 2026-09-19)

## Next session
M0–M3 done; M4 code is written, tested (124 pytest) and deployed, but **blocked on two user steps** (below).
Then: (1) `python scripts/seed_supabase.py`; (2) run the API locally against Supabase (`uvicorn api.index:app --port 8000`,
`python scripts/cloud_run.py --base http://127.0.0.1:8000`); (3) once Vercel env vars are set, `python scripts/cloud_run.py`
against the deployed app and confirm the exported submission scores ~1.000; (4) review round-trip on a scan case
(email_512–514: `POST /api/py/reviews/{id}`); (5) log results here + DECISIONS, tick M4. Supabase-specific code
(`SupabaseRepo.list_emails` embedding/filters, `SupabaseStore`, upserts) is verified only by fakes so far.
Then M5 (UI). Models are swapped via `.env` (see `.env.example`), never in code.
Suggested opening prompt: "Read docs/PLAN.md and finish M4 (schema applied, env vars set), then M5. Plan first."

## User TODO (accounts, can't be automated)
- [x] Install GitHub CLI + `gh auth login` (binary at `C:\Program Files\GitHub CLI\gh.exe`, not on PATH in Claude's shell)
- [x] Create a **private** GitHub repo and push
- [x] Vercel: import the repo, confirm the first deploy works
- [x] Supabase project + URL/service key in `.env`; Groq + OpenRouter keys in `.env`
- [ ] **M4 step 1:** run `supabase/schema.sql` in Supabase dashboard -> SQL Editor -> New query -> Run
- [ ] **M4 step 2:** Vercel project -> Settings -> Environment Variables: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
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
- [ ] **M4 cloud backend** (code done + deployed, 124 tests; needs user steps 1-2 above, then seed + cloud verification): Supabase schema + seed (emails + attachments to Storage); FastAPI endpoints; cloud batch
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
