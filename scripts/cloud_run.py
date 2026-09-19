"""Drive the API to process the whole inbox, then export and score the result.

    python scripts/cloud_run.py                                   # the deployed Vercel app
    python scripts/cloud_run.py --base http://127.0.0.1:8000      # local uvicorn (same code, same Supabase)
    python scripts/cloud_run.py --reprocess                       # recompute everything, not just unprocessed
"""
import argparse
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE = "https://monash-hackathon-five.vercel.app"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--batch", type=int, default=15)
    ap.add_argument("--reprocess", action="store_true")
    args = ap.parse_args()
    api = args.base.rstrip("/") + "/api/py"
    client = httpx.Client(timeout=120)
    run_id, t0 = uuid.uuid4().hex[:12], time.monotonic()

    print("health:", client.get(f"{api}/health").json())
    ids = None
    if args.reprocess:  # explicit ids so the loop terminates
        ids, offset = [], 0
        while True:  # stop at the last page instead of always issuing 50 requests
            rows = client.get(f"{api}/emails", params={"limit": 200, "offset": offset}).json()
            ids += [e["email_id"] for e in rows]
            if len(rows) < 200:
                break
            offset += 200
    done = 0
    while True:
        payload = {"run_id": run_id, "limit": args.batch}
        if ids is not None:
            chunk, ids = ids[: args.batch], ids[args.batch :]
            if not chunk:
                break
            payload = {"run_id": run_id, "ids": chunk}
        r = client.post(f"{api}/process-batch", json=payload)
        r.raise_for_status()
        body = r.json()
        done += len(body["processed"])
        if ids is not None:  # the server stops at its time budget: requeue whatever it did not get to
            ids = [i for i in chunk if i not in body["processed"]] + ids
        print(f"  processed {done}, remaining {body['remaining']} ({body['seconds']}s)")
        if ids is None and (body["remaining"] == 0 or not body["processed"]):
            break

    submission = client.get(f"{api}/export/submission").json()
    out = ROOT / "outputs" / "submission_cloud.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(submission, indent=2), encoding="utf-8")
    print(f"exported {len(submission)} records -> {out}  (run {run_id}, {time.monotonic() - t0:.0f}s)")
    print("metrics:", json.dumps({k: v for k, v in client.get(f"{api}/metrics").json().items() if k in (
        "processed", "errors", "rule_share", "llm_calls", "cache_hits", "review_queue", "estimated_cost_usd")}))
    subprocess.call([sys.executable, str(ROOT / "scripts" / "score.py"), str(out)])


if __name__ == "__main__":
    main()
