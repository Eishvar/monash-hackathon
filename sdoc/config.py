"""Paths, constants and LLM settings.

To swap a model: edit DEFAULT_MODELS below, or set env vars in `.env` (no code change), e.g.
    LLM_TEXT_MODEL=openai/gpt-oss-120b            # role default for all text tasks
    LLM_VISION_PROVIDER=openrouter
    LLM_MODEL_CLASSIFY=google/gemini-2.5-flash    # optional per-task override
Tasks: classify, extract, adjudicate, explain (text role); vision (vision role).
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "sdoc-hackathon-bundle"
OUTPUTS = ROOT / "outputs"

load_dotenv(ROOT / ".env")

FIELDS = (
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight_kg",
)

# ---- LLM configuration: the ONLY place a default provider or model name appears -------------------------------
DEFAULT_MODELS = {
    "text": ("openrouter", "google/gemini-2.5-flash"),
    "vision": ("openrouter", "google/gemini-2.5-flash"),
}
PROVIDERS = {  # OpenAI-compatible endpoints; extra_params are provider-specific request options
    # Skip thinking tokens so the small per-task max_tokens caps are not eaten (dropped automatically if the model rejects it)
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "key_env": "OPENROUTER_API_KEY",
                   "extra_params": {"extra_body": {"reasoning": {"enabled": False}}}},
}
# USD per 1M tokens (input, output) for cost *estimates*. Missing entry = free tier / unknown -> reported as $0 + tokens.
PRICES = {"openrouter/google/gemini-2.5-flash": (0.30, 2.50)}
TASK_MAX_TOKENS = {"classify": 100, "adjudicate": 150, "explain": 160, "extract": 900, "vision": 1200}  # caps output cost
TASK_ROLE = {"classify": "text", "extract": "text", "adjudicate": "text", "explain": "text", "vision": "vision"}


@dataclass(frozen=True)
class ModelSpec:
    provider: str
    model: str
    base_url: str
    api_key: str | None
    extra: dict = field(default_factory=dict)  # provider-specific request params


def llm_max_wait_s() -> float:
    """Total seconds one LLM call may spend waiting on rate limits. Serverless functions time out at 60 s."""
    return float(os.getenv("LLM_MAX_WAIT_S", 25 if os.getenv("VERCEL") else 120))


def resolve_model(task: str) -> ModelSpec:
    """Provider + model for a task: LLM_MODEL_<TASK> > LLM_<ROLE>_MODEL > DEFAULT_MODELS."""
    role = TASK_ROLE[task]
    default_provider, default_model = DEFAULT_MODELS[role]
    provider = os.getenv(f"LLM_{task.upper()}_PROVIDER") or os.getenv(f"LLM_{role.upper()}_PROVIDER") or default_provider
    model = os.getenv(f"LLM_MODEL_{task.upper()}") or os.getenv(f"LLM_{role.upper()}_MODEL") or default_model
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown LLM provider {provider!r}; known: {sorted(PROVIDERS)}")
    p = PROVIDERS[provider]
    return ModelSpec(provider, model, p["base_url"], os.getenv(p["key_env"]) or None, dict(p.get("extra_params", {})))


def llm_enabled() -> bool:
    """LLM tier is on unless LLM_DISABLED=1 (used by --no-llm and tests)."""
    return os.getenv("LLM_DISABLED", "").lower() not in ("1", "true", "yes")


def cache_dir() -> Path:
    default = Path("/tmp/sdoc-llm-cache") if os.getenv("VERCEL") else ROOT / ".cache" / "llm"
    return Path(os.getenv("LLM_CACHE_DIR", default))
