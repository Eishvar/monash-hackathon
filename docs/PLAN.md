# Plan — 2-day build (started 2026-09-19)

## Next session
Start M0-cloud (needs the user's accounts, see "User TODO"), then M1. Suggested opening prompt:
"Read docs/PLAN.md and do M1. Plan first."

## User TODO (accounts, can't be automated)
- [ ] Install GitHub CLI: `winget install GitHub.cli`, then `gh auth login`
- [ ] Create a **private** GitHub repo and push (Claude can do it once gh is logged in)
- [ ] Vercel: import the repo (or `vercel link`), confirm the first deploy works
- [ ] Supabase: create a free project; copy URL + service role key into `.env`
- [ ] Groq API key + OpenRouter API key into `.env`

## Milestones
### Day 1 — backend
- [x] **M0 local**: git, answer-key lockdown, CLAUDE.md + docs, Next.js + FastAPI skeleton
- [ ] **M0 cloud**: GitHub repo, hello-world deploy of Next.js + `/api/py/health` on Vercel (de-risks the Python function)
- [ ] **M1 parse + rules**: parsers for txt/docx/xlsx/pdf + corrupt/scan detection; label-alias extractor; normalizers;
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
