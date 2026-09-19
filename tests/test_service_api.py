import pytest
from fastapi.testclient import TestClient

from api.index import app, get_service
from sdoc.config import FIELDS
from sdoc.db import MemoryRepo
from sdoc.llm import DiskCache, RepoCache, TieredCache
from sdoc.service import Service
from sdoc.store import MemoryStore
from tests.test_stress import BASE, CHANGED, LABELS, build_txt

CMP_BODY = "Attached are the SI and draft BL for OC 5RSG-1."


def email(n, body=CMP_BODY, attachments=True, sender="a@x.com"):
    files = [f"attachments/email_{n:03d}_SI.txt", f"attachments/email_{n:03d}_BL.txt"] if attachments else []
    return {"email_id": f"email_{n:03d}", "sender": sender, "subject": f"subj {n}", "body": body, "attachments": files}


def files(n, bl_values=None):
    return {
        f"attachments/email_{n:03d}_SI.txt": build_txt("SHIPPING INSTRUCTION", LABELS["A"], BASE),
        f"attachments/email_{n:03d}_BL.txt": build_txt("BILL OF LADING (DRAFT)", LABELS["B"], bl_values or BASE),
    }


@pytest.fixture
def svc():
    repo = MemoryRepo()
    store = MemoryStore({**files(1), **files(2, {**BASE, "consignee": CHANGED["consignee"]}), **files(3, {**BASE, "consignee": ""})})
    repo.upsert_emails([
        email(1), email(2), email(3),
        email(4, "Please compare the SI and draft BL.", attachments=False),
        email(5, "Query on invoice 123: THC?", attachments=False),
    ])
    return Service(repo, store, llm=None)


@pytest.fixture
def client(svc):
    app.dependency_overrides[get_service] = lambda: svc
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_process_ok_mismatch_and_review_cases(svc):
    assert svc.process("email_001")["status"] == "OK"
    r = svc.process("email_002")
    assert (r["status"], r["defect_fields"], r["has_defect"]) == ("MISMATCH", ["consignee"], True)
    assert {f["field"] for f in r["fields"]} == set(FIELDS)
    assert svc.process("email_003")["review_reason"] == "missing_value"
    assert svc.process("email_004")["review_reason"] == "missing_attachment"
    assert svc.process("email_005")["category"] == "INVOICE_QUERY"


def test_batch_progress_and_run_record(svc):
    first = svc.process_batch(limit=2, run_id="r1")
    assert len(first["processed"]) == 2 and first["remaining"] == 3
    second = svc.process_batch(limit=10, run_id="r1")
    assert second["remaining"] == 0
    assert svc.repo.runs["r1"]["stats"]["emails_processed"] == 5


def test_export_matches_submission_shape_and_defaults_unprocessed(svc):
    svc.process("email_002")
    out = svc.export_submission()
    assert set(out) == {f"email_00{i}" for i in range(1, 6)}
    assert out["email_002"] == {"category": "BL_COMPARISON", "status": "MISMATCH", "review_reason": None,
                                "has_defect": True, "defect_fields": ["consignee"], "decided_by": "rule"}
    assert out["email_001"]["category"] == "GENERAL"  # not processed yet


def test_review_correct_recomputes_and_writes_audit_row(svc):
    svc.process("email_003")  # BL consignee blank -> NEEDS_REVIEW / missing_value
    fixed = svc.review("email_003", "correct", {"consignee": {"bl": BASE["consignee"]}}, note="filled from the PDF")
    assert (fixed["status"], fixed["reviewed"]) == ("OK", True)
    (audit,) = svc.repo.list_reviews("email_003")
    assert audit["before"]["status"] == "NEEDS_REVIEW" and audit["after"]["status"] == "OK"
    assert audit["note"] == "filled from the PDF"
    # a correction that reveals a real mismatch flips the status the other way
    svc.process("email_003")
    bad = svc.review("email_003", "correct", {"consignee": {"bl": "SOMEONE ELSE LTD"}})
    assert (bad["status"], bad["defect_fields"]) == ("MISMATCH", ["consignee"])
    assert svc.review_queue() == [q for q in svc.review_queue() if q["email_id"] != "email_003"]


