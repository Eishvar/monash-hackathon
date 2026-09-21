"""Held-out synthetic benchmark (rules only): the product's core promise is that formatting never raises a false alarm."""
import random

from sdoc.pipeline import Pipeline
from sdoc.store import MemoryStore
from sdoc.synth import make_case


def run(n: int, seed: int) -> list[dict]:
    rng, rows = random.Random(seed), []
    for i in range(n):
        case = make_case(i, rng)
        d, _ = Pipeline(None, store=MemoryStore(case["files"])).compare(case["attachments"], notes=[])
        rows.append({"case": case, "status": d.status, "reason": d.review_reason, "defects": sorted(d.defect_fields)})
    return rows


def test_benchmark_generator_is_deterministic():
    a, b = make_case(3, random.Random(1)), make_case(3, random.Random(1))
    assert a["files"] == b["files"] and a["expected"] == b["expected"]


def test_no_false_alarms_and_every_escalation_and_planted_defect_is_found():
    rows = run(80, seed=1)
    kinds = {r["case"]["case_type"] for r in rows}
    assert {"clean", "defect", "blank", "missing"} <= kinds
    for r in rows:
        exp = r["case"]["expected"]
        if r["case"]["case_type"] == "clean":
            assert (r["status"], r["defects"]) == ("OK", []), r["case"]["id"]
        if exp["status"] == "NEEDS_REVIEW":
            assert (r["status"], r["reason"]) == ("NEEDS_REVIEW", exp["review_reason"]), r["case"]["id"]
        if exp["status"] == "MISMATCH":  # recall: every planted defect is found (no missed discrepancy)
            assert set(exp["defect_fields"]) <= set(r["defects"]), r["case"]["id"]
        if exp["status"] != "MISMATCH":
            assert r["status"] != "MISMATCH", r["case"]["id"]  # false-alarm rate == 0

