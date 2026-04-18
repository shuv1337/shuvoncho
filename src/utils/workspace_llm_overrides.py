"""Per-workspace LLM provider/model overrides.

Local patch: routes all LLM calls for designated workspaces through an
alternate provider/model pair. Parsed from env vars of the form:

    WORKSPACE_MODEL_OVERRIDE__<WS>__PROVIDER=custom
    WORKSPACE_MODEL_OVERRIDE__<WS>__MODEL=supergemma4-26b-uncensored-v2
    WORKSPACE_MODEL_OVERRIDE__<WS>__BACKUP_PROVIDER=none        # optional
    WORKSPACE_MODEL_OVERRIDE__<WS>__BACKUP_MODEL=none            # optional

Workspace name match is case-insensitive. To pin a workspace with uppercase
letters or underscores, substitute ``_`` for ``_`` (keep as-is) - the env-var
<WS> segment is compared as lower() against workspace_name.lower().

The helper returns a *copy* of the base pydantic settings object with
PROVIDER/MODEL (and optionally BACKUP_*) overridden. If no override matches,
the original object is returned unchanged.
"""

from __future__ import annotations

import logging
import os
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

_PREFIX = "WORKSPACE_MODEL_OVERRIDE__"


def _parse_overrides() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for k, v in os.environ.items():
        if not k.startswith(_PREFIX):
            continue
        suffix = k[len(_PREFIX) :]
        # Expected: <WS>__<FIELD>
        parts = suffix.split("__")
        if len(parts) != 2:
            continue
        ws, field = parts
        field = field.upper()
        if field not in {"PROVIDER", "MODEL", "BACKUP_PROVIDER", "BACKUP_MODEL"}:
            continue
        out.setdefault(ws.lower(), {})[field] = v
    return out


_OVERRIDES: dict[str, dict[str, str]] | None = None


def _get_overrides() -> dict[str, dict[str, str]]:
    """Lazy accessor so that we parse env vars *after* ``src.config``
    (which calls ``load_dotenv(override=True)``) has had a chance to run."""
    global _OVERRIDES
    if _OVERRIDES is None:
        _OVERRIDES = _parse_overrides()
        if _OVERRIDES:
            logger.info(
                "workspace_llm_overrides: loaded overrides for workspaces=%s",
                sorted(_OVERRIDES.keys()),
            )
    return _OVERRIDES


def _coerce_optional(val: str | None) -> str | None:
    if val is None:
        return None
    if val.strip().lower() in {"", "none", "null"}:
        return None
    return val


def override_settings_for_workspace(base_settings: T, workspace_name: str | None) -> T:
    """Return a copy of ``base_settings`` with workspace-scoped overrides applied.

    If the workspace has no override configured, returns the original object.
    Uses pydantic ``model_copy(update=...)`` semantics; the returned object is
    a shallow copy with the overridden fields replaced.
    """
    if not workspace_name:
        return base_settings
    ov = _get_overrides().get(workspace_name.lower())
    if not ov:
        return base_settings

    update: dict[str, Any] = {}
    if "PROVIDER" in ov:
        update["PROVIDER"] = ov["PROVIDER"]
    if "MODEL" in ov:
        update["MODEL"] = ov["MODEL"]
    # Disable backup when overriding to a local provider unless explicitly set.
    # Only apply BACKUP_* if the base settings object actually has those fields.
    if hasattr(base_settings, "BACKUP_PROVIDER"):
        if "BACKUP_PROVIDER" in ov:
            update["BACKUP_PROVIDER"] = _coerce_optional(ov["BACKUP_PROVIDER"])
        elif "PROVIDER" in ov:
            # Override present but no backup specified: disable backup so we
            # don't silently fall back to openai/anthropic for local routing.
            update["BACKUP_PROVIDER"] = None
    if hasattr(base_settings, "BACKUP_MODEL"):
        if "BACKUP_MODEL" in ov:
            update["BACKUP_MODEL"] = _coerce_optional(ov["BACKUP_MODEL"])
        elif "PROVIDER" in ov:
            update["BACKUP_MODEL"] = None

    try:
        updated = base_settings.model_copy(update=update)  # type: ignore[attr-defined]
    except AttributeError:
        logger.warning(
            "workspace_llm_overrides: settings object has no model_copy(); "
            "returning base unchanged (workspace=%s)",
            workspace_name,
        )
        return base_settings

    logger.debug(
        "workspace_llm_overrides: workspace=%s applied=%s",
        workspace_name,
        update,
    )
    return updated


def has_override(workspace_name: str | None) -> bool:
    if not workspace_name:
        return False
    return workspace_name.lower() in _get_overrides()
