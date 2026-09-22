# Final sprint â€” validation, architecture, human review, metrics (2 hours)

Written 2026-09-22 for the executing agent. Every item is picked because it maps to a rubric criterion in
`docs/RUBRIC.md` (Validation 15, Architecture 15, Working prototype 25) and to what the judges said matters:
**showing human review, accuracy and discrepancy metrics clearly**.

## 0. Rules for the executing agent (read first, 5 min)

1. Read `CLAUDE.md` and `AGENTS.md`. Next.js 16 has breaking changes: read the relevant guide in
   `node_modules/next/dist/docs/` before writing Next code. UI style must match the existing components
   (`src/components/ui.tsx`: `Card`, `KpiTile`, `Bar`, `StatusPill`, `FieldChip`, `PageHeader`; `ResultPanel.tsx`:
   `Section`, `Collapsible`). No new npm dependencies.
2. **Do not change** the decision logic: `classify.py`, `normalize.py`, `compare.py`, `decide.py`, `adjudicate.py`,
   prompts. This is a showcase sprint, not an accuracy sprint. The score must stay 1.000.
3. **Never read `sdoc-hackathon-docker/data_v2/`.** Score only via `python scripts/score.py`.
4. **Do NOT run `scripts/evaluate.py`**: it rewrites `src/data/validation.json` without the `bundle.scores` block
   that `AccuracyCard.tsx` imports, which breaks the build. The new benchmark writes its own file.
