"""Validation report -> outputs/metrics.json.

    python scripts/evaluate.py

1. Ablation on the bundle: rules-only vs rules+LLM, scored with the organizer scorer (aggregate output only).
2. Generalisation: classification accuracy on tests/data/paraphrases.json (hand-written, unseen phrasings),
   rules-only vs rules+LLM.
Cached LLM responses make re-runs free; a cold run is paced by the provider's rate limit.
"""
import collections
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sdoc.classify import CATEGORIES, classify, classify_llm  # noqa: E402
from sdoc.config import OUTPUTS  # noqa: E402
from sdoc.llm import LLMError, OpenAICompatLLM  # noqa: E402
from sdoc.metrics import compute_metrics  # noqa: E402
from sdoc.pipeline import Pipeline  # noqa: E402


def score(records: dict, name: str) -> dict:
    """Run the organizer scorer as a black box and pull out the aggregate numbers."""
    path = OUTPUTS / f"submission_{name}.json"
    path.write_text(json.dumps(records), encoding="utf-8")
    out = subprocess.run([sys.executable, str(ROOT / "scripts" / "score.py"), str(path)], capture_output=True, text=True).stdout
    grab = lambda pat: (float(m.group(1)) if (m := re.search(pat, out)) else None)  # noqa: E731
    e2e = re.search(r"(\d+)/(\d+) defect emails", out)
    return {
        "final": grab(r"FINAL SCORE\s+([\d.]+)"),
        "classification_macro_f1": grab(r"macro-F1\s+([\d.]+)"),
        "defect_precision": grab(r"defect precision\s+([\d.]+)"),
        "defect_recall": grab(r"defect recall\s+([\d.]+)"),
        "end_to_end": f"{e2e.group(1)}/{e2e.group(2)}" if e2e else None,
        "escalation_recall": grab(r"escalation recall\s+([\d.]+)"),
        "escalation_precision": grab(r"escalation precision\s+([\d.]+)"),
    }


def run_bundle(llm) -> dict:
    t0 = time.monotonic()
    results = Pipeline(llm).process_inbox()
    elapsed = time.monotonic() - t0
    records = {k: r.record for k, r in results.items()}
    name = "llm" if llm else "rules"
    return {"score": score(records, name), "metrics": compute_metrics(records, llm.usage.as_dict() if llm else None, elapsed)}


def run_paraphrases(llm) -> dict:
    items = json.loads((ROOT / "tests" / "data" / "paraphrases.json").read_text(encoding="utf-8"))
    hits = {"rules": 0, "rules+llm": 0}
    per_cat = {c: collections.Counter() for c in CATEGORIES}
    misses = []
    for it in items:
        rule = classify(it["body"], it["attachments"])
        both = rule
        if not rule.matched:
            try:
                both = classify_llm(llm, it["body"], it["attachments"])
            except LLMError as exc:
                misses.append({"body": it["body"][:70], "error": str(exc)[:80]})
        hits["rules"] += rule.category == it["label"]
        hits["rules+llm"] += both.category == it["label"]
        per_cat[it["label"]]["n"] += 1
        per_cat[it["label"]]["rules"] += rule.category == it["label"]
        per_cat[it["label"]]["rules+llm"] += both.category == it["label"]
        if both.category != it["label"]:
            misses.append({"label": it["label"], "got": both.category, "body": it["body"][:70]})
    n = len(items)
    return {
        "n": n,
        "accuracy_rules_only": round(hits["rules"] / n, 3),
        "accuracy_rules_plus_llm": round(hits["rules+llm"] / n, 3),
        "per_category": {c: dict(v) for c, v in per_cat.items()},
        "misses_rules_plus_llm": misses,
    }


def main() -> None:
    OUTPUTS.mkdir(exist_ok=True)
    llm = OpenAICompatLLM()
    report = {
        "bundle_rules_only": run_bundle(None),
        "bundle_rules_plus_llm": run_bundle(llm),
        "paraphrases": run_paraphrases(llm),
    }
    (OUTPUTS / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    # Committed copy for the UI's Validation section (the deployed app cannot read the gitignored outputs/).
    pick = lambda r: {  # noqa: E731
        "final": r["score"]["final"],
        "end_to_end": r["score"]["end_to_end"],
        "rule_share": r["metrics"]["rule_share"],
    }
    para = report["paraphrases"]
    ui = {
        "generated": time.strftime("%Y-%m-%d"),
        "bundle": {"rules_only": pick(report["bundle_rules_only"]), "rules_plus_llm": pick(report["bundle_rules_plus_llm"])},
        "paraphrases": {k: para[k] for k in ("n", "accuracy_rules_only", "accuracy_rules_plus_llm")},
    }
    data_dir = ROOT / "src" / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "validation.json").write_text(json.dumps(ui, indent=2), encoding="utf-8")
    for key in ("bundle_rules_only", "bundle_rules_plus_llm"):
        s, m = report[key]["score"], report[key]["metrics"]
        print(f"{key:24} final={s['final']} macroF1={s['classification_macro_f1']} e2e={s['end_to_end']} "
              f"esc={s['escalation_recall']}/{s['escalation_precision']} rule_share={m['rule_share']} "
              f"llm_calls={m['llm_calls']} cost=${m['estimated_cost_usd']} t={m['elapsed_seconds']}s")
    p = report["paraphrases"]
    print(f"paraphrases (n={p['n']}): rules-only {p['accuracy_rules_only']:.0%} -> rules+LLM {p['accuracy_rules_plus_llm']:.0%}")
    for miss in p["misses_rules_plus_llm"]:
        print("  miss:", miss)
    print("llm usage:", llm.usage.as_dict())


if __name__ == "__main__":
    main()
