# Judging rubric — preliminary round (100 pts) + our evidence plan

Bands: 10-pt criteria → Excellent 8–10 | 15-pt → 12–15 | 25-pt → 19–25. Judges score only what is
**demonstrated, submitted or clearly explained**, and never reward the same evidence twice.

| # | Criterion | Pts | "Excellent" means | Our evidence |
|---|---|---|---|---|
| 1 | System Design & Architecture | 15 | Coherent, well justified, backed by the prototype | ARCHITECTURE.md diagram, DECISIONS.md log, clean module boundaries |
| 2 | **Working Core Prototype** | **25** | Core flow works reliably end to end; the main technical idea is clearly built | Deployed app: inbox → classify → extract → compare → report → human review, on all 520 emails |
| 3 | Technology Integration | 15 | Deep, seamless use of modern tech, strong craftsmanship | LLM cascade (OpenRouter, Gemini 2.5 Flash), vision for scans, FastAPI + Next.js, Supabase, Vercel CI/CD |
| 4 | Technical Feasibility & Validation | 15 | Critical assumptions validated with clear evidence; credible path to completion | Score log (organizer scorer), pytest suite, per-field accuracy, cost/latency per email, known limits |
| 5 | Problem Statement Understanding | 10 | Strong understanding of the problem, context and why it matters | Built for the Averis Shipping Documentation Services workflow; handles every trap in the data |
| 6 | Innovation & Solution Approach | 10 | Original, well justified, clear advantage | "LLM reads, code decides" cascade; source-evidence quotes; AI mismatch adjudication; rule-share cost metric |
| 7 | Practical Value & Potential | 10 | Strong value with a credible path to wider use | REST API an RPA bot or SAP could call; audit trail; time saved per email; roadmap |

## Mandatory organizer requirements (weak = significantly reduced score)
- **AI integration:** AI must be part of core functionality, development or deployment. Ours: classification of
  ambiguous emails, extraction from messy/scanned docs, mismatch adjudication, reviewer explanations.
  Claude Code is also used in development.
- **Cloud infrastructure:** must be meaningfully integrated. Ours: pipeline runs on Vercel serverless functions;
  data, attachments and review audit trail in Supabase Postgres + Storage; LLM inference APIs; GitHub → Vercel CI/CD.
  A static page showing locally computed JSON would NOT count.
