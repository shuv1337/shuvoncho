"""Frontend telemetry relay events for Honcho telemetry."""

from typing import ClassVar

from pydantic import Field

from src.telemetry.events.base import BaseEvent


class FrontendTelemetryRelayedEvent(BaseEvent):
    """Emitted when a frontend telemetry event is accepted by the backend relay."""

    _event_type: ClassVar[str] = "frontend.telemetry.relayed"
    _schema_version: ClassVar[int] = 1
    _category: ClassVar[str] = "frontend"

    event: str = Field(..., description="Frontend event name")
    workspace_id: str | None = Field(default=None, description="Workspace context")
    peer_id: str | None = Field(default=None, description="Peer context")
    session_id: str | None = Field(default=None, description="Session context")
    endpoint: str | None = Field(default=None, description="API endpoint involved")
    method: str | None = Field(default=None, description="HTTP method involved")
    status_code: int | None = Field(default=None, description="HTTP status code")
    latency_ms: float | None = Field(default=None, description="Measured latency")
    error: str | None = Field(default=None, description="Error string if applicable")
    request_id: str | None = Field(
        default=None, description="Frontend-generated request correlation ID"
    )
    route: str | None = Field(default=None, description="Frontend route")
    correlation_request_id: str | None = Field(
        default=None, description="Backend request ID assigned to relay call"
    )

    def get_resource_id(self) -> str:
        return (
            self.request_id
            or self.correlation_request_id
            or f"{self.event}:{self.route or 'unknown'}:{self.timestamp.isoformat()}"
        )


__all__ = ["FrontendTelemetryRelayedEvent"]
