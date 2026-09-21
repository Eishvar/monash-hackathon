"""Held-out benchmark for the comparison engine: random SI/BL pairs whose correct verdict is known by construction.

    python scripts/benchmark.py                  # rules only, n=500, seed=7 (deterministic, seconds)
    python scripts/benchmark.py --llm --n 80     # + LLM tier (adjudicator matters for near-miss names); uses the cache

Writes outputs/benchmark.json (full, with the first failures) and src/data/benchmark.json (compact, shown on /metrics).
Calls `Pipeline.compare` (not `process_email`): classification is measured elsewhere and this skips explanation calls."""
import argparse
import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

if "--llm" not in sys.argv:
    os.environ["LLM_DISABLED"] = "1"

from sdoc.config import FIELDS, OUTPUTS, llm_enabled  # noqa: E402
from sdoc.pipeline import Pipeline  # noqa: E402
from sdoc.store import MemoryStore  # noqa: E402
from sdoc.synth import make_case  # noqa: E402


def prf(tp: int, fp: int, fn: int) -> dict:
    p, r = (tp / (tp + fp) if tp + fp else 1.0), (tp / (tp + fn) if tp + fn else 1.0)
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(2 * p * r / (p + r) if p + r else 0.0, 4)}


def percentile(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * len(xs)))], 1) if xs else 0.0


def run(n: int, seed: int, use_llm: bool) -> tuple[dict, dict]:
    llm = None
    if use_llm:
        from sdoc.llm import OpenAICompatLLM

        llm = OpenAICompatLLM() if llm_enabled() else None
        if llm is None:
            sys.exit("--llm needs the LLM enabled and OPENROUTER_API_KEY in .env")
    rng = random.Random(seed)
    rows, ms = [], []
    for i in range(n):
        case = make_case(i, rng)
        t0 = time.perf_counter()
        d, _ = Pipeline(llm, store=MemoryStore(case["files"])).compare(case["attachments"], notes=[])
        ms.append((time.perf_counter() - t0) * 1000)
        got = {"status": d.status, "review_reason": d.review_reason, "defect_fields": sorted(d.defect_fields)}
        rows.append({**{k: case[k] for k in ("id", "case_type", "format_si", "format_bl", "expected")}, "got": got,
                     "exact": got == case["expected"]})

    per_field = {f: [0, 0, 0] for f in FIELDS}  # tp, fp, fn
    for r in rows:
        exp, got = set(r["expected"]["defect_fields"]), set(r["got"]["defect_fields"])
        for f in FIELDS:
            per_field[f][0] += f in exp and f in got
            per_field[f][1] += f not in exp and f in got
            per_field[f][2] += f in exp and f not in got
    tot = [sum(v[i] for v in per_field.values()) for i in range(3)]

    not_defect = [r for r in rows if r["expected"]["status"] != "MISMATCH"]
    exp_esc = [r for r in rows if r["expected"]["status"] == "NEEDS_REVIEW"]
    got_esc = [r for r in rows if r["got"]["status"] == "NEEDS_REVIEW"]
    both = [r for r in exp_esc if r["got"]["status"] == "NEEDS_REVIEW"]
    by_type, by_fmt = defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0])
    for r in rows:
        for bucket, key in [(by_type, r["case_type"])] + [(by_fmt, f) for f in {r["format_si"], r["format_bl"]} - {"-"}]:
            bucket[key][0] += 1
            bucket[key][1] += r["exact"]
    confusion: dict = defaultdict(Counter)
    for r in rows:
        confusion[r["expected"]["status"]][r["got"]["status"]] += 1
    failures = [{"id": r["id"], "case_type": r["case_type"], "formats": [r["format_si"], r["format_bl"]],
                 "expected": r["expected"], "got": r["got"]} for r in rows if not r["exact"]]

    report = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "seed": seed, "n": n,
        "mode": "rules+llm" if use_llm else "rules",
        "exact_match_rate": round(sum(r["exact"] for r in rows) / n, 4),
        "false_alarm_rate": round(sum(r["got"]["status"] == "MISMATCH" for r in not_defect) / max(1, len(not_defect)), 4),
        "defect": prf(*tot),
        "per_field": {f: {**prf(*v), "support": v[0] + v[2]} for f, v in per_field.items()},
        "escalation": {
            "precision": round(len(both) / len(got_esc), 4) if got_esc else 1.0,
            "recall": round(len(both) / len(exp_esc), 4) if exp_esc else 1.0,
            "reason_accuracy": round(sum(r["got"]["review_reason"] == r["expected"]["review_reason"] for r in both) / max(1, len(both)), 4),
        },
        "per_case_type": {k: {"n": v[0], "exact": round(v[1] / v[0], 4)} for k, v in sorted(by_type.items())},
        "per_format": {k: {"n": v[0], "exact": round(v[1] / v[0], 4)} for k, v in sorted(by_fmt.items())},
        "confusion": {k: dict(v) for k, v in confusion.items()},
        "latency_ms": {"p50": percentile(ms, 0.5), "p95": percentile(ms, 0.95)},
        "formats_excluded": [],
        "known_limits": [
            f"{k}: {c} case(s) not exactly right" for k, c in Counter(f["case_type"] for f in failures).most_common()
        ],
    }
    if any("gross_weight_kg" in f["got"]["defect_fields"] and "gross_weight_kg" not in f["expected"]["defect_fields"] for f in failures):
        report["known_limits"].append(
            "gross_weight_kg: tonne values with decimals (e.g. 16.1 MT vs 16,100 KG) can differ by float rounding "
            "(16.1 * 1000 = 16100.000000000002), a false alarm; fix = compare weights with a tolerance in sdoc/normalize.py")
    if llm:
        report["llm_usage"] = llm.usage.as_dict()
    return report, {**report, "failures": failures[:20], "n_failures": len(failures)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()
    compact, full = run(a.n, a.seed, a.llm)
    OUTPUTS.mkdir(exist_ok=True)
    (OUTPUTS / "benchmark.json").write_text(json.dumps(full, indent=2, default=str), encoding="utf-8")
    dest = ROOT / "src" / "data" / "benchmark.json"
    dest.write_text(json.dumps(compact, indent=2, default=str), encoding="utf-8")
    print(f"benchmark [{compact['mode']}]  n={a.n} seed={a.seed}")
    print(f"  exact match      {compact['exact_match_rate']:.1%}")
    print(f"  false-alarm rate {compact['false_alarm_rate']:.1%}")
    d = compact["defect"]
    print(f"  defect P/R/F1    {d['precision']:.3f} / {d['recall']:.3f} / {d['f1']:.3f}")
    e = compact["escalation"]
    print(f"  escalation P/R   {e['precision']:.3f} / {e['recall']:.3f}  reason accuracy {e['reason_accuracy']:.3f}")
    print("  per case type   ", {k: f"{v['exact']:.0%} of {v['n']}" for k, v in compact["per_case_type"].items()})
    print("  per format      ", {k: f"{v['exact']:.0%} of {v['n']}" for k, v in compact["per_format"].items()})
    print(f"  latency p50/p95  {compact['latency_ms']['p50']} / {compact['latency_ms']['p95']} ms")
    print(f"  failures: {full['n_failures']}", *[f"\n    {f['id']} {f['case_type']} exp={f['expected']} got={f['got']}" for f in full["failures"][:8]])


if __name__ == "__main__":
    main()
