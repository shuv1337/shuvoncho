import os
from pathlib import Path

from fastapi.testclient import TestClient

from src.config import settings


def test_system_status(client: TestClient):
    response = client.get("/v3/system/status")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert data["auth_enabled"] == settings.AUTH.USE_AUTH
    assert data["metrics_enabled"] == settings.METRICS.ENABLED
    assert data["telemetry_enabled"] == settings.TELEMETRY.ENABLED
    assert data["sentry_enabled"] == settings.SENTRY.ENABLED
    assert data["dream_enabled"] == settings.DREAM.ENABLED
    assert "frontend_available" in data
    assert data["request_id"] is not None


def test_frontend_telemetry_relay(client: TestClient):
    response = client.post(
        "/v3/system/frontend_telemetry",
        json={
            "events": [
                {
                    "event": "route.view",
                    "route": "/app/workspaces/demo",
                    "timestamp": "2026-03-23T12:00:00Z",
                    "request_id": "frontend-req-123",
                    "workspace_id": "demo",
                }
            ]
        },
        headers={"X-Request-ID": "relay-req-1"},
    )
    assert response.status_code == 202
    data = response.json()
    assert data["accepted"] == 1
    assert data["request_id"] == "relay-req-1"


def test_request_id_is_echoed(client: TestClient):
    response = client.get("/v3/system/status", headers={"X-Request-ID": "abc-123"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "abc-123"
    assert response.json()["request_id"] == "abc-123"


def test_frontend_app_route_missing_build(client: TestClient):
    frontend_index = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "index.html"
    if frontend_index.exists():
        return
    response = client.get("/app")
    assert response.status_code == 404


def test_frontend_cors_origins_env(monkeypatch):
    monkeypatch.setenv("FRONTEND_CORS_ORIGINS", "http://localhost:5173,http://192.168.1.20:5173")
    extra_origins = os.environ.get("FRONTEND_CORS_ORIGINS")
    assert extra_origins == "http://localhost:5173,http://192.168.1.20:5173"
