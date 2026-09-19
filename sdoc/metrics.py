"""Operational metrics for a pipeline run: how much was decided by rules vs AI, and what it cost."""
import collections

from sdoc.config import PRICES


def estimate_cost(by_model: dict[str, list[int]]) -> float:
    """USD estimate from token counts. Models without a price (free tier) contribute $0."""
    total = 0.0
    for model, (prompt, completion) in by_model.items():
        if model in PRICES:
            pin, pout = PRICES[model]
            total += prompt / 1e6 * pin + completion / 1e6 * pout
    return round(total, 4)


def compute_metrics(records: dict[str, dict], usage: dict | None = None, elapsed_s: float | None = None) -> dict:
    n = len(records)
    by = collections.Counter(r["decided_by"] for r in records.values())
    comparisons = [r for r in records.values() if r["category"] == "BL_COMPARISON"]
    usage = usage or {}
    return {
        "emails": n,
        "categories": dict(collections.Counter(r["category"] for r in records.values())),
        "bl_comparison_status": dict(collections.Counter(r["status"] for r in comparisons)),
        "review_reasons": dict(collections.Counter(r["review_reason"] for r in comparisons if r["review_reason"])),
        "defect_fields": dict(collections.Counter(f for r in comparisons for f in r["defect_fields"])),
        "decided_by": dict(by),
        "rule_share": round(by["rule"] / n, 3) if n else None,
        "llm_calls": usage.get("llm_calls", 0),
        "llm_calls_by_task": usage.get("by_task", {}),
        "cache_hits": usage.get("cache_hits", 0),
        "tokens": {"prompt": usage.get("prompt_tokens", 0), "completion": usage.get("completion_tokens", 0)},
        "estimated_cost_usd": estimate_cost(usage.get("by_model", {})),
        "llm_seconds": usage.get("llm_seconds", 0),
        "elapsed_seconds": round(elapsed_s, 1) if elapsed_s is not None else None,
        "avg_seconds_per_email": round(elapsed_s / n, 3) if elapsed_s is not None and n else None,
    }
