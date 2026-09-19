"""Run the pipeline over the whole inbox and write outputs/submission.json.

    python scripts/run_pipeline.py
"""
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdoc.config import OUTPUTS  # noqa: E402
from sdoc.pipeline import process_inbox  # noqa: E402


def main() -> None:
    result = process_inbox()
    OUTPUTS.mkdir(exist_ok=True)
    (OUTPUTS / "submission.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"{len(result)} emails -> outputs/submission.json")
    print("categories:", dict(collections.Counter(r["category"] for r in result.values())))
    bl = [r for r in result.values() if r["category"] == "BL_COMPARISON"]
    print("BL_COMPARISON status:", dict(collections.Counter(r["status"] for r in bl)))
    print("review reasons:", dict(collections.Counter(r["review_reason"] for r in bl if r["review_reason"])))
    print("defect fields:", dict(collections.Counter(f for r in bl for f in r["defect_fields"])))


if __name__ == "__main__":
    main()
