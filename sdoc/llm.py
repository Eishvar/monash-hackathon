"""The only module that talks to an LLM provider.

One OpenAI-compatible client. Every call is: cached by content hash -> provider call with retry/backoff ->
JSON parsed and validated against a Pydantic schema (one repair retry). Failures raise `LLMError`; callers turn
them into a visible NEEDS_REVIEW state, never a silent default.
"""
import base64
import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from sdoc.config import TASK_MAX_TOKENS, ModelSpec, cache_dir, llm_enabled, llm_max_wait_s, resolve_model

T = TypeVar("T", bound=BaseModel)
MAX_ATTEMPTS = 8
_RETRY_IN = re.compile(r"try again in ([\d.]+)\s*(ms|s|m)\b", re.IGNORECASE)


def retry_delay(exc, attempt: int) -> float:
    """Seconds to wait: honour the provider's Retry-After / 'try again in Xs' hint, else exponential backoff."""
    headers = getattr(getattr(exc, "response", None), "headers", None) or {}
    try:
        if headers.get("retry-after"):
            return min(float(headers["retry-after"]) + 0.5, 65)
    except ValueError:
        pass
    if m := _RETRY_IN.search(str(exc)):
        scale = {"ms": 0.001, "s": 1, "m": 60}[m.group(2).lower()]
        return min(float(m.group(1)) * scale + 0.5, 65)
    return min(2**attempt, 20)


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    def complete_json(self, task: str, system: str, user: str, schema: type[T], images: list[bytes] | None = None) -> T: ...


@dataclass
class Usage:
    calls: int = 0
    cache_hits: int = 0
    seconds: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    by_task: dict[str, int] = field(default_factory=dict)
    by_model: dict[str, list[int]] = field(default_factory=dict)  # "provider/model" -> [prompt, completion] tokens

    def as_dict(self) -> dict:
        return {
            "by_model": {k: list(v) for k, v in self.by_model.items()},
            "llm_calls": self.calls,
            "cache_hits": self.cache_hits,
            "llm_seconds": round(self.seconds, 2),
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "by_task": dict(self.by_task),
        }


def _extract_json(text: str) -> dict:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in response")
    return json.loads(text[start : end + 1])


