# Presentation kit: slides, 4-minute demo script, submission text

Live app: https://monash-hackathon-five.vercel.app · Repo: https://github.com/Eishvar/monash-hackathon

---

## 0. Before you hit record (5 min)

1. **Gmail page → reset simulated mail** (the inbox currently shows 521 emails: one leftover simulated email). After the reset the tiles read **520 emails, 46 mismatches, 20 need review**.
2. Confirm **Review queue** shows 20 waiting and **Reviewed 0** (traces are filled in: reprocessed at score 1.0000).
3. Open these tabs in order so you never search on camera:
   `/` (Inbox) · `/emails/email_004` · `/review` · `/emails/email_516` · `/emails/email_512` · `/metrics` · `/api/py/docs`
4. Dark mode, browser zoom 100%, close notifications. Do one dry run of the email_516 review (step 4) and then press **Reprocess email** on it to undo (this also clears its reviewed flag).

---

## 1. Slide prompts (for Nano Banana)

Both prompts ask for a 16:9 image with **large, legible text** (the text renders small on a video). If a label comes out garbled, regenerate or fix that word in the slide editor.

### Slide A: Architecture and flow

> Create a clean, modern 16:9 technical architecture diagram on a dark charcoal background (#0B0B0C), thin white line icons, subtle rounded cards, generous spacing, sans-serif type (Inter style), all text large and crisp and spelled exactly as given. Title at top-left: "How every email is decided". Subtitle: "The LLM reads. Code decides."
>
> Left to right, five zones connected by thin arrows:
>
> ZONE 1 "Inbox" (a mail icon with a paperclip): "Email + attachments (PDF · Word · Excel · text)".
>
> ZONE 2 "Cascade" (the centre, largest zone; a horizontal row of rounded steps with small tags underneath each step):
> 1. "Parse" tag "corrupt / scan detection"
> 2. "Classify" tag "rules first, AI only if rules abstain"
> 3. "Extract 7 fields" tag "rules → AI gap-fill → vision AI for scans"
> 4. "Normalise + compare" tag "deterministic Python"
> 5. "Adjudicate" tag "AI can only clear a false mismatch"
> 6. "Decide" tag "deterministic Python"
> Colour code: steps that use AI (Classify fallback, Extract gap-fill / vision, Adjudicate) get a violet outline and a small "AI" badge; steps that are pure code (Parse, Normalise + compare, Decide) get a neutral grey outline with a "code" badge.
>
> ZONE 3 "Outcome" (three stacked pills): green "OK · No mismatch detected", red "MISMATCH · exact fields, SI: 3 / BL: 4", amber "NEEDS REVIEW · missing file, wrong document, unreadable, blank value".
>
> ZONE 4 "Human review" (green person icon): "Confirm or correct → verdict recomputed by the same code → audit trail". Draw an arrow from the amber pill into this zone and an arrow from this zone back to the outcome pills labelled "recomputed".
>
> Along the bottom, a wide strip "Cloud": on the left a card "Vercel: Next.js UI + FastAPI Python function", in the middle a card "Supabase: Postgres (emails, results, reviews, cache) + private Storage", on the right a card "OpenRouter: Gemini 2.5 Flash (text + vision)". Thin dotted lines from the cascade down to these three cards.
>
> A small legend at bottom-right: violet = AI, grey = code, green = human. A thin footer line: "88% of emails decided by rules with no AI call · every AI answer is schema-validated and cached · a failure degrades to the rule result, never silent".
>
> No stock photos, no gradients on text, no 3D. Flat, editorial, high contrast.

### Slide B: Tech stack

> Create a clean, modern 16:9 "tech stack" slide on a dark charcoal background (#0B0B0C), organised as five horizontal layers stacked top to bottom, each layer with a small left-aligned label and a row of rounded chips (icon + name). Large crisp sans-serif text, spelled exactly as given. Title: "Tech stack: why each piece".
>
> Layer 1 "Frontend": chips "Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "shadcn/ui". Caption: "Inbox · report · review queue · metrics".
>
> Layer 2 "Backend": chips "Python 3.12", "FastAPI", "Pydantic". Caption: "Pure, tested functions: parse · normalise · compare · decide".
>
> Layer 3 "AI": chips "OpenRouter", "Gemini 2.5 Flash (text)", "Gemini 2.5 Flash (vision)", "OpenAI-compatible client". Caption: "One client, model swapped in .env · JSON validated · cached · retried".
>
> Layer 4 "Documents": chips "pdfplumber", "pypdfium2", "python-docx", "openpyxl", "Pillow". Caption: "PDF · Word · Excel · text · scans".
>
> Layer 5 "Cloud and delivery": chips "Vercel (Python function)", "Supabase Postgres", "Supabase Storage", "GitHub Actions CI", "pytest". Caption: "Push to main → tests → deploy".
>
> Bottom strip with three big numbers: "1.000 organiser score", "0% false alarms on 500 held-out synthetic cases", "171 automated tests". Violet accent for AI chips, neutral for the rest. Flat, editorial, no photos, no 3D.

### Slide C (optional, only if you have 30 seconds): trust rules and honest limits

Text slide, no image needed. Put this on it:

**Why it is safe to let an AI read the documents**
- The AI may only **fill a field the rules left empty**, and must **quote evidence found in the document**
- The adjudicator can only **clear** a mismatch, never create one (similarity gate ≥ 0.95)
- Scans always go to a **human**; the vision model only suggests values
- Every answer is **schema-validated JSON**; email text is untrusted input; **code makes the final decision**

**What we did not hide**
- The provided dataset is rule-friendly (rules alone score 1.000), so we also measure **held-out** data: 500 synthetic SI/BL pairs with known answers (false alarms 0%) and unseen email wording (67% → 100%)
- One known miss: tonne values with decimals can differ by float rounding (fix = tolerance in `normalize.py`)
- The demo API is unauthenticated (roadmap: shared key, then real auth)

---

## 2. The 4-minute demo script (talk + click, in order)

Speak at a steady pace: about 550 words in total. **Bold = click / show.** Times are targets.

### 0:00 · Inbox (25 s)
**Show:** Inbox, point at the totals.
**Say:** "A shipping-documentation team gets hundreds of emails like this. Some ask to check a draft bill of lading against the shipping instruction, most are noise. Shippr triages every email and checks the seven fields, in the cloud. This is the organiser's dataset: 520 emails, all processed."

### 0:25 · A mismatch, and how it was decided (35 s)
**Do:** Filter **Status → Mismatch**, open **email_004**. Point at the **How this was decided** stepper, then the side-by-side fields.
**Say:** "Every email records how it was decided. Rules first, the AI only where rules abstain, and code makes the final call. Here two fields differ: consignee and notify party, with the shipping instruction on the left as the reference. Only the differing fields are flagged, because a false alarm is worse than no checker. The AI writes this summary, but it can never change the verdict."

### 1:00 · All clear (10 s)
**Do:** Open **email_001**.
**Say:** "And when everything matches: 'No mismatch detected.'"

### 1:10 · Review queue (20 s)
**Do:** **Review queue**. Point at the strip, then the groups.
**Say:** "The system refuses to guess. Twenty cases wait for a person, grouped by reason: missing file, wrong document, unreadable, or a blank value."

### 1:30 · Human review, live (55 s) ← the heart of the demo
**Do:** Open **email_516** (missing value). **Review values.** In *Gross weight (kg)* type `235,000 KG` into the **SI** box. Wait for the **Result after saving** box to flip to *Mismatch in: Gross weight*. Add note "checked against source". **Save corrections.** Scroll to **Review history**.
**Say:** "The SI weight was blank, so the system stopped. The reviewer types the value from the source document and sees the result before saving: it flips from Needs review to a mismatch in gross weight. That is recomputed by the same deterministic rules, the AI does not decide. Save, and the case shows 'Verified by a human reviewer', with a full audit trail: what changed and how the verdict moved."

### 2:25 · Scanned document (25 s)
**Do:** Open **email_512**. Point at the purple suggested-values notice and the values. **Do not save.**
**Say:** "Scanned files are never trusted blindly. A vision model reads the scan and pre-fills the values, and a person confirms them. OCR is imperfect, and you can see it here, so a human always has the last word."

### 2:50 · Metrics: proof (60 s)
**Do:** **Metrics.** Scroll: **Accuracy** → **Discrepancies** → **How emails are decided** → **Human in the loop**.
**Say:** "Accuracy, measured, not claimed. The organiser's scorer: 1.000. But that dataset is friendly to rules, so we also test data we never tuned on: five hundred synthetic pairs with known answers across four file formats: zero false alarms. And unseen email wording: sixty-seven percent with rules only, a hundred with the AI fallback. Below: which fields break most, and how every email was decided: 88 percent by rules with no AI call. And the human-in-the-loop numbers."

### 3:50 · Cloud and API (10 s)
**Do:** **/api/py/docs**.
**Say:** "It runs on Vercel and Supabase, and everything you saw is a REST API that an RPA bot or SAP can call today. Thank you."

**Timing check:** 25 + 35 + 10 + 20 + 55 + 25 + 60 + 10 = 240 s. If you run long, cut the all-clear step and the scan step down to one sentence each.

---

## 3. Two slides: how to use them

- Show **Slide A** when you say "rules first, AI only where rules abstain" (step 2), or put both slides at the start or end of the video, 15 s each: A: "The LLM reads, code decides. Violet steps use AI, grey steps are plain code, the human closes the loop." B: "One OpenAI-compatible client so the model is swapped in an env file; Vercel and Supabase for the cloud; every push runs 171 tests before it deploys."
- Slide C is the answer to "is 1.000 overfit?", so use it only if the judges get a Q&A.

---

## 4. Submission form: copy and paste

**1. Project name**
Shippr: SI vs Draft BL Verifier

**2. Project description / summary**
Shipping-documentation teams receive hundreds of emails a day: requests to check a draft Bill of Lading (BL) against the Shipping Instruction (SI), new SI submissions, invoice queries, noise and spam. Checking a BL means comparing seven fields by eye across PDF, Word, Excel and text attachments, where the same field has a dozen labels, and some files are wrong, corrupt or scanned. Shippr triages every email and, for BL comparisons, compares the SI (the reference) with the draft BL field by field, showing exactly what differs (e.g. "SI: 3 / BL: 4") or "No mismatch detected." It follows one principle: **the LLM reads, code decides.** A cascade of rules → LLM → vision LLM → human review reads messy documents; deterministic Python normalises, compares and sets the final status, so the AI cannot invent a mismatch, and the system escalates instead of guessing (missing file, wrong document, unreadable scan, blank value). A reviewer can correct a value, sees the recomputed verdict before saving, and every decision is audited. Every email records how it was decided, and the metrics page shows measured accuracy: 1.000 on the organiser's scorer, 0% false alarms on 500 held-out synthetic cases, and 67% → 100% on unseen email wording. It runs in the cloud (Vercel + Supabase, AI via OpenRouter) and exposes a REST API for RPA or SAP integration.

**3. GitHub repository**
https://github.com/Eishvar/monash-hackathon (README has setup instructions). **The repo is private: make it public first** (Settings → General → Danger Zone → Change visibility).

**4. Live prototype**
https://monash-hackathon-five.vercel.app

**5. Slides / documentation**
Documentation: https://github.com/Eishvar/monash-hackathon/blob/main/docs/DOCUMENTATION.md (architecture, implementation, challenges, roadmap; also public once the repo is public). Slides: upload your slides to Google Slides or Canva and set the link to "anyone with the link can view".

**6. Video demo**
Upload to YouTube (Unlisted is fine) or Google Drive (anyone with the link); max 5 minutes.

### Final checklist
- [ ] Repo public and README renders on GitHub (the badge and the Mermaid diagram)
- [ ] Live URL loads in a private window: inbox, an email report, `/metrics`
- [ ] Slides link opens without signing in
- [ ] Video link opens without signing in and is under 5:00
