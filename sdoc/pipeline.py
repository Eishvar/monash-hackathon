"""Per-email pipeline: classify -> (BL_COMPARISON) parse SI/BL -> LLM gap-fill / vision -> compare -> adjudicate ->
decide -> explain. Rules go first; the LLM is used only where they abstain. Code makes the final decision."""
import re
from dataclasses import dataclass, field
from pathlib import Path

from sdoc.adjudicate import cleared_fields
from sdoc.classify import Classification, classify, classify_llm
from sdoc.compare import compare_fields
from sdoc.config import BUNDLE
from sdoc.decide import Decision, decide
from sdoc.explain import explain
from sdoc.extract import fill_gaps, llm_extract, needs_llm_extraction, vision_extract
from sdoc.llm import LLM, LLMError
from sdoc.parse import Doc, read_document
from sdoc.parse.render import render_pdf_pages
from sdoc.store import AttachmentStore, LocalStore


@dataclass
class Result:
    record: dict  # exactly the submission shape
    details: dict = field(default_factory=dict)  # side-by-side values, explanation, LLM notes (for UI / DB)


def _role(name: str, doc: Doc) -> str | None:
    m = re.search(r"_(SI|BL)\.\w+$", name, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return doc.kind if doc.kind in ("SI", "BL") else None


class Pipeline:
    def __init__(self, llm: LLM | None = None, root: Path = BUNDLE, store: AttachmentStore | None = None):
        self.llm = llm
        self.root = root
        self.store = store or LocalStore(root)

    # -- stages ------------------------------------------------------------------------------------------------
    def _classify(self, email: dict, notes: list[str]) -> Classification:
        cls = classify(email["body"], email["attachments"])
        if not cls.matched and self.llm:
            try:
                return classify_llm(self.llm, email["body"], email["attachments"])
            except LLMError as exc:
                notes.append(f"classify LLM failed (kept rule default): {exc}")
        return cls

    def _load_docs(self, attachments: list[str], notes: list[str]) -> tuple[dict[str, Doc], dict[str, bytes], bool]:
        docs: dict[str, Doc] = {}
        blobs: dict[str, bytes] = {}
        used_llm = False
        for name in attachments:
            data = self.store.read(name)
            doc = read_document(name, data)
            role = _role(name, doc)
            if not role or role in docs:
                continue
            if self.llm and needs_llm_extraction(doc):
                try:
                    filled = fill_gaps(doc, llm_extract(self.llm, doc, role))
                    if filled:
                        used_llm = True
                        notes.append(f"{role}: LLM filled {filled}")
                except LLMError as exc:
                    notes.append(f"{role}: LLM extraction failed: {exc}")
            docs[role], blobs[role] = doc, data
        return docs, blobs, used_llm

    def _suggest_from_scans(self, docs: dict[str, Doc], blobs: dict[str, bytes], notes: list[str]) -> Decision | None:
        """D6: scanned docs stay unreadable/NEEDS_REVIEW, but a vision pass pre-fills values for the reviewer."""
        if not self.llm:
            return None
        suggested: dict[str, Doc] = {}
        for role, doc in docs.items():
            if doc.scanned:
                images = render_pdf_pages(blobs[role])
                if not images:
                    continue
                try:
                    suggested[role] = vision_extract(self.llm, images, role)
                    notes.append(f"{role}: vision LLM extracted suggested values from scan")
                except LLMError as exc:
                    notes.append(f"{role}: vision extraction failed: {exc}")
        if not suggested:
            return None
        si = suggested.get("SI") or (docs["SI"] if not docs["SI"].unreadable else None)
        bl = suggested.get("BL") or (docs["BL"] if not docs["BL"].unreadable else None)
        if si is None or bl is None:
            return None
        return Decision("NEEDS_REVIEW", "unreadable", fields=compare_fields(si.fields, bl.fields))

    def compare(self, attachments: list[str], notes: list[str]) -> tuple[Decision, bool]:
        docs, blobs, used_llm = self._load_docs(attachments, notes)
        si, bl = docs.get("SI"), docs.get("BL")
        d = decide(si, bl)
        if d.status == "NEEDS_REVIEW" and d.review_reason == "unreadable" and si and bl:
            if (prov := self._suggest_from_scans(docs, blobs, notes)) is not None:
                d.provisional = prov.fields
                used_llm = True
        elif d.status == "MISMATCH" and self.llm:
            try:
                if cleared := cleared_fields(self.llm, d.fields):
                    notes.append(f"adjudicator judged formatting-only: {sorted(cleared)}")
                    d, used_llm = decide(si, bl, cleared), True
            except LLMError as exc:
                notes.append(f"adjudication failed (kept mismatch): {exc}")
        return d, used_llm

    # -- public --------------------------------------------------------------------------------------------------
    def process_email(self, email: dict) -> Result:
        notes: list[str] = []
        cls = self._classify(email, notes)
        record = {
            "category": cls.category,
            "status": "OK",
            "review_reason": None,
            "has_defect": False,
            "defect_fields": [],
            "decided_by": cls.decided_by,
        }
        details: dict = {"notes": notes}
        if cls.category == "BL_COMPARISON" and (cls.compare_intent or email["attachments"]):
            d, used_llm = self.compare(email["attachments"], notes)
            record.update(
                status=d.status, review_reason=d.review_reason, has_defect=d.has_defect, defect_fields=d.defect_fields
            )
            if used_llm:
                record["decided_by"] = "llm"
            details["fields"] = [vars(r) for r in d.fields]
            details["provisional_fields"] = [vars(r) for r in d.provisional]
            if d.status != "OK" and self.llm:
                try:
                    details["explanation"] = explain(self.llm, d)
                except LLMError as exc:
                    notes.append(f"explanation failed: {exc}")
        return Result(record, details)

    def process_inbox(self) -> dict[str, Result]:
        return {e["email_id"]: self.process_email(e) for e in LocalStore(self.root).emails()}
