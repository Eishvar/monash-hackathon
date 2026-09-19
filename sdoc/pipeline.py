"""Per-email pipeline: classify -> (if BL_COMPARISON) parse SI/BL -> decide -> output record."""
import json
import re
from pathlib import Path

from sdoc.classify import classify
from sdoc.config import BUNDLE
from sdoc.decide import Decision, decide
from sdoc.parse import Doc, read_document


def _role(name: str, doc: Doc) -> str | None:
    m = re.search(r"_(SI|BL)\.\w+$", name, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return doc.kind if doc.kind in ("SI", "BL") else None


def compare_attachments(attachments: list[str], root: Path = BUNDLE) -> Decision:
    docs: dict[str, Doc] = {}
    for name in attachments:
        doc = read_document(name, (root / name).read_bytes())
        if (role := _role(name, doc)) and role not in docs:
            docs[role] = doc
    return decide(docs.get("SI"), docs.get("BL"))


def process_email(email: dict, root: Path = BUNDLE) -> dict:
    cls = classify(email["body"], email["attachments"])
    record = {
        "category": cls.category,
        "status": "OK",
        "review_reason": None,
        "has_defect": False,
        "defect_fields": [],
        "decided_by": "rule",
    }
    if cls.category == "BL_COMPARISON" and (cls.compare_intent or email["attachments"]):
        d = compare_attachments(email["attachments"], root)
        record.update(
            status=d.status,
            review_reason=d.review_reason,
            has_defect=d.has_defect,
            defect_fields=d.defect_fields,
        )
    return record


def process_inbox(root: Path = BUNDLE) -> dict[str, dict]:
    out = {}
    for path in sorted((root / "inbox").glob("email_*.json")):
        email = json.loads(path.read_text(encoding="utf-8"))
        out[email["email_id"]] = process_email(email, root)
    return out