5. Work phase by phase in the order below. **After each phase:** `pytest -q`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`; if green, commit (one commit per phase). Pushing to `main` deploys to Vercel, so only push
   green commits. If a phase overruns its time box by more than 10 minutes, cut its "stretch" items and move on.
   Phases 1â€“3 are MUST; Phase 4 is SHOULD.
6. Do not edit README/ARCHITECTURE/DECISIONS prose (the user updates docs separately). Do append the benchmark
   result row to the score log in `docs/PLAN.md` and tick this file's checkboxes.

Baseline before starting: `pytest -q` green; `python scripts/run_pipeline.py` + `python scripts/score.py` = 1.0000
(LLM cache is warm, so this costs nothing).

---

## Phase 1 â€” Human review you can demo (MUST, 35 min) Â· Working prototype, Practical value, Innovation

**Problem found:** `GET /emails/{id}` already returns `reviews` (the audit trail), but the redesigned UI renders
it nowhere; `docs/DEMO.md` step 2:20 says "scroll to Audit trail", and that section no longer exists. After a
review, nothing on the page shows that a human changed the verdict. And the reviewer cannot see what their
correction will do before saving.

### 1a. Backend: dry-run preview + review stats
`sdoc/service.py`:
- Split `review()` into a pure helper `_recompute(result, corrections) -> dict` (the existing code that builds
  `values`, calls `decide()`, returns the updated fields) and keep all validation as is.
- Add `preview_review(email_id, corrections) -> dict`: same validation as `review()` (field names, sides,
  ERROR-without-corrections rule), calls `_recompute`, **writes nothing**, returns
  `{status, review_reason, has_defect, defect_fields, fields}`.
- Add `review_stats() -> dict` over all review rows:
  ```
  {"total": n, "confirmed": n, "corrected": n,
   "verdict_changed": n,              # before.status != after.status
   "transitions": {"NEEDS_REVIEWâ†’MISMATCH": n, "NEEDS_REVIEWâ†’OK": n, ...},
   "fields_corrected": {"consignee": n, ...},   # field where before/after si or bl value differs
                                                # (if before.fields is empty â€” scan/provisional case â€” count every
                                                #  field whose after value is non-null as "entered")
   "queue_open": n,                    # results NEEDS_REVIEW/ERROR and not reviewed (reuse metrics logic)
   "recent": [ {email_id, subject, action, before_status, after_status, note, created_at} ] (latest 8)}
  ```
`sdoc/db.py`: add `all_reviews() -> list[dict]` to the `Repository` protocol, `SupabaseRepo`
(`self._all(lambda: self.c.table("reviews").select("*"), "id")`) and `MemoryRepo`.

`api/index.py` (thin routes, reuse `ReviewRequest`'s `corrections` shape):
- `POST /api/py/reviews/{email_id}/preview` â†’ `svc.preview_review`
- `GET /api/py/metrics/reviews` â†’ `svc.review_stats`

Tests in `tests/test_service_api.py`: preview returns the recomputed status and leaves the result row and the
`reviews` list unchanged; `review_stats` counts a confirm, a correction and a NEEDS_REVIEWâ†’MISMATCH transition.

### 1b. UI: live "what happens if you save"
`src/components/ReviewPanel.tsx`: when `corrections` changes, debounce ~350 ms and `POST .../preview`
(set state only inside the async callback; ignore errors quietly). Above the buttons show a box:
- title "Result after saving" + `StatusPill`, then: MISMATCH â†’ "Mismatch in:" + `FieldChip`s;
  NEEDS_REVIEW â†’ the reason text (`REASON_LABEL`); OK â†’ "No mismatch detected."
- a small line "Recomputed by the same deterministic rules as the pipeline â€” the AI does not decide."
- when nothing has changed yet, show the current status instead of calling the API.

### 1c. UI: review history + human-verified state on the email page
`src/app/emails/[id]/page.tsx`:
- Add a `Section` titled **"Review history (audit trail)"** under the field comparison whenever
  `data.reviews.length > 0`. For each review (newest first): action badge (Confirmed / Corrected), date-time,
  `StatusPill before` â†’ `StatusPill after`, the note, and for corrections a compact list
  `Consignee (BL): "old" â†’ "new"` computed by diffing `before.fields` vs `after.fields`
  (extend the `Review` type in `src/lib/api.ts`: `before/after` also carry `defect_fields` and `fields`).
- `src/components/ResultPanel.tsx` `VerdictCard`: when `result.reviewed`, show a badge "Verified by a human
  reviewer" and, if the latest review changed the status, "Status changed from X to Y by review".

### 1d. UI: human-in-the-loop strip on the Review queue page
`src/app/review/page.tsx`: under the header, a row of 4 `KpiTile`s from `/metrics/reviews`: **Waiting for a
person** (queue_open), **Reviewed** (total), **Corrections made** (corrected), **Verdicts changed by humans**
(verdict_changed). Below the groups, a small "Recently reviewed" list from `recent` linking to each email.

- [x] Phase 1 done (tests + lint + tsc + build green, committed)

---

## Phase 2 â€” Held-out benchmark with known answers (MUST, 35 min) Â· Validation

**Why:** the organiser dataset is rule-friendly (rules alone score 1.000), and the only held-out test covers
classification. Judges asked for accuracy evidence. We generate SI/BL pairs whose correct answer is known by
construction and measure the comparison engine on them: precision/recall per field, the false-alarm rate, and
escalation accuracy.

### 2a. `sdoc/synth.py` (new) â€” move the generators out of the tests
- Move `BASE`, `CHANGED`, `LABELS`, `NOISE`, `build_txt`, `build_docx`, `build_xlsx`, `BUILDERS` from
  `tests/test_stress.py` into `sdoc/synth.py`; `tests/test_stress.py` imports them back from there
  (`tests/test_service_api.py` imports `BASE, CHANGED, LABELS, build_txt` from `tests.test_stress`: keep that working).
- Add `build_pdf(title, labels, values)` using `sdoc.samples.text_pdf(lines)` (text-layer PDF, same line layout
  as `build_txt`). Add `"pdf"` to `BUILDERS`. Verify with one quick `read_document` round-trip; if PDF parsing
  of a generated file does not recover all 7 fields in 10 minutes of trying, drop PDF from the benchmark and say
  so in the output (`"formats_excluded"`).
- Value pools (seeded `random.Random(seed)`): ~8 parties (name + 2 address lines), ~8 ports written as
  `"NAME, COUNTRY (LOCODE)"`, counts 1â€“12 with a container type, weights 5,000â€“250,000 kg.
- `equivalent_variant(field, value, rng)`: ONLY formatting changes the spec treats as equal (D10/D14):
  parties: title-case, `LIMITED`â†”`LTD`, `&`â†”`AND`, `;` vs newline vs `,` address separators;
  ports: drop country and/or LOCODE; counts: `"4 x 40'HC"` â†’ `"Four (4) x 40'HC"` / `"4 X 40'HC"`;
  weights: `"96,420 KG"` â†’ `"96420 KGS"` / `"96,420.00 KG"` / `"96.42 MT"`.
- `real_change(field, value, rng)`: a different party/port from the pool, count Â±1â€“3, weight Â±(1â€“5,000) kg.
- `make_case(i, rng) -> dict` with `case_type` drawn from this mix:
  | case_type | share | construction | expected |
  |---|---|---|---|
  | `clean` | 40% | BL = SI + 1â€“4 equivalent variants | OK, [] |
  | `defect` | 35% | 1â€“3 real changes (+ maybe variants on other fields) | MISMATCH, exact set |
  | `near_miss` | 5% | one party changed by one word (`ACME TRADING`â†’`ACME TRADERS`) | MISMATCH, [field] |
  | `blank` | 7% | one BL field `""`/`N/A`/`TBA`/`____` | NEEDS_REVIEW, missing_value |
  | `wrong_doc` | 5% | BL title `COMMERCIAL INVOICE` / `PACKING LIST` | NEEDS_REVIEW, wrong_doc_type |
  | `missing` | 4% | only the SI attached | NEEDS_REVIEW, missing_attachment |
  | `unreadable` | 4% | BL is `b"%PDF-1.4\n" + random bytes` or `simulate._scan_pdf(...)` | NEEDS_REVIEW, unreadable |
  SI and BL each get a random label vocabulary (A/B/C) and a random format.
  Returns `{id, case_type, format_si, format_bl, files: {name: bytes}, attachments, expected: {status, review_reason, defect_fields}}`.

### 2b. `scripts/benchmark.py` (new)
```
python scripts/benchmark.py                 # rules only, n=500, seed=7 (deterministic, seconds)
python scripts/benchmark.py --llm --n 80    # + LLM tier (adjudicator matters for near_miss); uses the cache
```
- For each case: `Pipeline(llm, store=MemoryStore(case["files"])).compare(case["attachments"], notes=[])`
  (call `compare`, NOT `process_email`: classification is covered elsewhere and this avoids explanation calls).
  Time each call.
- Report (write `outputs/benchmark.json` in full, and a compact copy to **`src/data/benchmark.json`**, committed):
  ```
  {"generated", "seed", "n", "mode": "rules" | "rules+llm",
   "exact_match_rate",            # status + review_reason + exact defect set all correct (= scorer's end-to-end idea)
   "false_alarm_rate",            # expected OK/NEEDS_REVIEW but predicted MISMATCH  â† the scorer penalises this
   "defect": {"precision", "recall", "f1"},                 # micro over (case, field) pairs
   "per_field": {field: {"precision", "recall", "f1", "support"}},
   "escalation": {"precision", "recall", "reason_accuracy"},
   "per_case_type": {type: {"n", "exact"}}, "per_format": {fmt: {"n", "exact"}},
   "confusion": {expected_status: {predicted_status: n}},
   "latency_ms": {"p50", "p95"}}
  ```
  The full file also lists the first 20 failures (case id, expected, got) for debugging.
- Print a one-screen summary.
- **If failures appear:** spend at most 10 minutes. Do not edit decision logic (rule 2). Record them honestly
  as known limits in the output (`"known_limits": [...]`); honest numbers beat a suspicious 100%.

### 2c. Test + log
- `tests/test_benchmark.py`: n=80, seed=1, rules only: assert `false_alarm_rate == 0` and every `clean` case is OK
  (the product's core promise). Only assert what the benchmark actually achieves.
- Run `python scripts/benchmark.py` (and, if the key is in `.env`, `--llm --n 80`; expected cost is cents).
  Append rows to the score log in `docs/PLAN.md` (label them "held-out synthetic benchmark").

- [x] Phase 2 done

---

## Phase 3 â€” Metrics page that tells the story (MUST, 30 min) Â· Validation, Architecture, Problem understanding

Current `/metrics` shows three cards + the route map; accuracy is hidden behind a dropdown and discrepancy
counts (`metrics.defect_fields`, `review_reasons`) are computed by the API but **not shown at all**.

### 3a. Backend: cascade funnel (from existing columns, no schema change)
`Service.pipeline_stats()` + `GET /api/py/metrics/pipeline`, reading
`all_results("email_id,category,status,review_reason,decided_by,reviewed,provisional_fields")`
(add `trace` to the columns in Phase 4):
```
{"funnel": {"emails": n, "decided_by_rules": n, "needed_ai": n,
            "bl_comparisons": n, "ok": n, "mismatch": n, "needs_review": n,
            "vision_used": n,                 # provisional_fields non-empty
            "human_reviewed": n},
 "stages": {}}                                 # filled in Phase 4
