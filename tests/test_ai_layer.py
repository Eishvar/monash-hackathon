import json
from types import SimpleNamespace

import pytest

from sdoc import config
from sdoc.adjudicate import candidates, cleared_fields, similarity
from sdoc.classify import classify, classify_llm
from sdoc.compare import compare_fields
from sdoc.decide import decide
from sdoc.extract import evidence_ok, fill_gaps
from sdoc.llm import LLMError, OpenAICompatLLM, retry_delay
from sdoc.parse import Doc
from sdoc.pipeline import Pipeline
from sdoc.schemas import AdjudicateOut, ClassifyOut, ExtractOut, FieldValue


class FakeLLM:
    """Returns canned outputs per task; records calls."""

    def __init__(self, **outputs):
        self.outputs, self.calls = outputs, []

    def complete_json(self, task, system, user, schema, images=None):
        self.calls.append(task)
        out = self.outputs[task]
        if isinstance(out, Exception):
            raise out
        return out


def make_doc(kind="SI", **over) -> Doc:
    base = dict.fromkeys(config.FIELDS)
    base.update(over)
    return Doc(kind=kind, fields=base, text="Port of Loading: SINGAPORE\nGross Weight: 22,000 KG\nNotify: ____MT")


# ---- provider client: cache, repair, retry, failures ------------------------------------------------------------
def fake_openai(replies):
    """Patch target: a client whose chat.completions.create pops canned replies."""
    def create(**kwargs):
        content = replies.pop(0)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
            usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5),
        )
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.delenv("LLM_DISABLED", raising=False)
    return OpenAICompatLLM(cache_path=tmp_path, sleep=lambda s: None)


def test_llm_validates_caches_and_repairs(client):
    client._clients["groq"] = fake_openai(['<think>hm</think>```json\n{"category": "SPAM"}\n```'])
    assert client.complete_json("classify", "sys", "body", ClassifyOut).category == "SPAM"
    assert client.usage.calls == 1
    client.complete_json("classify", "sys", "body", ClassifyOut)  # identical input: served from disk cache
    assert client.usage.calls == 1 and client.usage.cache_hits == 1

    client._clients["groq"] = fake_openai(['{"category": "NOT_A_CATEGORY"}', '{"category": "GENERAL"}'])
    assert client.complete_json("classify", "sys", "other body", ClassifyOut).category == "GENERAL"  # one repair retry

    client._clients["groq"] = fake_openai(["nonsense", "still nonsense"])
    with pytest.raises(LLMError):
        client.complete_json("classify", "sys", "third body", ClassifyOut)


def test_llm_failure_is_visible_when_disabled_or_keyless(client, monkeypatch):
    monkeypatch.setenv("LLM_DISABLED", "1")
    with pytest.raises(LLMError, match="disabled"):
        client.complete_json("classify", "s", "u", ClassifyOut)
    monkeypatch.delenv("LLM_DISABLED")
    monkeypatch.delenv("GROQ_API_KEY")
    monkeypatch.setattr(config, "resolve_model", lambda t: config.ModelSpec("groq", "m", "u", None))
    monkeypatch.setattr("sdoc.llm.resolve_model", config.resolve_model)
    with pytest.raises(LLMError, match="no API key"):
        client.complete_json("classify", "s", "u", ClassifyOut)


def test_retry_delay_honours_provider_hint():
    assert retry_delay(Exception("Please try again in 480ms."), 0) == pytest.approx(0.98)
    assert retry_delay(Exception("Please try again in 10.98s."), 0) == pytest.approx(11.48)
    assert retry_delay(Exception("boom"), 3) == 8


def test_model_swap_via_env(monkeypatch):
    assert config.resolve_model("classify").model == config.DEFAULT_MODELS["text"][1]
    monkeypatch.setenv("LLM_TEXT_MODEL", "some/other-model")
    assert config.resolve_model("explain").model == "some/other-model"
    monkeypatch.setenv("LLM_MODEL_EXPLAIN", "special/model")
    assert config.resolve_model("explain").model == "special/model"
    assert config.resolve_model("vision").model == config.DEFAULT_MODELS["vision"][1]
    monkeypatch.setenv("LLM_VISION_PROVIDER", "nope")
    with pytest.raises(ValueError):
        config.resolve_model("vision")


# ---- extraction trust rules ---------------------------------------------------------------------------------------
def test_evidence_must_exist_and_placeholders_never_fill():
    src = "Port of Loading: SINGAPORE\nNotify: ____MT"
    assert evidence_ok("SINGAPORE", "Port of Loading: SINGAPORE", src)
    assert not evidence_ok("SINGAPORE", "Load Port: SINGAPORE", src)  # invented evidence
    assert not evidence_ok("MT", "Notify: ____MT", src)  # placeholder
    assert not evidence_ok("N/A", "Notify: N/A", "Notify: N/A")


