"""Manual upload: turn one or more PDFs (an exported email and/or SI / draft BL documents) into an email row + stored
attachments that the normal pipeline can process. Roles are detected from content, then file names; the user can override."""
import re
import time
import uuid

from sdoc.parse.readers import read_pdf
from sdoc.simulate import UPLOAD_PREFIX

MAX_FILES = 4
MAX_TOTAL_BYTES = 4_000_000  # Vercel functions reject request bodies above ~4.5 MB
_HEADER = re.compile(r"^\s*(from|to|cc|bcc|date|sent|subject)\s*:", re.IGNORECASE)
_ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


class UploadError(ValueError):
    """The upload cannot be processed (bad file, ambiguous type, too big). The message is shown to the user."""


def _norm_role(hint: str | None) -> str | None:
    h = (hint or "").strip().lower()
    return {"email": "email", "si": "SI", "bl": "BL"}.get(h)


def detect_role(filename: str, data: bytes, hint: str | None = None) -> tuple[str, str]:
    """(role, text) where role is 'email' | 'SI' | 'BL'."""
    doc = read_pdf(data)
    given = _norm_role(hint)
    if given:
        return given, doc.text
    if any(_HEADER.match(ln) for ln in doc.text.splitlines()[:10]):
        return "email", doc.text
    if doc.kind in ("SI", "BL"):
        return doc.kind, doc.text
    name = filename.lower()
    if re.search(r"(^|[^a-z])(si|shipping[\s_-]*instruction)([^a-z]|$)", name):
        return "SI", doc.text
    if re.search(r"(^|[^a-z])(bl|b/l|bill[\s_-]*of[\s_-]*lading)([^a-z]|$)", name):
        return "BL", doc.text
    if re.search(r"mail|eml", name):
        return "email", doc.text
    if doc.scanned or doc.unreadable:
        raise UploadError(f"Could not tell what “{filename}” is (it is a scan or unreadable). Choose its type: Email, SI or Draft BL.")
    return "email", doc.text  # readable text without an SI/BL heading: an exported email


def _parse_email(text: str, filename: str) -> tuple[str, str, str]:
    lines = text.splitlines()
    sender = subject = None
    body = []
    for i, ln in enumerate(lines):
        if i < 10 and _HEADER.match(ln):
            key = ln.split(":", 1)[0].strip().lower()
            value = ln.split(":", 1)[1].strip()
            if key == "from" and sender is None:
                m = _ADDRESS.search(value)
                sender = m.group(0) if m else value
            elif key == "subject" and subject is None:
                subject = value
        else:
            body.append(ln)
    stem = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
    return sender or "Uploaded PDF", subject or stem, "\n".join(body).strip()


def build_upload(files: list[tuple[str, bytes]], roles: list[str] | None = None, now: float | None = None):
    """(email row, {storage name: (bytes, content type)}, [{filename, role}]) for an upload."""
    if not files:
        raise UploadError("Choose at least one PDF.")
    if len(files) > MAX_FILES:
        raise UploadError(f"Upload at most {MAX_FILES} PDFs at a time.")
    if sum(len(d) for _, d in files) > MAX_TOTAL_BYTES:
        raise UploadError("The files are too large (limit 4 MB in total).")
    roles = roles or []
    detected: list[dict] = []
    text_of: dict[int, str] = {}
    for i, (name, data) in enumerate(files):
        if not data.startswith(b"%PDF"):
            raise UploadError(f"“{name}” is not a PDF file.")
        role, text = detect_role(name, data, roles[i] if i < len(roles) else None)
        detected.append({"filename": name, "role": role})
        text_of[i] = text
    for role in ("email", "SI", "BL"):
        if sum(d["role"] == role for d in detected) > 1:
            raise UploadError({"email": "Upload one exported email at a time.", "SI": "Only one shipping instruction (SI) per upload.", "BL": "Only one draft BL per upload."}[role])

    now = now or time.time()
    email_id = f"{UPLOAD_PREFIX}{10_000_000_000_000 - int(now * 1000):014d}{uuid.uuid4().hex[:4]}"
    stored: dict[str, tuple[bytes, str]] = {}
    attachments: list[str] = []
    email_idx = next((i for i, d in enumerate(detected) if d["role"] == "email"), None)
    for i, (name, data) in enumerate(files):
        role = detected[i]["role"]
        stored_name = f"uploads/{email_id}/{email_id}_{'EMAIL' if role == 'email' else role}.pdf"
        stored[stored_name] = (data, "application/pdf")
        attachments.append(stored_name)

    if email_idx is not None:
        sender, subject, body = _parse_email(text_of[email_idx], files[email_idx][0])
    else:
        sender, subject = "Manual upload", "Uploaded documents: " + " + ".join(d["role"] for d in detected)
        body = "Uploaded from the Process page. Please compare the SI and draft BL.\n\nFiles: " + ", ".join(n for n, _ in files)
    email = {"email_id": email_id, "sender": sender, "subject": subject, "body": body, "attachments": sorted(attachments)}
    return email, stored, detected
