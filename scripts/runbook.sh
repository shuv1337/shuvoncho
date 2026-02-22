#!/usr/bin/env bash
# Shuvoncho local backend runbook
# Usage: ./scripts/runbook.sh <command>

set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
API_SESSION="shuvoncho-api"
DERIVER_SESSION="shuvoncho-deriver"

cmd="${1:-help}"

start_api_tmux() {
  if tmux has-session -t "$API_SESSION" 2>/dev/null; then
    echo "API tmux session already running: $API_SESSION"
    return
  fi

  tmux new-session -d -s "$API_SESSION" "cd '$REPO' && uv run uvicorn src.main:app --host 127.0.0.1 --port 8000"
  echo "Started API in tmux session: $API_SESSION"
}

start_deriver_tmux() {
  if tmux has-session -t "$DERIVER_SESSION" 2>/dev/null; then
    echo "Deriver tmux session already running: $DERIVER_SESSION"
    return
  fi

  tmux new-session -d -s "$DERIVER_SESSION" "cd '$REPO' && DERIVER_FLUSH_ENABLED=true uv run python -m src.deriver"
  echo "Started deriver in tmux session: $DERIVER_SESSION"
}

stop_tmux_session() {
  local session_name="$1"
  if tmux has-session -t "$session_name" 2>/dev/null; then
    tmux kill-session -t "$session_name"
    echo "Stopped tmux session: $session_name"
  else
    echo "tmux session not running: $session_name"
  fi
}

api_healthy() {
  curl -sf "http://localhost:8000/v3/workspaces" -X POST \
    -H "Content-Type: application/json" \
    -d '{"id":"shuvoncho"}' >/dev/null
}

case "$cmd" in
  start)
    echo "Starting infra (postgres:5433, redis:6379)..."
    docker compose -f "$REPO/docker-compose.yml" up -d database redis

    echo "Waiting for postgres health..."
    for i in $(seq 1 30); do
      if docker compose -f "$REPO/docker-compose.yml" ps database | grep -q "(healthy)"; then
        break
      fi
      sleep 1
    done

    echo "Running migrations..."
    cd "$REPO" && uv run alembic upgrade head

    start_api_tmux
    start_deriver_tmux

    echo "Waiting for API readiness..."
    for i in $(seq 1 30); do
      if api_healthy; then
        echo "✓ API healthy"
        break
      fi
      sleep 1
      if [[ "$i" == "30" ]]; then
        echo "✗ API not responding yet"
      fi
    done
    ;;

  stop)
    stop_tmux_session "$API_SESSION"
    stop_tmux_session "$DERIVER_SESSION"

    docker compose -f "$REPO/docker-compose.yml" stop
    echo "Infra stopped."
    ;;

  status)
    echo "=== Docker services ==="
    docker compose -f "$REPO/docker-compose.yml" ps

    echo ""
    echo "=== API health ==="
    if api_healthy; then
      curl -sf "http://localhost:8000/v3/workspaces/shuvoncho/queue/status" || true
      echo ""
    else
      echo "API not responding"
    fi

    echo ""
    echo "=== tmux sessions ==="
    if tmux has-session -t "$API_SESSION" 2>/dev/null; then
      echo "API: running ($API_SESSION)"
    else
      echo "API: not running"
    fi

    if tmux has-session -t "$DERIVER_SESSION" 2>/dev/null; then
      echo "Deriver: running ($DERIVER_SESSION)"
    else
      echo "Deriver: not running"
    fi
    ;;

  queue)
    echo "=== Queue status ==="
    api_healthy >/dev/null
    curl -sf "http://localhost:8000/v3/workspaces/shuvoncho/queue/status" | python3 -m json.tool
    ;;

  reset)
    echo "WARNING: This will delete all local Honcho data!"
    read -rp "Continue? (yes/N): " confirm
    [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

    stop_tmux_session "$API_SESSION"
    stop_tmux_session "$DERIVER_SESSION"

    docker compose -f "$REPO/docker-compose.yml" down -v
    echo "All data cleared."
    ;;

  logs)
    echo "=== API logs (tmux capture) ==="
    if tmux has-session -t "$API_SESSION" 2>/dev/null; then
      tmux capture-pane -pt "$API_SESSION" -S -200
    else
      echo "API session not running"
    fi

    echo ""
    echo "=== Deriver logs (tmux capture) ==="
    if tmux has-session -t "$DERIVER_SESSION" 2>/dev/null; then
      tmux capture-pane -pt "$DERIVER_SESSION" -S -200
    else
      echo "Deriver session not running"
    fi
    ;;

  attach-api)
    tmux attach -t "$API_SESSION"
    ;;

  attach-deriver)
    tmux attach -t "$DERIVER_SESSION"
    ;;

  help|*)
    echo "Shuvoncho backend runbook"
    echo ""
    echo "Commands:"
    echo "  start          — Start infra, run migrations, start API + deriver (tmux)"
    echo "  stop           — Stop API/deriver tmux sessions and infra"
    echo "  status         — Show service status, queue health, and tmux process state"
    echo "  queue          — Show queue backlog"
    echo "  reset          — Destroy all local data (destructive)"
    echo "  logs           — Show API + deriver logs from tmux"
    echo "  attach-api     — Attach to API tmux session"
    echo "  attach-deriver — Attach to deriver tmux session"
    ;;
esac
