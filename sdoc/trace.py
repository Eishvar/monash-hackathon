"""Decision trace: which pipeline stages ran for an email, how (rule / AI / code) and how long each took.

The LLM client's usage counters are read before and after a step, so a step that made a model call, or was answered
from the cache, is marked as AI without the stage code having to say so."""
import time
from contextlib import contextmanager


class Trace:
    def __init__(self, llm=None):
        self.llm = llm
        self.steps: list[dict] = []

    def _counters(self) -> tuple[int, int]:
        usage = getattr(self.llm, "usage", None)  # observability must never break processing: tolerate any LLM stand-in
        return getattr(usage, "calls", 0), getattr(usage, "cache_hits", 0)

    @contextmanager
    def step(self, stage: str, method: str = "rule", **detail):
        """Yields the record so the caller can add detail (or change `method`) while the stage runs."""
        rec = {"stage": stage, "method": method, **detail}
        calls0, hits0 = self._counters()
        t0 = time.perf_counter()
        try:
            yield rec
        finally:
            rec["ms"] = round((time.perf_counter() - t0) * 1000, 1)
            calls, hits = self._counters()
            if calls - calls0:
                rec["llm_calls"] = calls - calls0
            if hits - hits0:
                rec["cache_hits"] = hits - hits0
            if calls - calls0 or hits - hits0:
                rec["method"] = "llm"
            self.steps.append(rec)
