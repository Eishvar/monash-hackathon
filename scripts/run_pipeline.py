"""Run the pipeline over the whole inbox and write outputs/submission.json (+ outputs/details.json).

    python scripts/run_pipeline.py            # rules -> LLM -> vision (needs keys in .env)
    python scripts/run_pipeline.py --no-llm   # rules only
"""
import collections
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if "--no-llm" in sys.argv:
    os.environ["LLM_DISABLED"] = "1"

from sdoc.config import OUTPUTS, llm_enabled, resolve_model  # noqa: E402
from sdoc.llm import OpenAICompatLLM  # noqa: E402
from sdoc.pipeline import Pipeline  # noqa: E402


def main() -> None:
    llm = OpenAICompatLLM() if llm_enabled() else None
    t0 = time.monotonic()
    results = Pipeline(llm).process_inbox()
    elapsed = time.monotonic() - t0
    records = {k: r.record for k, r in results.items()}
    OUTPUTS.mkdir(exist_ok=True)
    (OUTPUTS / "submission.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    (OUTPUTS / "details.json").write_text(
        json.dumps({k: r.details for k, r in results.items()}, indent=2, default=str), encoding="utf-8"
    )
    print(f"{len(records)} emails -> outputs/submission.json  ({elapsed:.1f}s)")
    print("categories:", dict(collections.Counter(r["category"] for r in records.values())))
    bl = [r for r in records.values() if r["category"] == "BL_COMPARISON"]
    print("BL_COMPARISON status:", dict(collections.Counter(r["status"] for r in bl)))
    print("review reasons:", dict(collections.Counter(r["review_reason"] for r in bl if r["review_reason"])))
    by = collections.Counter(r["decided_by"] for r in records.values())
    print(f"decided_by: {dict(by)}  (rule share {by['rule'] / len(records):.0%})")
    errors = [(k, n) for k, r in results.items() for n in r.details["notes"] if "failed" in n]
    print(f"LLM failures: {len(errors)}", errors[:5])
    if llm:
        print("models:", {t: f"{resolve_model(t).provider}/{resolve_model(t).model}" for t in ("classify", "vision")})
        print("usage:", llm.usage.as_dict())


if __name__ == "__main__":
    main()
