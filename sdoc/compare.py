"""Field-by-field SI vs BL comparison on normalised values (pure)."""
from dataclasses import dataclass

from sdoc.config import FIELDS
from sdoc.normalize import NORMALIZERS


@dataclass(frozen=True)
class FieldResult:
    field: str
    si: str | None
    bl: str | None
    match: bool
    missing: bool  # either side has no usable value


def compare_fields(si: dict[str, str | None], bl: dict[str, str | None]) -> list[FieldResult]:
    results = []
    for f in FIELDS:
        a, b = NORMALIZERS[f](si.get(f)), NORMALIZERS[f](bl.get(f))
        missing = a is None or b is None
        results.append(FieldResult(f, si.get(f), bl.get(f), match=not missing and a == b, missing=missing))
    return results


def differing_fields(results: list[FieldResult]) -> list[str]:
    return [r.field for r in results if not r.match and not r.missing]
