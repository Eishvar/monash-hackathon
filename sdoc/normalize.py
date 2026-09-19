"""Deterministic field normalisers. Each returns a comparable key, or None when the value is missing."""
import re


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", s.upper())).strip()


def norm_party(value: str | None) -> str | None:
    """Name + address, ignoring case, punctuation, and the ` | ` / newline / `;` layout separators."""
    return _clean(value.replace("&", " AND ")) if value and value.strip() else None


def norm_port(value: str | None) -> str | None:
    """Port name only: drop UN/LOCODE and other parentheticals, and the country after the comma."""
    if not value or not value.strip():
        return None
    first = re.sub(r"\([^)]*\)", " ", value.replace("\n", " ")).split(",")[0]
    return _clean(first) or None


def norm_count(value: str | None) -> int | None:
    """`6 x 40'HC` -> 6."""
    m = re.search(r"\d+", value or "")
    return int(m.group()) if m else None


def norm_weight(value: str | None) -> float | None:
    """`131,058 KG` -> 131058.0."""
    m = re.search(r"\d[\d,]*(?:\.\d+)?", value or "")
    return float(m.group().replace(",", "")) if m else None


NORMALIZERS = {
    "shipper": norm_party,
    "consignee": norm_party,
    "notify_party": norm_party,
    "port_of_loading": norm_port,
    "port_of_discharge": norm_port,
    "container_count": norm_count,
    "gross_weight_kg": norm_weight,
}
