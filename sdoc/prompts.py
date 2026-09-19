"""Prompt text for every LLM task (kept out of the logic modules)."""

CLASSIFY_SYSTEM = """You triage emails for a shipping-documentation team. Classify the email into exactly one category:
- BL_COMPARISON: the sender sends or asks to compare/check a Shipping Instruction (SI) against a draft Bill of Lading (BL), OR asks someone to send/issue the draft BL.
- SI_REQUEST: the sender submits Shipping Instruction details for one specific shipment (SI details often written in the body). A generic/bulk reminder to a team to submit pending SIs is GENERAL, not SI_REQUEST.
- INVOICE_QUERY: questions about invoices, charges (THC, detention/demurrage), goods receipts, payments, credit notes.
- GENERAL: operational updates, reports, notifications, lists, holiday notices, anything work-related that fits none of the others.
- SPAM: unsolicited junk, prizes, phishing, scams, fake fees, advertisements.
Judge by the body text and attachments, not the subject line (subjects are often misleading). Ignore signatures and quoted reply chains.
JSON: {"category": "<one of the five>", "reason": "<max 12 words>"}"""

EXTRACT_SYSTEM = """You extract shipment fields from a {role_name} document ({role}). Return these 7 fields:
shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg.
Rules:
- Labels vary ("Load Port" = port of loading; "To the Order of" = consignee; "Notify Party/Intermediate Consignee" = notify party).
- container_count: copy the stated count text (e.g. "6 x 40'HC"). gross_weight_kg: the GROSS weight (never net weight); copy as written (e.g. "131,058 KG").
- Parties: name plus address lines as written. Ports: as written.
- If a field is blank, "N/A", "TBA", underscores or otherwise missing, return null for it. NEVER guess or invent.
- For every non-null value give "evidence": a snippet copied VERBATIM from the document that contains the value.
- doc_kind: SI (shipping instruction / BL instruction), BL (bill of lading), INVOICE, PACKING_LIST, COO (certificate of origin), or OTHER.
JSON: {"doc_kind": "...", "shipper": {"value": ..., "evidence": ...}, "consignee": {...}, "notify_party": {...},
"port_of_loading": {...}, "port_of_discharge": {...}, "container_count": {...}, "gross_weight_kg": {...}}"""

ADJUDICATE_SYSTEM = """Two values for the same shipping-document field differ slightly after normalisation. Decide whether the
difference is a real discrepancy (a different entity, port, quantity, or a meaningful name change) or formatting only
(abbreviation, punctuation, spacing, word order of an identical name, a typo that clearly refers to the same entity).
When unsure, answer real_discrepancy. JSON: {"verdict": "real_discrepancy" | "formatting_only", "evidence": "<one sentence quoting both values>"}"""

EXPLAIN_SYSTEM = """Write a 1-2 sentence explanation for a shipping-documentation reviewer of the result of comparing a
Shipping Instruction (SI, the reference) with a draft Bill of Lading (BL). Be specific: name the fields and quote the SI and BL values,
or the reason the case needs human review. Do not restate the whole document. JSON: {"explanation": "<text>"}"""
