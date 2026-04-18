"""
Manual OTEL span helpers for shuvoncho.

These are thin wrappers around opentelemetry.trace that produce no-op spans
when tracing is disabled — safe to sprinkle across the codebase.

Used by:
  - src/deriver/consumer.py, deriver.py — per-task root spans
  - src/dialectic/core.py — chat answer span
  - src/utils/clients.py — honcho_llm_call span with provider/model/token attrs
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Iterator
from typing import Any

logger = logging.getLogger(__name__)

# Resolved lazily so this module stays import-safe before setup_tracing runs.
_tracer: Any = None


def _get_tracer() -> Any:
    global _tracer
    if _tracer is None:
        try:
            from opentelemetry import trace
            _tracer = trace.get_tracer("shuvoncho")
        except Exception:
            return None
    return _tracer


@contextlib.contextmanager
def span(name: str, **attrs: Any) -> Iterator[Any]:
    """Start a span with the given name and attributes.

    Yields the span (or None if tracing unavailable). Records exceptions
    and sets ERROR status automatically.

    Usage:
        with span("deriver.process_summary", workspace=ws_name) as s:
            ...
            s.set_attribute("messages.count", n) if s else None
    """
    tracer = _get_tracer()
    if tracer is None:
        yield None
        return

    try:
        from opentelemetry.trace import Status, StatusCode
    except Exception:
        yield None
        return

    with tracer.start_as_current_span(name) as sp:
        for k, v in attrs.items():
            if v is None:
                continue
            try:
                sp.set_attribute(k, v)
            except Exception:
                # Attributes must be str/int/float/bool/seq — stringify anything else
                sp.set_attribute(k, str(v))
        try:
            yield sp
        except Exception as exc:
            sp.record_exception(exc)
            sp.set_status(Status(StatusCode.ERROR, str(exc)))
            raise


def annotate_llm_usage(
    span_obj: Any,
    *,
    provider: str | None = None,
    model: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
    iterations: int | None = None,
    finish_reasons: list[str] | None = None,
) -> None:
    """Attach provider/model/token attrs to an active span.

    Attribute names match hermes-gateway's convention so dashboards can
    aggregate across both services:
        llm.provider, llm.model,
        llm.tokens.input, llm.tokens.output, llm.tokens.cache_read,
        llm.tokens.cache_write, llm.tokens.total, llm.iterations,
        llm.finish_reason
    """
    if span_obj is None:
        return

    try:
        if provider:
            span_obj.set_attribute("llm.provider", provider)
        if model:
            span_obj.set_attribute("llm.model", model)
        if input_tokens is not None:
            span_obj.set_attribute("llm.tokens.input", int(input_tokens))
        if output_tokens is not None:
            span_obj.set_attribute("llm.tokens.output", int(output_tokens))
        if cache_read_input_tokens is not None:
            span_obj.set_attribute("llm.tokens.cache_read", int(cache_read_input_tokens))
        if cache_creation_input_tokens is not None:
            span_obj.set_attribute("llm.tokens.cache_write", int(cache_creation_input_tokens))
        total = (input_tokens or 0) + (output_tokens or 0)
        if total:
            span_obj.set_attribute("llm.tokens.total", total)
        if iterations is not None:
            span_obj.set_attribute("llm.iterations", int(iterations))
        if finish_reasons:
            span_obj.set_attribute("llm.finish_reason", finish_reasons[0])
    except Exception as e:
        logger.debug("annotate_llm_usage failed: %s", e)
