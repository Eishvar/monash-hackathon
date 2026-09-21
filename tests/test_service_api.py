import pytest
from fastapi.testclient import TestClient

from api.index import app, get_service
from sdoc.config import FIELDS
from sdoc.db import MemoryRepo
from sdoc.llm import DiskCache, RepoCache, TieredCache
from types import SimpleNamespace

from sdoc.service import METRIC_COLUMNS, BadRequest, Service
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


def test_supabase_handle_gives_each_thread_its_own_client(monkeypatch):
    """Sharing one HTTP/2 client across the API's worker threads caused httpx.ReadError under concurrent requests."""
    import threading

    import supabase

    from sdoc.db import SupabaseHandle

    made = []
    monkeypatch.setattr(supabase, "create_client", lambda url, key: made.append(object()) or made[-1])
    handle = SupabaseHandle("http://x", "k")
    seen = []
    t = threading.Thread(target=lambda: seen.append(handle.client))
    t.start()
    t.join()
    assert handle.client is handle.client  # stable within a thread
    assert seen[0] is not handle.client and len(made) == 2  # distinct across threads


def test_open_api_request_size_caps(client):
    assert client.post("/api/py/process-batch", json={"ids": [f"email_{i}" for i in range(51)]}).status_code == 422
    assert client.post("/api/py/process-batch", json={"limit": 500}).status_code == 422
    assert client.post("/api/py/process-batch", json={"limit": 0}).status_code == 422
    assert client.post("/api/py/reviews/email_001", json={"action": "confirm", "note": "x" * 501}).status_code == 422


def test_list_emails_query_validation(client):
    for bad in ({"limit": -1}, {"limit": 0}, {"limit": 201}, {"offset": -5}, {"status": "MISMATCH'; drop"}, {"category": "x" * 30}):
        assert client.get("/api/py/emails", params=bad).status_code == 422, bad
    assert client.get("/api/py/emails", params={"limit": 200, "offset": 0, "status": "NEEDS_REVIEW"}).status_code == 200


def test_confirming_a_failed_email_is_rejected_not_hidden(svc):
    del svc.store.files["attachments/email_001_BL.txt"]
    assert svc.process("email_001")["status"] == "ERROR"
    with pytest.raises(BadRequest):
        svc.review("email_001", "confirm")
    assert svc.repo.get_result("email_001")["status"] == "ERROR" and svc.repo.get_result("email_001")["processing_error"]
    assert any(q["email_id"] == "email_001" for q in svc.review_queue())  # still visible in the queue


def test_interleaved_runs_keep_their_own_stats(svc):
    svc.process_batch(limit=2, run_id="a")
    svc.process_batch(limit=1, run_id="b")
    svc.process_batch(limit=2, run_id="a")  # 'b' is now the latest run; 'a' must accumulate, not reset
    assert svc.repo.runs["a"]["stats"]["emails_processed"] == 4
    assert svc.repo.runs["b"]["stats"]["emails_processed"] == 1


def test_run_stats_accumulate_llm_usage_by_task():
    class CountingLLM:
        def __init__(self):
            self.usage = SimpleNamespace(as_dict=lambda: self.snapshot)
            self.snapshot = {"llm_calls": 0, "cache_hits": 0, "prompt_tokens": 0, "completion_tokens": 0, "by_task": {}, "by_model": {}}

        def complete_json(self, task, system, user, schema, images=None):
            self.snapshot = {**self.snapshot, "llm_calls": self.snapshot["llm_calls"] + 1, "by_task": {"classify": self.snapshot["by_task"].get("classify", 0) + 1}}
            return schema(category="GENERAL")

    repo = MemoryRepo()
    repo.upsert_emails([email(9, "Kindly note the vessel schedule changed.", attachments=False)])
    llm = CountingLLM()
    llm.usage = SimpleNamespace(as_dict=lambda: llm.snapshot)
    Service(repo, MemoryStore(), llm).process_batch(limit=5, run_id="r")
    assert repo.runs["r"]["stats"]["by_task"] == {"classify": 1} and repo.runs["r"]["stats"]["llm_calls"] == 1


