"""Demo scenarios for the Gmail view: a realistic inbound email with matching attachments, built on demand.

Attachments are generated in the dataset's own text format (or as an image-only PDF for the scanned scenario), so the
normal pipeline processes them exactly like real mail. Names, domains and numbers are fictional (`.example` domains).
"""
import io
import time
import uuid

SIM_PREFIX = "000_sim_"  # sorts before "email_": the newest simulated email lists first (ids are ordered ascending)
MAX_SIMULATED = 40  # the API is unauthenticated: cap how many demo rows can accumulate until they are cleared


UPLOAD_PREFIX = "000_up_"  # emails uploaded from the Process page (listed first too, after any simulated mail)
MAX_UPLOADS = 40


def is_simulated(email_id: str) -> bool:
    return email_id.startswith(SIM_PREFIX)


def is_upload(email_id: str) -> bool:
    return email_id.startswith(UPLOAD_PREFIX)


def arrival_time(email_id: str) -> float | None:
    """Unix time encoded in a simulated id (the id embeds 10^13 - t_ms so newer ids sort first)."""
    try:
        return (10_000_000_000_000 - int(email_id[len(SIM_PREFIX):][:14])) / 1000
    except ValueError:
        return None


def _si(v: dict) -> str:
    return (
        "SHIPPING INSTRUCTION\n========================================\n\n"
        f"Shipper: {v['shipper']}\n  {v['shipper_addr']}\n"
        f"Consignee (Non-Negotiable): {v['consignee_si']}\n  {v['consignee_addr']}\n"
        f"Notify: {v['notify_si']}\n"
        f"Port of Loading (POL): {v['pol']}\nPOD: {v['pod']}\n"
        f"Total Containers: {v['containers']}\nGross Wt (kgs): {v['weight']}\n"
        f"Vessel: {v['vessel']}\nVoyage: {v['voyage']}\n"
        f"Kinds of Packages; Description of Goods: {v['goods']}\nHS Code: {v['hs']}\n"
        f"Booking Ref: {v['booking']}\nOC No.: {v['oc']}\nFreight: PREPAID\n"
    )


def _bl(v: dict) -> str:
    return (
        "BILL OF LADING (DRAFT)\n========================================\n\n"
        f"SHIPPER: {v['shipper']}\n  {v['shipper_addr']}\n"
        f"To the Order of: {v['consignee_bl']}\n  {v['consignee_addr']}\n"
        f"Notify Party: {v['notify_bl']}\n"
        f"Port of Loading (POL): {v['pol']}\nPOD: {v['pod']}\n"
        f"Container Count: {v['containers']}\nGross Weight (KG): {v['weight']}\n"
        f"Export Carrier (vessel, voyage): {v['vessel']}\nVoyage: {v['voyage']}\n"
        f"Commodity: {v['goods']}\nBill of Lading No.: {v['bl_no']}\n"
        f"Booking Ref: {v['booking']}\nFreight: PREPAID\n"
    )