def test_fill_gaps_only_fills_empty_fields_with_grounded_values():
    doc = make_doc(gross_weight_kg="1,000 KG")
    out = ExtractOut(
        doc_kind="SI",
        port_of_loading=FieldValue(value="SINGAPORE", evidence="Port of Loading: SINGAPORE"),
        gross_weight_kg=FieldValue(value="22,000 KG", evidence="Gross Weight: 22,000 KG"),
        notify_party=FieldValue(value="MT", evidence="Notify: ____MT"),
        shipper=FieldValue(value="MADE UP LTD", evidence="Shipper: MADE UP LTD"),
    )
    assert fill_gaps(doc, out) == ["port_of_loading"]
    assert doc.fields["gross_weight_kg"] == "1,000 KG"  # rule value is never overridden
    assert doc.fields["notify_party"] is None and doc.fields["shipper"] is None


# ---- classification fallback ------------------------------------------------------------------------------------------
def test_llm_classifies_only_when_rules_abstain():
    body = "Kindly note the vessel schedule has changed for next week."
    assert classify(body, []).matched is False
    llm = FakeLLM(classify=ClassifyOut(category="GENERAL"))
    c = classify_llm(llm, body, [])
    assert (c.category, c.decided_by) == ("GENERAL", "llm")
    email = {"body": "Query on invoice 99: THC?", "attachments": []}
    Pipeline(llm).process_email(email)
    assert llm.calls.count("classify") == 1  # rule-matched email did not call the LLM


def test_llm_failure_is_recorded_not_silent():
    pipe = Pipeline(FakeLLM(classify=LLMError("rate limited")))
    res = pipe.process_email({"body": "Some unusual message.", "attachments": []})
    assert res.record["category"] == "GENERAL" and any("failed" in n for n in res.details["notes"])


# ---- adjudicator gating ------------------------------------------------------------------------------------------------
def test_adjudicator_gate_and_clearing():
    si = make_doc(kind="SI", shipper="ACME PACIFIC TRADING COMPANY", consignee="BUYER GMBH")
    bl = make_doc(kind="BL", shipper="ACME PACIFC TRADING COMPANY", consignee="OTHER TRADERS LTD")
    for d in (si, bl):
        d.fields.update(notify_party="X", port_of_loading="A", port_of_discharge="B", container_count="1", gross_weight_kg="1")
    results = compare_fields(si.fields, bl.fields)
    assert [r.field for r in candidates(results)] == ["shipper"]  # typo-level only; consignee is clearly different
    assert similarity("consignee", "BUYER GMBH", "OTHER TRADERS LTD") < 0.95
    llm = FakeLLM(adjudicate=AdjudicateOut(verdict="formatting_only"))
    assert cleared_fields(llm, results) == {"shipper"}
    d = decide(si, bl, cleared={"shipper"})
    assert d.defect_fields == ["consignee"] and d.status == "MISMATCH"
    assert set(decide(si, bl).defect_fields) == {"shipper", "consignee"}


def test_adjudicator_real_discrepancy_keeps_mismatch():
    si = make_doc(shipper="ACME PACIFIC TRADING COMPANY")
    bl = make_doc(shipper="ACME PACIFC TRADING COMPANY")
    results = compare_fields(si.fields, bl.fields)
    assert cleared_fields(FakeLLM(adjudicate=AdjudicateOut(verdict="real_discrepancy")), results) == set()


def test_pipeline_without_llm_matches_rule_behaviour(tmp_path):
    (tmp_path / "attachments").mkdir()
    email = {"body": "Please compare the SI and draft BL.", "attachments": []}
    res = Pipeline(None, root=tmp_path).process_email(email)
    assert res.record["status"] == "NEEDS_REVIEW" and res.record["review_reason"] == "missing_attachment"
    assert res.record["decided_by"] == "rule"
    json.dumps(res.record)


def test_rate_limit_waiting_is_capped_and_fails_visibly(client, monkeypatch):
    import httpx
    import openai

    monkeypatch.setenv("LLM_MAX_WAIT_S", "5")
    resp = httpx.Response(429, request=httpx.Request("POST", "http://x"), headers={"retry-after": "3"})

    def create(**kwargs):
        raise openai.RateLimitError("rate limited", response=resp, body=None)

    client._clients["groq"] = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    slept = []
    client._sleep = slept.append
    with pytest.raises(LLMError, match="failed after waiting"):
        client.complete_json("classify", "sys", "cap test", ClassifyOut)
    assert sum(slept) <= 5  # never outlives a 60 s serverless invocation


def test_provider_specific_params_come_from_config_and_are_dropped_if_rejected(client, monkeypatch):
    import httpx
    import openai

    assert config.resolve_model("classify").extra == {"reasoning_effort": "none"}
    assert config.resolve_model("vision").extra == {}
    sent = []
    resp = httpx.Response(400, request=httpx.Request("POST", "http://x"))

    def create(**kwargs):
        sent.append("reasoning_effort" in kwargs)
        if len(sent) == 1:
            raise openai.BadRequestError("unsupported", response=resp, body=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"category": "SPAM"}'))], usage=None)

    client._clients["groq"] = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    assert client.complete_json("classify", "sys", "extras test", ClassifyOut).category == "SPAM"
    assert sent == [True, False]
