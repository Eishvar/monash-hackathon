"""Tiny dependency-free PDF writer + sample documents (used by the /samples endpoint and the tests).

The samples let anyone try the Process page without hunting for files: an exported email, an SI, and a draft BL
(one that matches, one with a different consignee)."""
import time

from sdoc.simulate import _base, _bl, _si


def text_pdf(lines: list[str], size: int = 11) -> bytes:
    """A valid one-page PDF with a real text layer (Helvetica)."""
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")  # noqa: E731
    body = "BT /F1 %d Tf 50 800 Td %d TL\n" % (size, size + 4) + "".join(f"({esc(ln)}) '\n" for ln in lines) + "ET"
    stream = body.encode("latin-1", errors="replace")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


SAMPLES = {
    "email": "sample-email.pdf",
    "si": "sample-shipping-instruction.pdf",
    "bl": "sample-draft-bl-mismatch.pdf",
    "bl-clean": "sample-draft-bl-clean.pdf",
}


def sample_pdf(kind: str) -> bytes:
    v = _base(time.time())
    if kind == "email":
        lines = [
            "From: documentation.sg@meridian-line.example",
            "To: Averis Documentation Desk",
            f"Subject: DRAFT BL / SI VERIFICATION - {v['booking']} - 4x40HC COATED ART PAPER",
            "",
            "Dear Averis Documentation Team,",
            f"Please find attached the shipping instruction and the draft Bill of Lading for booking {v['booking']}",
            f"(OC No: {v['oc']}), vessel {v['vessel']}. Kindly compare the SI and draft BL and confirm approval.",
            "Best regards,",
            "Documentation Centre, Meridian Line (Singapore) Pte Ltd",
        ]
    elif kind == "si":
        lines = _si(v).splitlines()
    elif kind == "bl":
        lines = _bl({**v, "consignee_bl": "ALDERMERE IMPORTS FZE", "notify_bl": "ALDERMERE IMPORTS FZE"}).splitlines()
    elif kind == "bl-clean":
        lines = _bl(v).splitlines()
    else:
        raise KeyError(kind)
    return text_pdf([ln for ln in lines if ln.strip() and set(ln.strip()) != {"="}])
