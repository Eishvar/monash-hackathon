"""Score a submission with the organizers' scorer (aggregate output only).

    python scripts/score.py                      # scores outputs/submission.json
    python scripts/score.py path/to/submission.json

Runs the organizer's score_cli.py as a black box. Never open the answer key directly (see CLAUDE.md).
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCORER_DIR = ROOT / "sdoc-hackathon-docker" / "server"


def main() -> int:
    submission = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "outputs" / "submission.json"
    if not submission.exists():
        print(f"No submission at {submission}. Run scripts/run_pipeline.py first.")
        return 1
    return subprocess.call([sys.executable, "score_cli.py", str(submission.resolve())], cwd=SCORER_DIR)


if __name__ == "__main__":
    sys.exit(main())
