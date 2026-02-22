#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
WORKSPACE_ID="${WORKSPACE_ID:-ws_cross_app_smoke}"
USER_PEER="${USER_PEER:-u_person_cross_app}"
SHIV_AGENT="${SHIV_AGENT:-a_shiv}"
SHIVCORD_AGENT="${SHIVCORD_AGENT:-a_shivcord_demo}"
SHIV_SESSION="${SHIV_SESSION:-tg_chat_cross_demo}"
SHIVCORD_SESSION="${SHIVCORD_SESSION:-dc_thread_cross_demo}"

json_post() {
  local url="$1"
  local payload="$2"
  curl -sf -X POST "$url" -H 'Content-Type: application/json' -d "$payload"
}

echo "[1/8] Ensuring workspace + peers"
json_post "$BASE_URL/v3/workspaces" "{\"id\":\"$WORKSPACE_ID\"}" >/dev/null
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/peers" "{\"id\":\"$USER_PEER\"}" >/dev/null
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/peers" "{\"id\":\"$SHIV_AGENT\",\"configuration\":{\"observe_me\":false}}" >/dev/null
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/peers" "{\"id\":\"$SHIVCORD_AGENT\",\"configuration\":{\"observe_me\":false}}" >/dev/null

echo "[2/8] Creating shiv + shivcord sessions"
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/sessions" "{\"id\":\"$SHIV_SESSION\",\"peers\":{\"$USER_PEER\":{\"observe_me\":true,\"observe_others\":true},\"$SHIV_AGENT\":{\"observe_me\":false,\"observe_others\":true}}}" >/dev/null
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/sessions" "{\"id\":\"$SHIVCORD_SESSION\",\"peers\":{\"$USER_PEER\":{\"observe_me\":true,\"observe_others\":true},\"$SHIVCORD_AGENT\":{\"observe_me\":false,\"observe_others\":true}}}" >/dev/null

echo "[3/8] Ingest from shiv session"
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/sessions/$SHIV_SESSION/messages" "{\"messages\":[{\"content\":\"I prefer fish shell and concise output.\",\"peer_id\":\"$USER_PEER\"},{\"content\":\"Noted your fish shell preference.\",\"peer_id\":\"$SHIV_AGENT\"}]}" >/dev/null

echo "[4/8] Waiting for queue drain"
python3 - <<'PY'
import os,time,requests
base=os.environ.get('BASE_URL','http://localhost:8000')
ws=os.environ.get('WORKSPACE_ID','ws_cross_app_smoke')
for _ in range(60):
    j=requests.get(f"{base}/v3/workspaces/{ws}/queue/status",timeout=5).json()
    if j.get('pending_work_units',0)==0 and j.get('in_progress_work_units',0)==0:
        print('queue drained:',j)
        break
    time.sleep(1)
else:
    raise SystemExit('queue did not drain in time')
PY

echo "[5/8] Recall from shivcord session (should see fish shell preference)"
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/peers/$USER_PEER/chat" "{\"session_id\":\"$SHIVCORD_SESSION\",\"query\":\"What shell preference does the user have?\",\"reasoning_level\":\"minimal\"}" | python3 -m json.tool

echo "[6/8] Ingest from shivcord session"
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/sessions/$SHIVCORD_SESSION/messages" "{\"messages\":[{\"content\":\"For JS projects, use pnpm by default.\",\"peer_id\":\"$USER_PEER\"},{\"content\":\"Understood: pnpm default for JS projects.\",\"peer_id\":\"$SHIVCORD_AGENT\"}]}" >/dev/null

echo "[7/8] Waiting for queue drain"
python3 - <<'PY'
import os,time,requests
base=os.environ.get('BASE_URL','http://localhost:8000')
ws=os.environ.get('WORKSPACE_ID','ws_cross_app_smoke')
for _ in range(60):
    j=requests.get(f"{base}/v3/workspaces/{ws}/queue/status",timeout=5).json()
    if j.get('pending_work_units',0)==0 and j.get('in_progress_work_units',0)==0:
        print('queue drained:',j)
        break
    time.sleep(1)
else:
    raise SystemExit('queue did not drain in time')
PY

echo "[8/8] Recall from shiv session (should see pnpm preference)"
json_post "$BASE_URL/v3/workspaces/$WORKSPACE_ID/peers/$USER_PEER/chat" "{\"session_id\":\"$SHIV_SESSION\",\"query\":\"What package manager preference does the user have for JS projects?\",\"reasoning_level\":\"minimal\"}" | python3 -m json.tool

echo "Cross-app memory smoke test complete."
