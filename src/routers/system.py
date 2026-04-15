import logging
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from fastapi import APIRouter, Body, Depends, Request

from src import schemas
from src.config import settings
from src.security import require_auth
from src.telemetry.events import emit
from src.telemetry.events.frontend import FrontendTelemetryRelayedEvent

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/system",
    tags=["system"],
)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _frontend_index_exists() -> bool:
    return (_project_root() / "frontend" / "dist" / "index.html").exists()


def _app_version() -> str:
    try:
        return version("honcho")
    except PackageNotFoundError:
        return "unknown"


@router.get(
    "/status",
    response_model=schemas.SystemStatusResponse,
    dependencies=[Depends(require_auth())],
)
async def get_system_status(request: Request):
    """Return safe instance-level status and feature flags for the local control plane."""
    return schemas.SystemStatusResponse(
        version=_app_version(),
        auth_enabled=settings.AUTH.USE_AUTH,
        metrics_enabled=settings.METRICS.ENABLED,
        telemetry_enabled=settings.TELEMETRY.ENABLED,
        sentry_enabled=settings.SENTRY.ENABLED,
        dream_enabled=settings.DREAM.ENABLED,
        frontend_available=_frontend_index_exists(),
        request_id=getattr(request.state, "request_id", None),
    )


@router.post(
    "/frontend_telemetry",
    response_model=schemas.FrontendTelemetryRelayResponse,
    status_code=202,
    dependencies=[Depends(require_auth())],
)
async def relay_frontend_telemetry(
    request: Request,
    payload: schemas.FrontendTelemetryBatch = Body(...),
):
    """Accept frontend telemetry events, log them structurally, and relay to the telemetry pipeline."""
    accepted = 0

    for event in payload.events:
        logger.info(
            "frontend_telemetry %s",
            event.model_dump_json(exclude_none=True),
        )
        emit(
            FrontendTelemetryRelayedEvent(
                event=event.event,
                workspace_id=event.workspace_id,
                peer_id=event.peer_id,
                session_id=event.session_id,
                endpoint=event.endpoint,
                method=event.method,
                status_code=event.status_code,
                latency_ms=event.latency_ms,
                error=event.error,
                request_id=event.request_id,
                route=event.route,
                correlation_request_id=getattr(request.state, "request_id", None),
                timestamp=event.timestamp,
            )
        )
        accepted += 1

    return schemas.FrontendTelemetryRelayResponse(
        accepted=accepted,
        request_id=getattr(request.state, "request_id", None),
    )