class DiskCache:
    def __init__(self, path: Path):
        self.path = path

    def get(self, key: str) -> dict | None:
        try:
            return json.loads((self.path / f"{key}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def put(self, key: str, data: dict) -> None:
        try:
            self.path.mkdir(parents=True, exist_ok=True)
            (self.path / f"{key}.json").write_text(json.dumps(data), encoding="utf-8")
        except OSError:
            pass  # read-only filesystem: caching is an optimisation, not a requirement


class RepoCache:
    """Durable cache in the database (`llm_cache` table). Errors degrade to a cache miss."""

    def __init__(self, repo):
        self.repo = repo

    def get(self, key: str) -> dict | None:
        try:
            return self.repo.cache_get(key)
        except Exception:
            return None

    def put(self, key: str, data: dict) -> None:
        try:
            self.repo.cache_put(key, data)
        except Exception:
            pass


class TieredCache:
    """Fast local cache in front of a durable one; hits in the durable tier are copied forward."""

    def __init__(self, fast, durable):
        self.fast, self.durable = fast, durable

    def get(self, key: str) -> dict | None:
        if (v := self.fast.get(key)) is not None:
            return v
        if (v := self.durable.get(key)) is not None:
            self.fast.put(key, v)
        return v

    def put(self, key: str, data: dict) -> None:
        self.fast.put(key, data)
        self.durable.put(key, data)


class OpenAICompatLLM:
    def __init__(self, cache=None, cache_path=None, sleep=time.sleep):
        self.cache = cache or DiskCache(Path(cache_path) if cache_path else cache_dir())
        self.usage = Usage()
        self._sleep = sleep
        self._clients: dict[str, object] = {}

    # -- cache ---------------------------------------------------------------------------------------------
    def _key(self, spec: ModelSpec, task: str, system: str, user: str, schema: type[BaseModel], images) -> str:
        h = hashlib.sha256()
        for part in (spec.provider, spec.model, task, system, user, json.dumps(schema.model_json_schema(), sort_keys=True)):
            h.update(part.encode())
            h.update(b"\0")
        for img in images or []:
            h.update(hashlib.sha256(img).digest())
        return h.hexdigest()

    # -- provider call ---------------------------------------------------------------------------------------
    def _client(self, spec: ModelSpec):
        if spec.provider not in self._clients:
            from openai import OpenAI

            self._clients[spec.provider] = OpenAI(base_url=spec.base_url, api_key=spec.api_key, max_retries=0, timeout=60)
        return self._clients[spec.provider]

    def _chat(self, spec: ModelSpec, messages: list[dict], task: str) -> str:
        from openai import APIConnectionError, APIStatusError

        kwargs: dict = {
            "model": spec.model,
            "messages": messages,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "max_tokens": TASK_MAX_TOKENS[task],
        }
        kwargs.update(spec.extra)
        last: Exception | None = None
        waited, max_wait = 0.0, llm_max_wait_s()
        for attempt in range(MAX_ATTEMPTS):
            t0 = time.monotonic()
            try:
                resp = self._client(spec).chat.completions.create(**kwargs)
                self.usage.seconds += time.monotonic() - t0
                self.usage.calls += 1
                if resp.usage:
                    p, c = resp.usage.prompt_tokens or 0, resp.usage.completion_tokens or 0
                    self.usage.prompt_tokens += p
                    self.usage.completion_tokens += c
                    tally = self.usage.by_model.setdefault(f"{spec.provider}/{spec.model}", [0, 0])
                    tally[0] += p
                    tally[1] += c
                return resp.choices[0].message.content or ""
            except APIStatusError as exc:
                last = exc
                if exc.status_code == 400 and any(k in kwargs for k in spec.extra):
                    for k in spec.extra:
                        kwargs.pop(k, None)  # the model rejects a provider-specific option: retry without it
                    continue
                if exc.status_code not in (408, 409, 429) and exc.status_code < 500:
                    break
            except APIConnectionError as exc:
                last = exc
            delay = retry_delay(last, attempt)
            if waited + delay > max_wait:  # give up visibly rather than outlive the serverless time limit
                break
            waited += delay
            self._sleep(delay)
        raise LLMError(f"{spec.provider}/{spec.model} failed after waiting {waited:.0f}s: {last}")

    def complete_json(self, task: str, system: str, user: str, schema: type[T], images: list[bytes] | None = None) -> T:
        spec = resolve_model(task)
        if not llm_enabled():
            raise LLMError("LLM disabled")
        if not spec.api_key:
            raise LLMError(f"no API key for provider {spec.provider!r}")
        key = self._key(spec, task, system, user, schema, images)
        if (cached := self.cache.get(key)) is not None:
            try:
                obj = schema.model_validate(cached)
                self.usage.cache_hits += 1
                return obj
            except ValidationError:
                pass
        content: object = user
        if images:
            content = [{"type": "text", "text": user}] + [
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(i).decode()}}
                for i in images
            ]
        messages = [
            {"role": "system", "content": system + "\nRespond with a single JSON object only."},
            {"role": "user", "content": content},
        ]
        error = ""
        for _ in range(2):  # original + one repair attempt
            raw = self._chat(spec, messages, task)
            try:
                data = _extract_json(raw)
                obj = schema.model_validate(data)
                self.cache.put(key, obj.model_dump(mode="json"))
                self.usage.by_task[task] = self.usage.by_task.get(task, 0) + 1
                return obj
            except (ValueError, ValidationError) as exc:
                error = str(exc)[:300]
                messages += [
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": f"That was invalid ({error}). Reply again with only the corrected JSON object."},
                ]
        raise LLMError(f"{task}: invalid JSON after repair: {error}")