def test_review_without_fields_and_provisional_values(svc):
    svc.process("email_004")
    assert svc.review("email_004", "confirm")["status"] == "NEEDS_REVIEW"  # nothing to recompute; reviewed flag only
    assert svc.repo.get_result("email_004")["reviewed"] is True
    # scan case: the vision model's suggested values are accepted by "confirm"
    prov = [{"field": f, "si": BASE[f], "bl": BASE[f], "match": True, "missing": False} for f in FIELDS]
    svc.repo.upsert_result({"email_id": "email_005", "category": "BL_COMPARISON", "status": "NEEDS_REVIEW",
                            "review_reason": "unreadable", "has_defect": False, "defect_fields": [], "decided_by": "llm",
                            "fields": [], "provisional_fields": prov, "notes": [], "reviewed": False})
    assert any(q["email_id"] == "email_005" for q in svc.review_queue())
    assert svc.review("email_005", "confirm")["status"] == "OK"


def test_processing_failure_is_visible_and_retryable(svc):
    del svc.store.files["attachments/email_001_BL.txt"]
    r = svc.process("email_001")
    assert r["status"] == "ERROR" and "FileNotFoundError" in r["processing_error"]
    assert svc.export_submission()["email_001"]["status"] == "NEEDS_REVIEW"
    assert any(q["email_id"] == "email_001" for q in svc.review_queue())
    svc.store.files.update(files(1))
    assert svc.process("email_001")["status"] == "OK"  # retry succeeds


def test_metrics(svc):
    svc.process_batch(limit=10, run_id="m")
    m = svc.metrics()
    assert m["total_emails"] == 5 and m["processed"] == 5 and m["unprocessed"] == 0
    assert m["rule_share"] == 1.0 and m["review_queue"] == 2 and m["bl_comparison_status"]["MISMATCH"] == 1


def test_api_endpoints(client):
    assert client.get("/api/py/health").json()["status"] == "ok"
    body = client.post("/api/py/process-batch", json={"limit": 10, "run_id": "api"}).json()
    assert body["remaining"] == 0 and len(body["processed"]) == 5
    rows = client.get("/api/py/emails", params={"status": "MISMATCH"}).json()
    assert [r["email_id"] for r in rows] == ["email_002"]
    assert client.get("/api/py/emails", params={"category": "INVOICE_QUERY"}).json()[0]["email_id"] == "email_005"
    detail = client.get("/api/py/emails/email_002").json()
    assert detail["result"]["defect_fields"] == ["consignee"] and detail["reviews"] == []
    queue = client.get("/api/py/review-queue").json()
    assert {q["email_id"] for q in queue} == {"email_003", "email_004"}
    r = client.post("/api/py/reviews/email_003", json={"action": "correct", "corrections": {"consignee": {"bl": BASE["consignee"]}}})
    assert r.json()["status"] == "OK"
    assert client.get("/api/py/export/submission").json()["email_003"]["status"] == "OK"
    assert client.get("/api/py/metrics").json()["reviewed"] == 1
    assert client.post("/api/py/process/email_001").json()["status"] == "OK"


def test_api_errors(client):
    assert client.get("/api/py/emails/nope").status_code == 404
    assert client.post("/api/py/process/nope").status_code == 404
    assert client.post("/api/py/reviews/email_001", json={"action": "confirm"}).status_code == 404  # not processed yet
    client.post("/api/py/process/email_001")
    assert client.post("/api/py/reviews/email_001", json={"action": "bogus"}).status_code == 400
    assert client.post("/api/py/reviews/email_001", json={"action": "correct"}).status_code == 400
    assert client.post("/api/py/reviews/email_001", json={"action": "correct", "corrections": {"vessel": {"si": "x"}}}).status_code == 400


def test_tiered_cache_copies_durable_hits_forward(tmp_path):
    repo = MemoryRepo()
    repo.cache_put("k", {"v": 1})
    fast = DiskCache(tmp_path)
    cache = TieredCache(fast, RepoCache(repo))
    assert cache.get("k") == {"v": 1} and fast.get("k") == {"v": 1}
    cache.put("k2", {"v": 2})
    assert repo.cache_get("k2") == {"v": 2} and fast.get("k2") == {"v": 2}
    assert cache.get("missing") is None
