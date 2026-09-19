from sdoc.classify import classify
from sdoc.compare import compare_fields, differing_fields
from sdoc.decide import decide
from sdoc.normalize import norm_count, norm_party, norm_port, norm_weight
from sdoc.parse import Doc, read_document
from sdoc.parse.labels import field_for_label, match_line_label

SI_TXT = b"""SHIPPING INSTRUCTION
========================================

Shipper/Exporter: ACME PTE LTD
  1 MAIN ROAD; SINGAPORE
To the Order of: BUYER GMBH
NOTIFY PARTY: BUYER GMBH
Load Port: SINGAPORE (SGSIN)
Discharge Port: HAMBURG, GERMANY
No. of Containers: 3 x 40'HC
Gross Weight (KG): 22,000 KG
NET WEIGHT: 21,000 KG
"""


def doc(**over) -> Doc:
    base = {
        "shipper": "ACME PTE LTD\n1 MAIN ROAD; SINGAPORE",
        "consignee": "BUYER GMBH",
        "notify_party": "BUYER GMBH",
        "port_of_loading": "SINGAPORE (SGSIN)",
        "port_of_discharge": "HAMBURG, GERMANY",
        "container_count": "3 x 40'HC",
        "gross_weight_kg": "22,000 KG",
    }
    return Doc(kind=over.pop("kind", "UNKNOWN"), fields={**base, **over})


def test_normalizers():
    assert norm_count("6 x 40'HC") == 6
    assert norm_weight("131,058 KG") == 131058.0
    assert norm_weight("243,588") == 243588.0
    assert norm_port("NANTONG, CHINA (CNNTG)") == norm_port("NANTONG")
    assert norm_port("PORT KLANG (WESTPORT), MALAYSIA (MYPKG)") == norm_port("Port Klang")
    assert norm_party("ACME PTE. LTD. | 1 Main Rd") == norm_party("Acme Pte Ltd\n1 main rd")
    assert norm_party("  ") is None and norm_count(None) is None


def test_label_alignment():
    assert field_for_label("Port of Loading (POL)") == "port_of_loading"
    assert field_for_label("Gross Weight毛重(KGS)") == "gross_weight_kg"
    assert field_for_label("Consignee (收货人)") == "consignee"
    assert field_for_label("NET WEIGHT") is None
    assert match_line_label("Port of Discharge (POD) FREMANTLE, AUSTRALIA") == (
        "port_of_discharge",
        "FREMANTLE, AUSTRALIA",
    )
    assert match_line_label("POLYTECH LTD") is None


def test_read_txt_and_missing_values():
    d = read_document("email_1_SI.txt", SI_TXT)
    assert d.kind == "SI"
    assert d.fields["shipper"] == "ACME PTE LTD\n1 MAIN ROAD; SINGAPORE"
    assert d.fields["consignee"] == "BUYER GMBH"
    assert d.fields["gross_weight_kg"] == "22,000 KG"
    blank = read_document("x_SI.txt", b"SHIPPING INSTRUCTION\nPort of Loading: ____MT\nPort of Discharge: N/A\n")
    assert blank.fields["port_of_loading"] is None and blank.fields["port_of_discharge"] is None


def test_corrupt_pdf_is_unreadable_not_an_exception():
    d = read_document("x_BL.pdf", b"%PDF-1.4 truncated")
    assert d.unreadable and d.error


def test_compare_flags_only_real_differences():
    res = compare_fields(doc().fields, doc(container_count="4 x 40'HC", port_of_loading="SINGAPORE").fields)
    assert differing_fields(res) == ["container_count"]  # weight and port formatting differences ignored


def test_decide_statuses():
    ok = decide(doc(kind="SI"), doc(kind="BL", gross_weight_kg="22000"))
    assert (ok.status, ok.has_defect, ok.defect_fields) == ("OK", False, [])
    bad = decide(doc(kind="SI"), doc(kind="BL", consignee="OTHER LTD", gross_weight_kg="21,000"))
    assert (bad.status, bad.has_defect, bad.defect_fields) == ("MISMATCH", True, ["consignee", "gross_weight_kg"])
    assert decide(doc(kind="SI"), None).review_reason == "missing_attachment"
    assert decide(doc(kind="SI"), Doc(kind="UNKNOWN", unreadable=True)).review_reason == "unreadable"
    assert decide(doc(kind="SI"), doc(kind="INVOICE")).review_reason == "wrong_doc_type"
    assert decide(doc(kind="SI", port_of_loading=None), doc(kind="BL")).review_reason == "missing_value"


def test_classifier_uses_body_not_subject_and_skips_quotes():
    assert classify("Attached are the SI and draft BL for OC 123.", ["a/e_SI.txt", "a/e_BL.txt"]).category == "BL_COMPARISON"
    c = classify("Please assist to send the draft BL.", [])
    assert c.category == "BL_COMPARISON" and not c.compare_intent
    assert classify("Please find shipping instruction for 5ABC-1. POL: X", []).category == "SI_REQUEST"
    assert classify("Query on invoice 123: is the THC correct?", []).category == "INVOICE_QUERY"
    assert classify("You have won a brand new iPhone!", []).category == "SPAM"
    assert classify("Thanks.\n\nFrom: x\nSent: y\ninvoice bitcoin", []).matched is False
