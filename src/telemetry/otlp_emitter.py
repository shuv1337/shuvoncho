"""
Buffered OTLP HTTP log emitter for Maple integration.

Converts Honcho's BaseEvent instances into OTLP LogRecord JSON and
POSTs them to an OTLP-compatible endpoint (e.g. Maple Ingest /v1/logs).

Drop-in alternative to the CloudEvents emitter — same buffer/flush/retry
semantics, different wire format.
"""

import asyncio
import contextlib
import json
import logging
import socket
from collections import deque
from datetime import datetime
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from src.telemetry.events.base import BaseEvent

logger = logging.getLogger(__name__)

# Nanoseconds per second
_NS = 1_000_000_000


def _dt_to_unix_nano(dt: datetime) -> str:
    """Convert datetime to OTLP timeUnixNano string."""
    return str(int(dt.timestamp() * _NS))


def _kv(key: str, value: Any) -> dict:
    """Build an OTLP KeyValue attribute."""
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}
    if isinstance(value, float):
        return {"key": key, "value": {"intValue": str(int(value))} if value == int(value) else {"doubleValue": value}}
    return {"key": key, "value": {"stringValue": str(value)}}


def _event_to_log_record(event: "BaseEvent", namespace: str | None) -> dict:
    """Convert a BaseEvent into an OTLP LogRecord dict."""
    event_data = event.model_dump(mode="json")
    timestamp = event_data.pop("timestamp", None)
    time_nano = _dt_to_unix_nano(event.timestamp)

    # Build attributes from event fields
    attributes = [
        _kv("event.type", event.event_type()),
        _kv("event.category", event.category()),
        _kv("event.schema_version", event.schema_version()),
        _kv("event.id", event.generate_id()),
    ]
    if namespace:
        attributes.append(_kv("service.namespace", namespace))

    # Promote key fields to attributes for queryability
    for key in ("workspace_name", "session_name", "peer_id", "observed",
                "run_id", "resource_type", "resource_id"):
        if key in event_data:
            attributes.append(_kv(key, event_data[key]))

    return {
        "timeUnixNano": time_nano,
        "observedTimeUnixNano": time_nano,
        "severityNumber": 9,  # INFO
        "severityText": "INFO",
        "body": {"stringValue": json.dumps(event_data)},
        "attributes": attributes,
    }


