# Demo and pitch kit

Live app: https://monash-hackathon-five.vercel.app · Repo: github.com/Eishvar/monash-hackathon (private; your call)

## 4-minute demo script
Tag = the rubric criterion the step earns (see `docs/RUBRIC.md`). Open the site on **Inbox** first.

| Time | Do | Say | Earns |
|---|---|---|---|
| 0:00 | Inbox. Point at the four tiles: 520/520 processed, 46 mismatches, 20 need review, 88% decided by rules. | "A documentation team gets 520 emails like this. Every one is triaged; BL comparisons are checked field by field, in the cloud." | Problem understanding |
| 0:30 | Click a subject that looks like a comparison but is not (e.g. filter **Category → SI request**). | "Subjects lie. We classify on the body and attachments." | Problem understanding |
| 0:50 | Filter **Status → Mismatch**, open **email_004**. | "Two fields need attention: consignee and notify party. SI on the left is the reference, draft BL on the right. Only differing fields are flagged. False alarms cost points." | Working prototype |
| 1:20 | Same page: read the explanation card. | "The explanation is AI-written, but the verdict is code. The AI reads, code decides; it can never change a status." | Innovation, Technology |
| 1:40 | Open **email_001**. | "All seven match: **No mismatch detected.**" | Working prototype |
| 2:00 | **Review queue**: show the groups by reason (missing attachment, unreadable, wrong doc type, missing value). | "We do not guess. Twenty cases wait for a person, with the reason." | Practical value |
| 2:20 | Open **email_512** (scanned PDF). Show the purple note, the suggested values, then correct two fields in the review panel and Save. | "The vision model read the scan; OCR is imperfect, so a human confirms. The status is recomputed by the same deterministic code and logged." Scroll to **Audit trail**. | Technology, Practical value |
| 3:00 | **Process** page (do not run it: everything is cached and processed). | "This drives the cloud pipeline: Vercel functions, Supabase, batches inside the serverless time limit." | Cloud (mandatory) |
| 3:15 | **Metrics**: rule share, LLM calls, cost, then **Validation**. | "Rules alone score 1.000 on the dataset, so we also tested unseen wording: 67% with rules only, 100% with AI. We report what is tuned and what is measured." | Validation |
| 3:45 | Close on the README diagram (or `/api/py/docs`). | "An RPA bot or SAP can call this REST API today. Roadmap: auth, attachment preview, mailbox write-back." | Practical value |

After the demo, reset the demo data if you changed anything: open **email_512** and press **Reprocess** (this also clears its
reviewed flag). The audit row stays as history; it is a genuine record of the demo.

## Pitch notes (2 minutes)
1. **Problem.** Checking a draft BL against an SI is manual, repetitive and error-prone; the inbox hides the requests among noise; the same field has a dozen labels; some documents are scans.
2. **Solution.** A cascade: rules → LLM → vision LLM → human. AI reads messy inputs; deterministic code normalises, compares and decides; a person resolves what the system will not guess.
3. **Proof.** 1.000 on the organiser's scorer with 88% of emails needing no AI; 67% → 100% on unseen phrasings; 126 tests in CI; the run was reproduced in the cloud from the database.
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