def test_metrics_and_queue_use_light_reads(svc):
    svc.process_batch(limit=10, run_id="m")
    asked = []
    original = svc.repo.all_results
    svc.repo.all_results = lambda columns="*": asked.append(columns) or original(columns)
    m = svc.metrics()
    assert asked == [METRIC_COLUMNS] and m["review_queue"] == 2
    assert {q["subject"] for q in svc.review_queue()} == {"subj 3", "subj 4"}


def test_simulated_scenarios_process_correctly_count_in_metrics_and_stay_out_of_the_scored_export(svc):
    got = {s: svc.simulate_email(s) for s in ("mismatch", "clean", "invoice", "si_request")}
    r = got["mismatch"]["result"]
    assert (r["status"], sorted(r["defect_fields"])) == ("MISMATCH", ["consignee", "notify_party"])
    assert got["clean"]["result"]["status"] == "OK" and got["clean"]["result"]["category"] == "BL_COMPARISON"
    assert got["invoice"]["result"]["category"] == "INVOICE_QUERY"
    assert got["si_request"]["result"]["category"] == "SI_REQUEST"
    ids = [x["email"]["email_id"] for x in got.values()]
    assert all(i.startswith("000_sim_") for i in ids)
    assert svc.repo.list_emails(None, None, 50, 0)[0]["email_id"].startswith("000_sim_")  # listed first
    assert set(svc.export_submission()) == {f"email_00{i}" for i in range(1, 6)}  # the default (scored) export is dataset-only
    assert set(svc.export_submission(include_extra=True)) == {f"email_00{i}" for i in range(1, 6)} | set(ids)
    m = svc.metrics()
    assert m["total_emails"] == 9 and m["processed"] == 4 and m["bl_comparison_status"]["MISMATCH"] == 1  # demo mail is counted
    assert svc.reset_simulated() == {"deleted": len(ids)} and not any(i in svc.repo.emails for i in ids)
    assert svc.metrics()["total_emails"] == 5  # ...and clearing it is reflected


def test_simulated_scanned_pair_is_unreadable_and_written_to_storage(svc):
    out = svc.simulate_email("scanned")
    assert out["result"]["review_reason"] == "unreadable"
    assert all(name in svc.store.files and svc.store.files[name].startswith(b"%PDF") for name in out["email"]["attachments"])
    svc.reset_simulated()
    assert not [n for n in svc.store.files if n.startswith("sim/")]


def test_simulate_endpoint_rejects_unknown_scenario_and_caps_volume(client, svc, monkeypatch):
    assert client.post("/api/py/gmail/simulate", json={"scenario": "nope"}).status_code == 400
    assert client.post("/api/py/gmail/simulate", json={"scenario": "invoice"}).json()["result"]["category"] == "INVOICE_QUERY"
    monkeypatch.setattr("sdoc.service.MAX_SIMULATED", 1)
    assert client.post("/api/py/gmail/simulate", json={"scenario": "invoice"}).status_code == 400
    assert client.delete("/api/py/gmail/simulated").json() == {"deleted": 1}


def test_csv_export_lists_mismatches_with_fields_and_explanation(client, svc):
    svc.process("email_002")  # mismatch
    svc.process("email_001")  # ok: not exported
    svc.repo.results["email_002"]["explanation"] = "Consignee differs, line one\nline two"
    r = client.get("/api/py/export/csv")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    import csv, io
    rows = list(csv.DictReader(io.StringIO(r.text.lstrip("﻿"))))
    assert [x["email_id"] for x in rows] == ["email_002"]
    assert rows[0]["mismatched_fields"] == "consignee" and "SI=" in rows[0]["si_vs_bl_values"]
    assert rows[0]["explanation"] == "Consignee differs, line one line two" and rows[0]["subject"] == "subj 2"


def test_processed_daily_is_zero_filled_and_includes_simulated_mail(client, svc):
    svc.process("email_001")
    svc.simulate_email("invoice")
    days = client.get("/api/py/metrics/daily?days=5").json()
    assert len(days) == 5 and sum(d["count"] for d in days) == 2 and days[-1]["count"] == 2


def test_email_list_preview_adds_a_short_snippet(client):
    plain = client.get('/api/py/emails').json()[0]
    assert 'snippet' not in plain
    row = client.get('/api/py/emails?preview=true').json()[0]
    assert row['snippet'].startswith('Attached are the SI') and len(row['snippet']) <= 110