```
Test in `tests/test_service_api.py`.

### 3b. UI: new sections on `src/app/metrics/page.tsx` (keep the existing top row and the map)
Order below the existing row:
1. **"Accuracy â€” measured, not claimed"**: three cards side by side.
   - *Organiser scorer* (`src/data/validation.json` â†’ `bundle.scores`): Final 1.000, classification macro-F1,
     defect F1, end-to-end 46/46, escalations 20/20. Caption: "Official scorer, 520 emails".
   - *Held-out benchmark* (`src/data/benchmark.json`): exact-match rate, **false-alarm rate** (big),
     defect precision / recall, n cases. Caption: "Synthetic SI/BL pairs with known answers, never seen in
     tuning: 4 formats, 3 label vocabularies, planted defects".
   - *Unseen email wording* (`validation.json` â†’ `paraphrases`): 67% rules only â†’ 100% rules + AI.
   Under them, a compact per-field table from `benchmark.json.per_field` (field, precision, recall, support).
   Also add a third view "Held-out benchmark" to the dropdown in `AccuracyCard.tsx`.
2. **"Discrepancies found"**: from `/metrics` â†’ `defect_fields` as horizontal `Bar`s (tone `bad`, labels via
   `FIELD_LABEL`, sorted desc), plus `review_reasons` as `Bar`s (tone `warn`, labels via `REASON_LABEL`), plus
   KPI tiles: mismatch emails, fields flagged in total, escalated to a person. Add `defect_fields` and
   `review_reasons` to the `Metrics` TS type if missing.
3. **"How every email was decided"**: the cascade as a horizontal funnel/stepper from `/metrics/pipeline`:
   `Emails n â†’ Rules decided x% â†’ AI needed y â†’ BL comparisons z â†’ OK / Mismatch / Needs review â†’ Vision-read
   scans v â†’ Human reviewed h`. Caption: "Rules first, AI where rules abstain, code makes every final decision,
   a person resolves what the system will not guess."
4. **"Human in the loop"**: the same four tiles as the review queue (reuse a small component) + "Verdicts changed
   by humans" transitions list.

Keep it readable at phone width (grid collapses to one column). Status colours always paired with text.

- [x] Phase 3 done

---

## Phase 4 â€” Decision trace per email (SHOULD, 25 min) Â· Architecture, Technology integration

Shows the cascade *running*: every result records which stage ran, how (rule / AI / cache / code) and how long it took.

### 4a. `sdoc/trace.py` (new)
```python
class Trace:
    """Records pipeline stages: {stage, method, ms, ...detail}. Reads LLM usage deltas to mark AI calls / cache hits."""
    def __init__(self, llm=None): ...
    @contextmanager
    def step(self, stage: str, method: str = "rule", **detail): ...   # yields the record dict; caller may set rec["method"]
