"""Final status for a BL_COMPARISON email. Deterministic: the LLM never sets status directly."""
from dataclasses import dataclass, field, replace

from sdoc.compare import FieldResult, compare_fields, differing_fields
from sdoc.parse import Doc

OK_KINDS = {"SI": {"SI", "UNKNOWN"}, "BL": {"BL", "UNKNOWN"}}


@dataclass
class Decision:
    status: str  # OK | MISMATCH | NEEDS_REVIEW
    review_reason: str | None = None
    defect_fields: list[str] = field(default_factory=list)
    fields: list[FieldResult] = field(default_factory=list)  # side-by-side values for the UI
    provisional: list[FieldResult] = field(default_factory=list)  # vision-suggested comparison for a reviewer (D6)

    @property
    def has_defect(self) -> bool:
        return self.status == "MISMATCH"


def decide(si: Doc | None, bl: Doc | None, cleared: frozenset[str] | set[str] = frozenset()) -> Decision:
    """`cleared`: fields an adjudicator judged formatting-only; they count as matching."""
    if si is None or bl is None:
        return Decision("NEEDS_REVIEW", "missing_attachment")
    if si.unreadable or bl.unreadable:
        return Decision("NEEDS_REVIEW", "unreadable")
    if si.kind not in OK_KINDS["SI"] or bl.kind not in OK_KINDS["BL"]:
        return Decision("NEEDS_REVIEW", "wrong_doc_type")
    results = [replace(r, match=True) if r.field in cleared else r for r in compare_fields(si.fields, bl.fields)]
    if any(r.missing for r in results):
        return Decision("NEEDS_REVIEW", "missing_value", fields=results)
    diff = differing_fields(results)
    return Decision("MISMATCH" if diff else "OK", None, diff, results)
