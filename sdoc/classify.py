"""Rule-based email classifier. Looks at the body's opening text and the attachments, never the subject
(subjects are misleading). Returns `matched=False` when no rule fires so the LLM can take over (M2)."""
import re
from dataclasses import dataclass

CATEGORIES = ("BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM")

_QUOTE_START = re.compile(r"^\s*(from:|sent:|-{3,}|_{3,}|on .{5,80} wrote:)", re.IGNORECASE)
_BANNER = re.compile(r"^\s*(warning|caution)\b.*(external|outside|originated)", re.IGNORECASE)

SPAM = re.compile(
    r"congratulations|you have (won|been selected)|has been selected|limited.time offer|"
    r"package (could not|couldn't) be delivered|mailbox (is )?(almost )?full|bitcoin|crypto|lottery|"
    r"claim (your|now)|customs (clearance )?fee|verify your (account|password)|click (here|the link)|"
    r"act now|winner|free gift|% off|bank officer|next of kin|inheritance|business proposal|"
    r"million (usd|dollars|us)|dear (friend|beneficiary)",
    re.IGNORECASE,
)
BL_COMPARISON = re.compile(
    r"\b(si|shipping instruction)\b.{0,25}\b(and|vs|against|with)\b.{0,15}\bdraft (b/?l|bill of lading)|"
    r"\b(compare|check|verify|confirm)\b.{0,40}\bdraft (b/?l|bill of lading)|"
    r"\bdraft (b/?l|bill of lading)\b.{0,40}\b(against|vs|matches)\b.{0,15}\b(si|shipping instruction)\b",
    re.IGNORECASE | re.DOTALL,
)
# A request to send/issue the draft BL belongs to the BL workflow (category BL_COMPARISON) but carries
# nothing to compare, so the pipeline records it as OK unless documents are attached.
BL_REQUEST = re.compile(r"(send|provide|issue|release)\b.{0,20}\bdraft (b/?l|bill of lading)", re.IGNORECASE | re.DOTALL)
SI_REQUEST = re.compile(r"shipping instruction for", re.IGNORECASE)
INVOICE_QUERY = re.compile(
    r"\binvoice|\bthc\b|\bgr\b.{0,20}missing|goods receipt|d&d|detention|demurrage|credit note|"
    r"debit note|payment|statement of account|\bsoa\b",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class Classification:
    category: str
    matched: bool  # False => no rule fired; defaulted to GENERAL and should go to the LLM
    compare_intent: bool = False  # BL_COMPARISON only: the sender wants documents compared (vs. asking for a BL)
    decided_by: str = "rule"


def body_head(body: str, limit: int = 700) -> str:
    """Opening text of the email: skips security banners and cuts before quoted reply chains and signatures."""
    kept: list[str] = []
    for line in body.splitlines():
        if _QUOTE_START.match(line):
            break
        if line.strip() and not _BANNER.match(line):
            kept.append(line.strip())
    return " ".join(kept)[:limit]


def classify(body: str, attachment_names: list[str]) -> Classification:
    head = body_head(body)
    roles = {m.group(1).upper() for n in attachment_names if (m := re.search(r"_(SI|BL)\.\w+$", n, re.I))}
    if SPAM.search(head):
        return Classification("SPAM", True)
    if roles >= {"SI", "BL"} or BL_COMPARISON.search(head):
        return Classification("BL_COMPARISON", True, compare_intent=True)
    if BL_REQUEST.search(head):
        return Classification("BL_COMPARISON", True)
    if SI_REQUEST.search(head):
        return Classification("SI_REQUEST", True)
    if INVOICE_QUERY.search(head):
        return Classification("INVOICE_QUERY", True)
    return Classification("GENERAL", False)


def classify_llm(llm, body: str, attachment_names: list[str]) -> Classification:
    """Fallback for emails no rule matched. The LLM only reads; compare_intent still comes from the deterministic rule."""
    from sdoc import prompts
    from sdoc.schemas import ClassifyOut

    user = f"Attachments: {', '.join(attachment_names) or 'none'}\n\nEmail body:\n{body_head(body, 1500)}"
    out = llm.complete_json("classify", prompts.CLASSIFY_SYSTEM, user, ClassifyOut)
    intent = out.category == "BL_COMPARISON" and (bool(attachment_names) or bool(BL_COMPARISON.search(body_head(body))))
    return Classification(out.category, True, compare_intent=intent, decided_by="llm")
