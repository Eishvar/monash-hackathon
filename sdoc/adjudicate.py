"""Adjudicate near-identical mismatches: real discrepancy vs formatting (LLM), gated by deterministic similarity."""
from difflib import SequenceMatcher

from sdoc import prompts
from sdoc.compare import FieldResult
from sdoc.llm import LLM
from sdoc.normalize import NORMALIZERS
from sdoc.schemas import AdjudicateOut

TEXT_FIELDS = ("shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge")
SIMILARITY_GATE = 0.95  # typo-level; genuinely different names (~0.75-0.92) never reach the LLM


def similarity(field: str, si: str | None, bl: str | None) -> float:
    a, b = NORMALIZERS[field](si), NORMALIZERS[field](bl)
    return SequenceMatcher(None, str(a), str(b)).ratio() if a and b else 0.0


def candidates(results: list[FieldResult]) -> list[FieldResult]:
    return [
        r
        for r in results
        if r.field in TEXT_FIELDS and not r.match and not r.missing and similarity(r.field, r.si, r.bl) >= SIMILARITY_GATE
    ]


def cleared_fields(llm: LLM, results: list[FieldResult]) -> set[str]:
    """Fields the LLM judges to be formatting-only differences (only they can clear a mismatch)."""
    cleared = set()
    for r in candidates(results):
        user = f"Field: {r.field}\nSI value: {r.si}\nBL value: {r.bl}"
        out = llm.complete_json("adjudicate", prompts.ADJUDICATE_SYSTEM, user, AdjudicateOut)
        if out.verdict == "formatting_only":
            cleared.add(r.field)
    return cleared
