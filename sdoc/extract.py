"""LLM extraction fallbacks: text documents with gaps, and scanned PDFs via the vision model.

Trust rules ("the LLM reads, code decides"): an LLM value is only used if it quotes evidence that really exists in
the source text (text path), is not a placeholder, and the field was empty after rule parsing.
"""
import re

from sdoc import prompts
from sdoc.config import FIELDS
from sdoc.llm import LLM
from sdoc.parse import Doc
from sdoc.parse.readers import is_blank
from sdoc.schemas import ExtractOut

KIND_MAP = {"OTHER": "UNKNOWN"}
_PLACEHOLDER_EVIDENCE = re.compile(r"_{3,}|\b(n/?a|tba|tbc|tbd)\b", re.IGNORECASE)
ROLE_NAME = {"SI": "Shipping Instruction", "BL": "draft Bill of Lading"}


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def evidence_ok(value: str | None, evidence: str | None, source: str) -> bool:
    """Value is real, quoted evidence exists in the source, and the value itself appears in that evidence."""
    if is_blank(value) or not evidence or _PLACEHOLDER_EVIDENCE.search(evidence):
        return False
    ev, src = _squash(evidence), _squash(source)
    return ev in src and _squash(value) in ev  # type: ignore[arg-type]


def llm_extract(llm: LLM, doc: Doc, role: str) -> ExtractOut:
    system = prompts.EXTRACT_SYSTEM.replace("{role_name}", ROLE_NAME.get(role, "shipping")).replace("{role}", role)
    return llm.complete_json("extract", system, doc.text[:8000], ExtractOut)


def fill_gaps(doc: Doc, out: ExtractOut) -> list[str]:
    """Fill empty fields from an evidence-checked LLM extraction; returns the fields it filled."""
    if doc.kind == "UNKNOWN" and out.doc_kind != "OTHER":
        doc.kind = out.doc_kind
    filled = []
    for f in FIELDS:
        fv = getattr(out, f)
        if doc.fields[f] is None and evidence_ok(fv.value, fv.evidence, doc.text):
            doc.fields[f] = fv.value.strip()  # type: ignore[union-attr]
            filled.append(f)
    return filled


def needs_llm_extraction(doc: Doc) -> bool:
    return not doc.unreadable and doc.kind in ("SI", "BL", "UNKNOWN") and any(v is None for v in doc.fields.values())


def vision_extract(llm: LLM, images: list[bytes], role: str) -> Doc:
    """Extract from page images of a scanned PDF. Values are suggestions for a human to confirm (D6)."""
    system = prompts.EXTRACT_SYSTEM.replace("{role_name}", ROLE_NAME.get(role, "shipping")).replace("{role}", role)
    out = llm.complete_json("vision", system, "The document is in the attached page image(s).", ExtractOut, images=images)
    doc = Doc(kind=KIND_MAP.get(out.doc_kind, out.doc_kind), scanned=True)
    for f in FIELDS:
        v = getattr(out, f).value
        doc.fields[f] = None if is_blank(v) else v.strip()  # type: ignore[union-attr]
    return doc
