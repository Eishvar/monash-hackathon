"""Pydantic models for LLM outputs (validated in sdoc/llm.py)."""
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
DocKind = Literal["SI", "BL", "INVOICE", "PACKING_LIST", "COO", "OTHER"]


class ClassifyOut(BaseModel):
    category: Category
    reason: str = ""


class FieldValue(BaseModel):
    value: str | None = None
    evidence: str | None = None  # verbatim snippet copied from the document


class ExtractOut(BaseModel):
    doc_kind: DocKind = "OTHER"
    shipper: FieldValue = Field(default_factory=FieldValue)
    consignee: FieldValue = Field(default_factory=FieldValue)
    notify_party: FieldValue = Field(default_factory=FieldValue)
    port_of_loading: FieldValue = Field(default_factory=FieldValue)
    port_of_discharge: FieldValue = Field(default_factory=FieldValue)
    container_count: FieldValue = Field(default_factory=FieldValue)
    gross_weight_kg: FieldValue = Field(default_factory=FieldValue)


class AdjudicateOut(BaseModel):
    verdict: Literal["real_discrepancy", "formatting_only"]
    evidence: str = ""  # why, quoting both values


class ExplainOut(BaseModel):
    explanation: str