class OTLPLogEmitter:
    """Buffered OTLP HTTP log emitter with retry logic.

    Same interface as TelemetryEmitter but emits OTLP LogRecord JSON
    to /v1/logs instead of CloudEvents.
    """

    def __init__(
        self,
        endpoint: str | None = None,
        headers: dict[str, str] | None = None,
        namespace: str | None = None,
        batch_size: int = 100,
        flush_interval_seconds: float = 1.0,
        flush_threshold: int = 50,
        max_retries: int = 3,
        max_buffer_size: int = 10000,
        enabled: bool = True,
    ):
        self.endpoint = endpoint.rstrip("/") if endpoint else None
        self.headers = headers or {}
        self.namespace = namespace
        self.batch_size = batch_size
        self.flush_interval = flush_interval_seconds
        self.flush_threshold = flush_threshold
        self.max_retries = max_retries
        self.max_buffer_size = max_buffer_size
        self.enabled = enabled and endpoint is not None

        self._buffer: deque[dict] = deque(maxlen=max_buffer_size)
        self._flush_task: asyncio.Task[None] | None = None
        self._client: httpx.AsyncClient | None = None
        self._running = False
        self._lock = asyncio.Lock()

        # Resource attributes (set once)
        self._resource_attrs = [
            _kv("service.name", "shuvoncho"),
            _kv("service.version", self._get_version()),
            _kv("host.name", socket.gethostname().split(".")[0]),
        ]
        if namespace:
            self._resource_attrs.append(_kv("service.namespace", namespace))

    @staticmethod
    def _get_version() -> str:
        try:
            from importlib.metadata import version
            return version("honcho")
        except Exception:
            return "unknown"

    async def start(self) -> None:
        if not self.enabled:
            logger.info("OTLP log emitter disabled (no endpoint or disabled)")
            return

        self._client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Content-Type": "application/json",
                **self.headers,
            },
        )
        self._running = True
        self._flush_task = asyncio.create_task(self._periodic_flush())
        logger.info("OTLP log emitter started, endpoint: %s/v1/logs", self.endpoint)

    async def shutdown(self) -> None:
        if not self.enabled:
            return

        self._running = False
        if self._flush_task is not None:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._flush_task

        await self.flush()

        if self._client is not None:
            await self._client.aclose()
            self._client = None

        logger.info("OTLP log emitter shutdown complete")

    def emit(self, event: "BaseEvent") -> None:
        if not self.enabled:
            return

        try:
            log_record = _event_to_log_record(event, self.namespace)
        except Exception:
            logger.warning("Failed to convert event %s to OTLP", type(event).__name__, exc_info=True)
            return

        self._buffer.append(log_record)
        buffer_size = len(self._buffer)

        if buffer_size / self.max_buffer_size >= 0.8:
            logger.warning(
                "OTLP buffer at %.0f%% capacity (%d/%d)",
                (buffer_size / self.max_buffer_size) * 100,
                buffer_size,
                self.max_buffer_size,
            )

        if buffer_size >= self.flush_threshold and self._running:
            asyncio.create_task(self.flush())

    async def flush(self) -> None:
        if not self.enabled or not self._buffer or self._client is None:
            return

        async with self._lock:
            while self._buffer:
                batch: list[dict] = []
                while self._buffer and len(batch) < self.batch_size:
                    batch.append(self._buffer.popleft())

                if not batch:
                    break

                success = await self._send_batch(batch)
                if not success:
                    for record in reversed(batch):
                        self._buffer.appendleft(record)
                    logger.warning("Failed to send %d log records, returned to buffer", len(batch))
                    break

    async def _send_batch(self, batch: list[dict]) -> bool:
        if self._client is None or self.endpoint is None:
            return False

        payload = {
            "resourceLogs": [{
                "resource": {"attributes": self._resource_attrs},
                "scopeLogs": [{
                    "scope": {"name": "shuvoncho.telemetry"},
                    "logRecords": batch,
                }],
            }],
        }

        for attempt in range(self.max_retries):
            try:
                response = await self._client.post(
                    f"{self.endpoint}/v1/logs",
                    content=json.dumps(payload).encode(),
                )
                response.raise_for_status()
                logger.debug("Sent %d OTLP log records (status: %d)", len(batch), response.status_code)
                return True

            except httpx.HTTPStatusError as e:
                logger.warning("HTTP error sending OTLP logs (attempt %d/%d): %s", attempt + 1, self.max_retries, e)
            except httpx.RequestError as e:
                logger.warning("Request error sending OTLP logs (attempt %d/%d): %s", attempt + 1, self.max_retries, e)

            if attempt < self.max_retries - 1:
                await asyncio.sleep(2 ** attempt)

        return False

    async def _periodic_flush(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                if self._buffer:
                    await self.flush()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Error in periodic OTLP flush: %s", e)

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)

    @property
    def is_running(self) -> bool:
        return self._running


# ---------------------------------------------------------------------------
# Global instance management (mirrors emitter.py pattern)
# ---------------------------------------------------------------------------
_otlp_emitter: OTLPLogEmitter | None = None


def get_otlp_emitter() -> OTLPLogEmitter | None:
    return _otlp_emitter


async def initialize_otlp_emitter(
    endpoint: str | None = None,
    headers: dict[str, str] | None = None,
    namespace: str | None = None,
    batch_size: int = 100,
    flush_interval_seconds: float = 1.0,
    flush_threshold: int = 50,
    max_retries: int = 3,
    max_buffer_size: int = 10000,
    enabled: bool = True,
) -> OTLPLogEmitter:
    global _otlp_emitter

    _otlp_emitter = OTLPLogEmitter(
        endpoint=endpoint,
        headers=headers,
        namespace=namespace,
        batch_size=batch_size,
        flush_interval_seconds=flush_interval_seconds,
        flush_threshold=flush_threshold,
        max_retries=max_retries,
        max_buffer_size=max_buffer_size,
        enabled=enabled,
    )
    await _otlp_emitter.start()
    return _otlp_emitter


async def shutdown_otlp_emitter() -> None:
    global _otlp_emitter
    if _otlp_emitter is not None:
        await _otlp_emitter.shutdown()
        _otlp_emitter = None
