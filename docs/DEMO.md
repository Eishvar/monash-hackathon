# Demo and pitch kit

Live app: https://monash-hackathon-five.vercel.app · Repo: github.com/Eishvar/monash-hackathon 

## 4-minute demo script
The current script (order, clicks and talking points) lives in [PRESENTATION.md](PRESENTATION.md). It uses the same claims as the README and [DOCUMENTATION.md](DOCUMENTATION.md).

## Pitch notes (2 minutes)
1. **Problem.** Checking a draft BL against an SI is manual, repetitive and error-prone; the inbox hides the requests among noise; the same field has a dozen labels; some documents are scans.
2. **Solution.** A cascade: rules → LLM → vision LLM → human. AI reads messy inputs; deterministic code normalises, compares and decides; a person resolves what the system will not guess.
3. **Proof.** 1.000 on the organiser's scorer with 88% of emails needing no AI; 67% → 100% on unseen phrasings; 171 tests in CI; the run was reproduced in the cloud from the database.
4. **AI and cloud.** Five AI uses (classify, extract, vision, adjudicate, explain) behind one swappable client; Vercel functions + Supabase Postgres/Storage + GitHub → Vercel CI/CD.
5. **Roadmap.** Auth, attachment preview, confidence and region highlighting, queue-based processing, RPA/SAP webhook.

## Likely questions
- **"Is 1.000 overfit?"** Partly by construction: the dataset is rule-friendly and we tuned on it. That is why we built the unseen-phrasing test (67% → 100%), the synthetic stress tests, and we say so in the README.
- **"Why not just use an LLM for everything?"** Cost, speed, explainability, and false alarms. A deterministic comparison cannot invent a mismatch; 88% of emails need no AI call; every AI answer is cached.
- **"What if an email tries to prompt-inject the model?"** The model only returns schema-validated JSON; values must quote evidence found in the document; code makes the decision and the adjudicator can only clear, never create, a mismatch.
- **"Cost?"** Cold vision calls for the whole dataset cost about $0.009; repeat runs cost $0 (content-hash cache).
- **"What happens when the AI fails?"** It degrades to the rule result, the failure is recorded, and a failed email is a visible, retryable `ERROR`.
- **"Why OpenRouter?"** One API key and one OpenAI-compatible client for every task (text and vision) with Gemini 2.5 Flash; the model is swapped through `.env`.
- **"Security?"** Keys only in server environment variables; Supabase row-level security on with no public policies and a private bucket; request sizes capped. Known gap: the demo API is unauthenticated (roadmap: shared key, then real auth).

## Five-slide outline
1. The problem (inbox mix, 7 fields, dozen labels, scans, false alarms) 2. The cascade diagram and "the LLM reads, code decides"
3. Live demo screenshot: SI vs BL report 4. Evidence: score table, 67% → 100%, cost, tests 5. Cloud + roadmap.

## Submission checklist (yours to do)
- [ ] Record the demo video from the script above (about 4 minutes).
- [ ] Decide repo visibility: it is **private**. If judges must open it, make it public (a secrets scan of tracked files and history was clean on the day of writing; re-run `git log --all -S"gsk_"` style checks if you add keys).
- [ ] Confirm the live URL loads: inbox, an email report, `/metrics`.
- [ ] Fill in whatever the organisers' submission form asks (links to the live app, repo, video).
