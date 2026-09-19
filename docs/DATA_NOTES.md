# Data notes — facts learned from profiling the bundle (no answer key used)

## Shape
- 520 emails (`inbox/email_NNN.json`: email_id, from, subject, body, attachments[]).
  Attachment counts: 394 have 0, 124 have 2, 2 have 1.
- 250 attachments: 192 .txt, 22 .xlsx, 8 .docx, 28 .pdf. Named `email_NNN_SI.*` / `email_NNN_BL.*`.
  All referenced files exist.
- Bodies contain signatures and quoted reply chains ("From: ... Sent: ..."). The intent is usually in the first paragraph.

## Classification traps
- **Subjects are misleading.** "TO CONFIRM DOCS ..." is often a request to *send* a BL (no attachments) → not a
  comparison. "REQUEST BL DRAFT ..." can carry a real SI+BL for checking. Classify on body + attachments.
- About 125 SI_REQUEST-style emails ("Please find Shipping instruction for ...") have **SI details inline in the
  body** (shipper, consignee, POL/POD, weight) and no attachments. Don't treat "has shipment fields" as a comparison.
- Common body openers (examples, not answers): invoice/THC queries, "GR is still missing for invoice", D&D/detention
  charges, outstanding BL lists, "-- RPA Bot" reports, berthing reports, holiday notices, obvious spam (prizes,
  bitcoin, fake customs fees, mailbox-full phishing, "LIMITED TIME OFFER").
- Comparison bodies look like: "Attached are the SI and draft BL for OC ...", "Please find attached the shipping
  instruction and the draft bill of lading", "Pls assist to check the draft BL against the SI", "Please compare the
  SI and draft BL for ...". Some are just "Dear X," followed by the request.

## Document formats
- .txt: `LABEL: value`, with continuation lines indented (addresses). Title line: "SHIPPING INSTRUCTION" / "BILL OF LADING (DRAFT)".
- .docx: a 2-column table (label | value), bilingual labels (e.g. `Consignee (收货人)`), header paragraphs.
- .pdf (text layer): label on one line, value on the following lines. Some BLs have a **per-container table**
  (container no. | description | gross weight), so container_count = number of rows and weight = sum of rows.
- .xlsx: 22 files (15 SI, 7 BL). Layout still to inspect; `openpyxl` is needed.
- Values vary in format: `6 x 40'HC`, `12 x 20'FCL`, `131,058 KG`, `243,588`, ports with/without country and
  UN/LOCODE (`NANTONG, CHINA (CNNTG)`), party name followed by address lines.

## Label vocabulary (≈60 variants; align by meaning)
- shipper: Shipper, SHIPPER, Shipper/Exporter, Shipper (Principal or Seller), Exporter
- consignee: Consignee, CONSIGNEE, Consignee (Non-Negotiable), **To the Order of**
- notify_party: Notify, Notify Party, NOTIFY PARTY, Notify Party/Intermediate Consignee
- port_of_loading: Port of Loading, PORT OF LOADING, Port of Loading (POL), POL, **Load Port**
- port_of_discharge: Port of Discharge, PORT OF DISCHARGE, Port of Discharge (POD), POD, Discharge Port
- container_count: No. of Containers, No. of Containers or Packages, Total Containers, Container Count
- gross_weight_kg: Gross Weight (KG), Gross Wt (kgs), GROSS WEIGHT, Gross Weight毛重(KGS)
- Noise labels: Vessel, Voyage, Booking Ref/No., BL No., OC No., HS Code, Freight, Commodity, **NET WEIGHT** (don't confuse with gross).

## Edge cases (all in email_501–520, one per scenario type)
- Wrong doc type: "BL" file is actually a COMMERCIAL INVOICE / PACKING LIST / CERTIFICATE OF ORIGIN (501–505). The body says so too.
- Missing attachment: no files, or SI only; the body says "(attachments missing)" / "(the draft BL is still missing)" (506–510).
- Unreadable: corrupt PDF, pypdf raises "Stream has ended unexpectedly" (511, 515); image-only scans with 0 text (512–514).
  The scorer's aggregate output shows 5 gold `unreadable` cases (5 per reason), matching 2 corrupt + 3 scans → see D6.
- Missing value: SI fields blank, `N/A` or `_______` (516–520); the body says "Some SI fields were left blank".
- Encoding: files are UTF-8 (Chinese labels). Always decode as UTF-8.
