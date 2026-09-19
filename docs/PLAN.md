# Plan — 2-day build (started 2026-09-19)

## Next session
M0 and M1 are done; the rules-only baseline already scores 1.000 locally, so the local score is saturated. The
risk now is **generalisation to hidden data** (rules were tuned on this bundle's phrasing and label variants), and
the mandatory "meaningful AI" requirement. M2 should therefore:
- build `sdoc/llm.py` (provider switch, cache, Pydantic validation, retries) and use the LLM where rules abstain:
  `classify()` returns `matched=False` for unmatched emails; extraction gaps; scanned PDFs (vision, D6);
  adjudication of candidate mismatches (real vs formatting); reviewer explanations;
- stress-test the rules against unseen phrasings/formats (write extra pytest cases with synthetic variants) rather
  than tuning to the bundle;
- still open: user must add Supabase + Groq/OpenRouter keys to `.env` (see User TODO).
Suggested opening prompt: "Read docs/PLAN.md and do M2. Plan first."

## User TODO (accounts, can't be automated)
- [x] Install GitHub CLI + `gh auth login` (binary at `C:\Program Files\GitHub CLI\gh.exe`, not on PATH in Claude's shell)
- [x] Create a **private** GitHub repo and push
- [x] Vercel: import the repo, confirm the first deploy works
- [ ] Supabase: create a free project; copy URL + service role key into `.env`
- [ ] Groq API key + OpenRouter API key into `.env`

## Milestones
### Day 1 — backend
- [x] **M0 local**: git, answer-key lockdown, CLAUDE.md + docs, Next.js + FastAPI skeleton
- [x] **M0 cloud**: GitHub repo, hello-world deploy of Next.js + `/api/py/health` on Vercel (de-risks the Python function)
      — repo github.com/Eishvar/monash-hackathon (private); live at https://monash-hackathon-five.vercel.app (health verified)
- [x] **M1 parse + rules** (score 1.000 on the local bundle, 7 pytest tests): parsers for txt/docx/xlsx/pdf + corrupt/scan detection; label-alias extractor; normalizers;
      compare; decide; rule classifier → first `submission.json` + score (baseline, no LLM)
- [ ] **M2 AI layer**: `sdoc/llm.py` (provider switch, cache, Pydantic validation, retries); LLM classify fallback;
      LLM extract fallback; vision for scans; mismatch adjudicator; explanations → re-score
- [ ] **M3 tests + validation**: pytest for normalizers/compare/decide; metrics (rule share, LLM calls, latency, cost)
- [ ] **M4 cloud backend**: Supabase schema + seed (emails + attachments to Storage); FastAPI endpoints; cloud batch
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