def _scan_pdf(text: str) -> bytes:
    """An image-only PDF (no text layer): what a scanned document looks like to the pipeline."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (1240, 1754), "white")
    draw, font = ImageDraw.Draw(img), ImageFont.load_default(size=28)
    y = 90
    for line in text.splitlines():
        draw.text((90, y), line, fill="black", font=font)
        y += 42
    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=150)
    return buf.getvalue()


def _base(now: float) -> dict:
    n = int(now) % 100000
    return {
        "shipper": "NORTHGATE PAPER MILLS PTE LTD",
        "shipper_addr": "18 TUAS SOUTH AVENUE 4; 637123 SINGAPORE",
        "consignee_si": "HARBOURVIEW TRADING LLC",
        "consignee_bl": "HARBOURVIEW TRADING LLC",
        "consignee_addr": "PLOT 14, JEBEL ALI FREE ZONE SOUTH; DUBAI, UAE",
        "notify_si": "HARBOURVIEW TRADING LLC",
        "notify_bl": "HARBOURVIEW TRADING LLC",
        "pol": "SINGAPORE, SINGAPORE (SGSIN)",
        "pod": "JEBEL ALI, UAE (AEJEA)",
        "containers": "4 x 40'HC",
        "weight": "96,420 KG",
        "vessel": "MERIDIAN STAR V.412E",
        "voyage": "412E",
        "goods": "COATED ART PAPER",
        "hs": "48102900",
        "booking": f"MRDSG{n:05d}71",
        "oc": f"5MRD-{n:05d}",
        "bl_no": f"MRDL{n:05d}904",
    }


def _bl_email(sender: str, subject: str, greeting: str, sign: str, v: dict, scanned: bool = False) -> dict:
    ext = "pdf" if scanned else "txt"
    return {
        "sender": sender,
        "subject": subject,
        "body": (
            f"{greeting}\n\nPlease find attached the shipping instruction and the draft Bill of Lading for booking "
            f"{v['booking']} (OC No: {v['oc']}), vessel {v['vessel']}. Kindly review the parties and cargo particulars "
            f"and confirm approval for final issuance.\n\nBest regards,\n{sign}"
        ),
        "kind": "pair" + ext,
        "values": v,
    }


def _scenario(name: str, now: float) -> dict:
    v = _base(now)
    if name == "mismatch":
        v.update(consignee_bl="ALDERMERE IMPORTS FZE", notify_bl="ALDERMERE IMPORTS FZE")
        return _bl_email("documentation.sg@meridian-line.example", f"DRAFT BL / SI VERIFICATION - {v['booking']} - 4x40HC COATED ART PAPER",
                         "Dear Averis Documentation Team,", "Documentation Centre, South-East Asia\nMeridian Line (Singapore) Pte Ltd", v)
    if name == "clean":
        v.update(vessel="EVERTIDE SPIRIT V.208W", voyage="208W", pod="ROTTERDAM, NETHERLANDS (NLRTM)", goods="UNCOATED WOODFREE PAPER")
        return _bl_email("export-docs@evertide-marine.example", f"DRAFT B/L FOR APPROVAL - {v['bl_no']} - 4x40HC UNCOATED PAPER",
                         "Dear Shipping Documentation Specialist,", "Documentation Dept\nEvertide Marine Corporation", v)
    if name == "scanned":
        v.update(vessel="CORVUS HARMONY V.077N", voyage="077N", pod="CALLAO, PERU (PECLL)", containers="2 x 40'GP", weight="52,310 KG")
        return _bl_email("bl-release@corvus-lines.example", f"URGENT: DRAFT BL CONFIRMATION - {v['bl_no']} - 2x40GP COATED ART PAPER",
                         "Attn: Shipping Documentation Desk,", "Corvus Container Lines (Singapore) Pte Ltd", v, scanned=True)
    if name == "invoice":
        return {
            "sender": "billing@baltic-hanse.example",
            "subject": f"INVOICE / TERMINAL STORAGE & DETENTION - BH-INV-{int(now) % 1000000} - DUE IN 7 DAYS",
            "body": (
                "Dear Averis Documentation Team,\n\nPlease find our invoice for terminal storage and detention charges accrued "
                f"on B/L {v['bl_no']} at the Port Klang terminal.\n\nTotal amount due: USD 1,450.00\nPayment terms: due upon receipt\n\n"
                "Kindly route this to your accounts department for settlement.\n\nKind regards,\nBilling & Credit Control\nBaltic Hanse Lines (Asia) Pte Ltd"
            ),
            "kind": "none",
        }
    if name == "si_request":
        return {
            "sender": "booking.desk@southern-cross-line.example",
            "subject": f"SI SUBMISSION REQUIRED - {v['booking']} - PORT KLANG TO CALLAO",
            "body": (
                f"Dear Customer,\n\nPlease submit the shipping instruction for booking {v['booking']} (Port Klang to Callao) before the SI cut-off. "
                "Please send the complete SI particulars promptly to avoid documentation delay charges.\n\nSouthern Cross Line Customer Service Team"
            ),
            "kind": "none",
        }
    raise KeyError(name)


SCENARIOS = ("mismatch", "clean", "scanned", "invoice", "si_request")


def build_email(scenario: str, now: float | None = None) -> tuple[dict, dict[str, tuple[bytes, str]]]:
    """(email row, {storage name: (bytes, content type)}) for one scenario."""
    now = now or time.time()
    spec = _scenario(scenario, now)
    email_id = f"{SIM_PREFIX}{10_000_000_000_000 - int(now * 1000):014d}{uuid.uuid4().hex[:4]}"  # ms order + random tail: rapid clicks never collide
    files: dict[str, tuple[bytes, str]] = {}
    if spec["kind"] == "pairtxt":
        files[f"sim/{email_id}_SI.txt"] = (_si(spec["values"]).encode(), "text/plain")
        files[f"sim/{email_id}_BL.txt"] = (_bl(spec["values"]).encode(), "text/plain")
    elif spec["kind"] == "pairpdf":
        files[f"sim/{email_id}_SI.pdf"] = (_scan_pdf(_si(spec["values"])), "application/pdf")
        files[f"sim/{email_id}_BL.pdf"] = (_scan_pdf(_bl(spec["values"])), "application/pdf")
    email = {"email_id": email_id, "sender": spec["sender"], "subject": spec["subject"], "body": spec["body"], "attachments": sorted(files)}
    return email, files