# -- Process page: PDF upload ---------------------------------------------------------------------------------------
from sdoc.samples import sample_pdf, text_pdf  # noqa: E402


def upload(client, files, roles=None):
    parts = [("files", (name, data, "application/pdf")) for name, data in files]
    return client.post("/api/py/upload", files=parts, data={"roles": roles or []})


def test_upload_si_and_bl_pdfs_are_detected_compared_and_counted(client, svc):
    r = upload(client, [("a.pdf", sample_pdf("si")), ("b.pdf", sample_pdf("bl"))])
    assert r.status_code == 200
    body = r.json()
    assert {d["role"] for d in body["detected"]} == {"SI", "BL"}
    res = body["result"]
    assert (res["category"], res["status"], sorted(res["defect_fields"])) == ("BL_COMPARISON", "MISMATCH", ["consignee", "notify_party"])
    assert body["email"]["email_id"].startswith("000_up_") and len(body["email"]["attachments"]) == 2
    assert svc.metrics()["total_emails"] == 6 and svc.metrics()["bl_comparison_status"]["MISMATCH"] == 1  # reflected in metrics
    assert body["email"]["email_id"] not in svc.export_submission()  # scorer export stays dataset-only
    assert body["email"]["email_id"] in svc.export_submission(include_extra=True)
    assert client.delete("/api/py/uploads").json() == {"deleted": 1} and svc.metrics()["total_emails"] == 5


def test_upload_clean_pair_is_ok_and_email_export_supplies_sender_and_subject(client):
    r = upload(client, [("mail.pdf", sample_pdf("email")), ("si.pdf", sample_pdf("si")), ("bl.pdf", sample_pdf("bl-clean"))]).json()
    assert r["result"]["status"] == "OK" and r["result"]["category"] == "BL_COMPARISON"
    assert r["email"]["sender"] == "documentation.sg@meridian-line.example" and r["email"]["subject"].startswith("DRAFT BL / SI VERIFICATION")
    assert not r["email"]["body"].lower().startswith("from:")  # header lines are not part of the body


def test_upload_single_document_needs_review_and_email_only_is_triaged(client):
    r = upload(client, [("si.pdf", sample_pdf("si"))]).json()
    assert (r["result"]["status"], r["result"]["review_reason"]) == ("NEEDS_REVIEW", "missing_attachment")
    inv = text_pdf(["From: billing@x.example", "Subject: Invoice 88", "", "Please find our invoice for detention charges. Payment due."])
    assert upload(client, [("inv.pdf", inv)]).json()["result"]["category"] == "INVOICE_QUERY"


def test_upload_validation_errors_are_clear(client):
    assert "not a PDF" in upload(client, [("x.pdf", b"hello")]).json()["detail"]
    assert "one shipping instruction" in upload(client, [("a.pdf", sample_pdf("si")), ("b.pdf", sample_pdf("si"))]).json()["detail"].lower()
    assert upload(client, []).status_code == 422
    from PIL import Image
    import io as _io
    buf = _io.BytesIO(); Image.new("RGB", (200, 200), "white").save(buf, format="PDF")
    scan = buf.getvalue()
    assert "Choose its type" in upload(client, [("scan1.pdf", scan)]).json()["detail"]
    # ...and picking the type fixes it (the scan is then read as an SI with the BL beside it)
    ok = upload(client, [("scan1.pdf", scan), ("b.pdf", sample_pdf("bl"))], roles=["si", "auto"])
    assert ok.status_code == 200 and {d["role"] for d in ok.json()["detected"]} == {"SI", "BL"}


def test_sample_endpoint_serves_pdfs(client):
    for kind in ("email", "si", "bl", "bl-clean"):
        r = client.get(f"/api/py/samples/{kind}")
        assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert client.get("/api/py/samples/nope").status_code == 404


def test_routes_endpoint_returns_ports_from_the_documents(client, svc):
    svc.process('email_001')
    svc.process('email_004')  # no attachments: no ports
    rows = {r['email_id']: r for r in client.get('/api/py/metrics/routes').json()}
    assert rows['email_001']['pol'] and rows['email_001']['pod'] and rows['email_001']['status'] == 'OK'
    assert rows['email_004']['pol'] is None and rows['email_004']['subject'] == 'subj 4'


    assert rows['email_004']['sender'] == 'a@x.com'