```
On exit set `ms` (perf_counter), and if `llm.usage` exists add `llm_calls` / `cache_hits` deltas when non-zero.

### 4b. Wire into `sdoc/pipeline.py` (behaviour must not change)
`process_email` creates `self._trace = Trace(self.llm)` (also default one in `__init__` so `compare()` works alone).
Steps: `classify` (method `rule`, or `llm` when the fallback ran; detail `category`), `parse` per document
(detail `role`, `format`, `fields_found` n/7, `unreadable`), `extract_llm` (only when it runs; `filled`),
`vision` (only for scans), `compare_decide` (method `code`; `status`), `adjudicate` (only when candidates exist;
`cleared`), `explain` (only when it runs). Put `details["trace"] = self._trace.steps`.
`service.result_row` adds `"trace": res.details.get("trace", [])`.

### 4c. Storage without breaking prod
- `supabase/schema.sql`: append `alter table results add column if not exists trace jsonb not null default '[]';`
  (the **user** runs this line in the Supabase SQL editor).
- Add `trace` to `RESULT_COLUMNS` in `sdoc/db.py`. **Safety net:** in `SupabaseRepo.upsert_result`, if the upsert
  raises an error whose text mentions `trace`, retry once without the `trace` key and remember that
  (`self._no_trace = True`). Processing must never fail because the column is missing. Unit-test with a fake
  client that raises on `trace`.
- `pipeline_stats()` (Phase 3) gains `"stages": {stage: {"count", "by_method": {...}, "p50_ms", "p95_ms"}}` from
  results that have a trace, plus `"traced": n`.

### 4d. UI
- Email page: a `Section` **"How this was decided"** under the verdict: a horizontal stepper of chips, one per
  trace step, e.g. `Classify Â· rule Â· 1 ms` â†’ `Parse SI Â· rule Â· 7/7 fields` â†’ `Vision Â· AI Â· 2.1 s` â†’
  `Compare + decide Â· code` â†’ `Explain Â· AI Â· cached`, and a final `Human review` chip if `reviews.length`.
  AI steps use the existing `ai` colour tokens (`bg-ai-bg text-ai`), code/rule neutral. Hide the section if
  `trace` is empty (older rows). Add `trace?: TraceStep[]` to the `Result` TS type.
- Metrics "How every email was decided" section: add a small table of stage latency (p50/p95) and method mix
  when `stages` is non-empty.

### 4e. Re-score
Pipeline code changed, so: `python scripts/run_pipeline.py` + `python scripts/score.py` must still be 1.0000;
log it in `docs/PLAN.md`.

- [x] Phase 4 done

---

## Phase 5 â€” Ship (10 min)
- [x] All checks green; `git push` (Vercel deploys main).
- [ ] Tell the user the manual steps below.

## Out of scope (do not start)
Parallel LLM calls, background queue/pg_cron, auth, attachment preview, doc prose updates.

---

## For the user (after the agent finishes)

### Manual steps (about 15 min, mostly waiting)
1. Supabase â†’ SQL Editor: run
   `alter table results add column if not exists trace jsonb not null default '[]';`
   (only if Phase 4 was done).
2. Wait for the Vercel deploy to finish, open `/api/py/health`.
3. Populate traces for all emails (cache is warm, â‰ˆ $0; takes ~10â€“15 min):
   `python scripts/cloud_run.py --reprocess` â€” it prints the score; confirm 1.0000.
   Note: reprocessing clears `reviewed` flags, so **do the demo reviews after this step**.
4. Before recording: simulate one "scan" email on `/gmail` so the queue has a fresh vision case.

### New demo flow for the video (human review + metrics, ~4 min)
| Time | Show | Say |
|---|---|---|
| 0:00 | Inbox | "520 emails triaged in the cloud; BL comparisons are checked field by field." |
| 0:25 | Mismatch email â†’ **How this was decided** stepper | "Every stage is recorded: rules first, AI only where rules abstain, code decides." |
| 0:55 | Field comparison `SI: 3 / BL: 4` + AI summary | "Exact fields, side by side. The AI explains; it never sets the verdict." |
| 1:20 | **Review queue**: tiles + groups by reason | "The system refuses to guess. These cases wait for a person, with the reason." |
| 1:40 | Open a **missing value** case â†’ Review values â†’ type the blank value; the **Result after saving** box flips from *Needs review* to *Mismatch in consignee* (or *No mismatch*) | "The reviewer sees the effect before saving, recomputed by the same deterministic rules." |
| 2:15 | Save â†’ **Human verified** badge + **Review history** with before â†’ after and the field diff | "Every human decision is audited: who changed what, and how the verdict moved." |
| 2:35 | Open the scanned email â†’ vision values â†’ confirm | "Scans: the vision model pre-fills, a human confirms." |
| 2:55 | **Metrics â†’ Accuracy**: scorer 1.000, **held-out benchmark** (false-alarm rate), unseen wording 67% â†’ 100% | "We measure on data we never tuned on â€” and false alarms are the number we watch most." |
| 3:25 | **Discrepancies found** + **How every email was decided** + **Human in the loop** | "Which fields break most, how much needed AI, how many verdicts humans changed." |
| 3:50 | `/api/py/docs` | "All of this is a REST API an RPA bot or SAP can call." |



