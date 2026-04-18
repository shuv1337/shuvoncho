"""
OTEL trace instrumentation for Shuvoncho.

Sets up a TracerProvider with an OTLP HTTP exporter pointed at the
same Maple ingest endpoint used by the OTLP log emitter, and installs
auto-instrumentation for FastAPI, SQLAlchemy, asyncpg, redis, and httpx.

Reuses these env vars (already set in ~/repos/shuvoncho/.env):

    TELEMETRY_OTLP_ENDPOINT       e.g. http://localhost:3474
    TELEMETRY_OTLP_HEADERS        JSON dict, e.g.
                                   {"x-maple-ingest-key": "maple_sk_..."}
    TELEMETRY_NAMESPACE           e.g. shuvoncho  (becomes service.namespace)

If TELEMETRY_OTLP_ENDPOINT is unset, tracing is a no-op — safe to import
anywhere.

Must be called BEFORE the FastAPI app is constructed (FastAPI instrumentor
needs to patch starlette at import time to trace middleware). We call it at
the top of main.py, before `app = FastAPI(...)`.
"""

from __future__ import annotations

import logging
import os
import socket

logger = logging.getLogger(__name__)

_initialized = False


def _get_version() -> str:
    try:
        from importlib.metadata import version
        return version("honcho")
    except Exception:
        return "unknown"


def setup_tracing() -> None:
    """Initialize OTEL tracing and auto-instrument libraries.

    Idempotent — safe to call multiple times.
    No-op if TELEMETRY_OTLP_ENDPOINT is unset.
    """
    global _initialized
    if _initialized:
        return

    from src.config import settings

    endpoint = settings.TELEMETRY.OTLP_ENDPOINT
    if not endpoint:
        logger.info("Tracing disabled (TELEMETRY_OTLP_ENDPOINT unset)")
        return

    # Deferred imports so nothing touches otel when tracing is disabled
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    # Resource: what identifies this service in Maple
    attrs = {
        "service.name": "shuvoncho",
        "service.version": _get_version(),
        "host.name": socket.gethostname().split(".")[0],
    }
    if settings.TELEMETRY.NAMESPACE:
        attrs["service.namespace"] = settings.TELEMETRY.NAMESPACE

    resource = Resource.create(attrs)
    provider = TracerProvider(resource=resource)

    headers: dict[str, str] = {}
    if settings.TELEMETRY.OTLP_HEADERS:
        headers.update(settings.TELEMETRY.OTLP_HEADERS)

    exporter = OTLPSpanExporter(
        endpoint=f"{endpoint.rstrip('/')}/v1/traces",
        headers=headers or None,
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # Don't capture traces for the ingest itself — self-referential loop
    from urllib.parse import urlparse

    ingest_host = urlparse(endpoint).netloc
    excluded = ",".join(
        s for s in (ingest_host, "/health", "/metrics") if s
    )
    os.environ.setdefault("OTEL_PYTHON_HTTPX_EXCLUDED_URLS", excluded)
    os.environ.setdefault("OTEL_PYTHON_REQUESTS_EXCLUDED_URLS", excluded)
    os.environ.setdefault("OTEL_PYTHON_FASTAPI_EXCLUDED_URLS",
                          "^/health,^/metrics,^/docs,^/openapi.json,^/redoc")

    # Auto-instrument. Import + instrument order matters: FastAPI
    # needs its instrumentor before app construction; DB/HTTP clients
    # can be done here too (patch at module level).
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # noqa: F401
    # FastAPI instrumentor is applied per-app in main.py via instrument_app()

    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        # For async engines, instrument the sync engine attribute.
        # We import here so the DB module is definitely initialized.
        try:
            from src.db import engine as db_engine
            SQLAlchemyInstrumentor().instrument(engine=db_engine.sync_engine)
        except Exception:
            # Fall back to global instrumentation
            SQLAlchemyInstrumentor().instrument()
    except Exception as e:
        logger.warning("SQLAlchemy instrumentation failed: %s", e)

    try:
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
        AsyncPGInstrumentor().instrument()
    except Exception as e:
        logger.debug("asyncpg instrumentation skipped: %s", e)

    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        RedisInstrumentor().instrument()
    except Exception as e:
        logger.warning("Redis instrumentation failed: %s", e)

    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        HTTPXClientInstrumentor().instrument()
    except Exception as e:
        logger.warning("httpx instrumentation failed: %s", e)

    # Add trace_id/span_id to log records (for correlation in Maple logs tab)
    try:
        from opentelemetry.instrumentation.logging import LoggingInstrumentor
        LoggingInstrumentor().instrument(set_logging_format=False)
    except Exception as e:
        logger.debug("logging instrumentation skipped: %s", e)

    _initialized = True
    logger.info(
        "OTEL tracing initialized, endpoint: %s/v1/traces",
        endpoint.rstrip("/"),
    )


def instrument_fastapi(app) -> None:
    """Instrument a FastAPI app instance.

    Call this AFTER `app = FastAPI(...)`. No-op if tracing wasn't set up.
    """
    if not _initialized:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls="^/health,^/metrics,^/docs,^/openapi.json,^/redoc",
        )
        logger.info("FastAPI OTEL instrumentation installed")
    except Exception as e:
        logger.warning("FastAPI instrumentation failed: %s", e)
