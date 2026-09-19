"""Label vocabulary: align differently-worded labels to the 7 canonical fields by meaning."""
import re

ALIASES: dict[str, list[str]] = {
    "shipper": ["shipper", "shipper/exporter", "exporter"],
    "consignee": ["consignee", "to the order of"],
    "notify_party": ["notify", "notify party", "notify party/intermediate consignee"],
    "port_of_loading": ["port of loading", "pol", "load port", "loading port"],
    "port_of_discharge": ["port of discharge", "pod", "discharge port"],
    "container_count": [
        "no. of containers",
        "no. of containers or packages",
        "total containers",
        "container count",
        "number of containers",
    ],
    "gross_weight_kg": ["gross weight", "gross wt", "total gross weight", "total gross wt"],
}

ALIAS_TO_FIELD = {alias: field for field, aliases in ALIASES.items() for alias in aliases}

# Lines that start a non-target label; they end the continuation of the previous value in PDFs.
NOISE_PREFIX = re.compile(
    r"^(b/?l\s*(no|number)|booking|vessel|ocean vessel|export carrier|container no|description|commodity|"
    r"hs code|freight|voy|oc no|order no|net weight|marks|total net|kinds|port of|place of|date)",
    re.IGNORECASE,
)

_CJK = re.compile(r"[　-鿿＀-￯]")
_PARENS = re.compile(r"\([^)]*\)|（[^）]*）")


def strip_cjk(text: str) -> str:
    """Drop CJK glyphs (bilingual labels) and any parentheses left empty by that."""
    return re.sub(r"\(\s*\)", "", _CJK.sub("", text))


def canon(label: str) -> str:
    """Lower-case a label, removing CJK, parenthetical qualifiers and trailing colons."""
    s = _PARENS.sub("", _CJK.sub("", label))
    return re.sub(r"\s+", " ", s).strip(" :").lower()


def field_for_label(label: str) -> str | None:
    return ALIAS_TO_FIELD.get(canon(label))


_ALIAS_RE = re.compile(
    r"^(" + "|".join(re.escape(a) for a in sorted(ALIAS_TO_FIELD, key=len, reverse=True)) + r")"
    r"(?=$|[\s:(])(?:\s*\([^)]*\))*\s*:?\s*(.*)$",
    re.IGNORECASE,
)


def match_line_label(line: str) -> tuple[str, str] | None:
    """If a text line starts with a known label, return (field, rest_of_line)."""
    m = _ALIAS_RE.match(line.strip())
    return (ALIAS_TO_FIELD[m.group(1).lower()], m.group(2).strip()) if m else None
