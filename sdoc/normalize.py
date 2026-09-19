"""Deterministic field normalisers. Each returns a comparable key, or None when the value is missing."""
import re

_SUFFIXES = {"LIMITED": "LTD", "COMPANY": "CO", "CORPORATION": "CORP", "INCORPORATED": "INC"}
_NUMBER_WORDS = {
    w: i
    for i, w in enumerate(
        "ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN "
        "SIXTEEN SEVENTEEN EIGHTEEN NINETEEN TWENTY".split()
    )
}
_TONNE_UNITS = {"mt", "mts", "t", "tonne", "tonnes", "ton", "tons"}
_WEIGHT = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*([a-z]+)?", re.IGNORECASE)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", s.upper())).strip()


def norm_party(value: str | None) -> str | None:
    """Name + address, ignoring case, punctuation, layout separators (` | `, `;`, newlines) and LIMITED/LTD-style suffixes."""
    if not value or not value.strip():
        return None
    tokens = _clean(value.replace("&", " AND ")).split()
    return " ".join(_SUFFIXES.get(t, t) for t in tokens)


def norm_port(value: str | None) -> str | None:
    """Port name only: drop UN/LOCODE and other parentheticals, and the country after the comma."""
    if not value or not value.strip():
        return None
    first = re.sub(r"\([^)]*\)", " ", value.replace("\n", " ")).split(",")[0]
    return _clean(first) or None


def norm_count(value: str | None) -> int | None:
    """`6 x 40'HC` -> 6, `Six (6) x 40'HC` -> 6, `six containers` -> 6."""
    if not value:
        return None
    if m := re.search(r"\d+", value):
        return int(m.group())
    for word in re.findall(r"[A-Za-z]+", value):
        if word.upper() in _NUMBER_WORDS:
            return _NUMBER_WORDS[word.upper()]
    return None


def norm_weight(value: str | None) -> float | None:
    """Kilograms: `131,058 KG` -> 131058.0, `22 MT` / `22.0 tonnes` -> 22000.0, `243,588` -> 243588.0."""
    m = _WEIGHT.search(value or "")
    if not m:
        return None
    number = float(m.group(1).replace(",", ""))
    return number * 1000 if (m.group(2) or "").lower() in _TONNE_UNITS else number


NORMALIZERS = {
    "shipper": norm_party,
    "consignee": norm_party,
    "notify_party": norm_party,
    "port_of_loading": norm_port,
    "port_of_discharge": norm_port,
    "container_count": norm_count,
    "gross_weight_kg": norm_weight,
}
