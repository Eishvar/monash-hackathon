"""Unseen-phrasing regression: when a rule fires it must be right (rules abstain rather than guess; the LLM handles the rest)."""
import json
from pathlib import Path

import pytest

from sdoc.classify import classify

ITEMS = json.loads((Path(__file__).parent / "data" / "paraphrases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("item", ITEMS, ids=[f"{i}-{it['label']}" for i, it in enumerate(ITEMS)])
def test_rules_never_misclassify_unseen_phrasing(item):
    c = classify(item["body"], item["attachments"])
    assert not c.matched or c.category == item["label"], (c, item["body"][:60])


def test_rules_cover_a_useful_share_of_unseen_phrasing():
    matched = sum(classify(i["body"], i["attachments"]).matched for i in ITEMS)
    assert matched / len(ITEMS) >= 0.4  # measured 44%; the LLM covers the rest (see scripts/evaluate.py)


def test_b_slash_l_abbreviation():
    assert classify("Please verify the draft B/L against the SI.", []).category == "BL_COMPARISON"
