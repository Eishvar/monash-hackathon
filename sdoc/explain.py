"""Reviewer-facing explanation (text only; never changes a status)."""
import json

from sdoc import prompts
from sdoc.decide import Decision
from sdoc.llm import LLM
from sdoc.schemas import ExplainOut


def explain(llm: LLM, d: Decision) -> str:
    payload = {
        "status": d.status,
        "review_reason": d.review_reason,
        "defect_fields": d.defect_fields,
        "fields": [{"field": r.field, "si": r.si, "bl": r.bl, "match": r.match} for r in d.fields],
    }
    if d.provisional:  # values read from scanned pages by the vision model; a human must confirm them
        payload["suggested_from_scan"] = [
            {"field": r.field, "si": r.si, "bl": r.bl, "match": r.match} for r in d.provisional
        ]
    return llm.complete_json("explain", prompts.EXPLAIN_SYSTEM, json.dumps(payload), ExplainOut).explanation
