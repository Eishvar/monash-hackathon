# Spec — condensed from the problem statement, bundle README and scorer

## Context
A shipping-ops inbox mixes: document-check requests, new SI requests, invoice queries, general/ops updates, spam.
For a document check, compare the **Shipping Instruction (SI, the reference)** against the **draft Bill of Lading (BL)**
to catch wrong details before the BL is finalised.

Problems to solve: (1) finding the right emails takes time; (2) manual field comparison is repetitive and
error-prone; (3) the same field is labelled differently (`Port of Loading` vs `Load Port`), so align fields by meaning.

## Required capabilities
| Capability | Meaning |
|---|---|
| Classify | Tell the 5 categories apart. Only BL_COMPARISON continues to checking. |
| Extract | Read the SI + BL attachments and identify the 7 shipment fields. |
| Compare | Surface mismatched fields with SI and BL values side by side. |
| Ask for help | Escalate to a human with context instead of guessing or failing silently. |

**7 fields:** shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg.
Spec example: SI 3 containers / 22,000 kg vs BL 4 / 22,000 kg → flag only `container_count`, show `SI: 3 / BL: 4`.
All 7 match → report "No mismatch detected." The report must show which email was checked, whether there's a
mismatch, and exactly what needs attention.

## Advanced stage (where teams stand out; the dataset already contains these)
- PDF / Word / Excel attachments: tables, varied layouts.
- Scanned (image-only) PDFs: OCR or a vision LLM.
- Messy inputs: varied labels, formatting differences, misleading subjects, missing attachments. Must tell a real
  discrepancy from a reading or formatting issue.
- Reliability + human review: for unreadable docs, missing values or uncertain results, send the case for review
  **with source evidence and a reason**; a person confirms/corrects; **the report updates**. Processing failures are
  visible and can be retried.
- Accuracy = right requests + right discrepancies **without false alarms**.

## Output record (per email_id; every email must be present)
```json
{ "category": "BL_COMPARISON", "status": "MISMATCH", "review_reason": null,
  "has_defect": true, "defect_fields": ["consignee"], "decided_by": "rule" }
```
- `status`: OK | MISMATCH | NEEDS_REVIEW.
- `review_reason` (only when NEEDS_REVIEW): wrong_doc_type | missing_attachment | unreadable | missing_value.
- `decided_by` is optional: "rule" | "llm". The scorer reports "% resolved by rules (cost)", so the organizers track cost.

## Scoring (organizer scorer, `sdoc-hackathon-docker/server/scoring.py`)
- `final = 0.30·stage1_macroF1 + 0.20·stage3_defectF1 + 0.50·end_to_end`
- Stage 1: category accuracy / macro-F1 over 5 classes (a missing record counts as GENERAL).
- Stage 3: only gold BL_COMPARISON emails that are OK or MISMATCH. Email-level defect P/R/F1 + field-level F1.
- End-to-end (headline): gold defect emails where we routed to BL_COMPARISON, has_defect=true and
  **defect_fields exactly equal** the gold set.
- Reliability (diagnostic, not in final): escalation recall/precision on gold NEEDS_REVIEW (20 edge cases), per reason.
- Run: `python scripts/score.py` (wraps `server/score_cli.py`). Docker is not needed.

## Data access
`sdoc-hackathon-bundle/loader.py`: `Inbox(".")` iterates email dicts (`email_id, from, subject, body,
attachments[]`); `read_text(path)` / `read_bytes(path)` read attachments. Standard library only.
