# Honcho Memory Rollout & Rollback (shiv + shivcord)

## Decisions locked

- **Production backend**: self-hosted shuvoncho
- **Production auth**: scoped keys with `HONCHO_API_KEY`

## Prerequisites

### Backend

```bash
cd /home/shuv/repos/shuvoncho
uv sync
bash scripts/runbook.sh start
bash scripts/runbook.sh status
```

### App dependencies

```bash
cd /home/shuv/repos/shiv && npm install
cd /home/shuv/repos/shivcord && pnpm install
```

## Feature flags

### Shiv (`~/.config/shiv/config.json`)

```json
{
  "memory": {
    "enabled": true,
    "mode": "ingest",
    "baseUrl": "http://127.0.0.1:8000",
    "reasoningLevel": "minimal",
    "timeoutMs": 1200,
    "maxHintChars": 2000
  }
}
```

### Shivcord (env)

```bash
export SHIVCORD_MEMORY_MODE=ingest
export SHIVCORD_MEMORY_BASE_URL=http://127.0.0.1:8000
export SHIVCORD_MEMORY_REASONING_LEVEL=minimal
export SHIVCORD_MEMORY_TIMEOUT_MS=1200
export SHIVCORD_MEMORY_MAX_HINT_CHARS=2000
```

### Production auth (scoped key)

```bash
# backend
export AUTH_USE_AUTH=true

# apps
export HONCHO_API_KEY=<scoped_key_here>
```

## Optional identity alias mapping

To share one person across telegram/discord, you can use either:

1. **JSON file mapping** (shiv + shivcord), or
2. **shivcord DB alias table** (`honcho_identity_alias`) for Discord-side canonical mapping.

### JSON file mapping

To share one person across telegram/discord, create a JSON file:

```json
{
  "u_telegram_123456": "u_person_alice",
  "u_discord_987654321": "u_person_alice"
}
```

- Shiv: set `memory.aliasesFile` to this path.
- Shivcord: set `SHIVCORD_MEMORY_ALIASES_FILE` to this path.

### Shivcord DB alias table

`shivcord` now supports alias lookup from SQLite table `honcho_identity_alias`.

Example insert/update:

```sql
INSERT INTO honcho_identity_alias (alias_peer_id, canonical_peer_id, source)
VALUES ('u_discord_987654321', 'u_person_alice', 'manual')
ON CONFLICT(alias_peer_id)
DO UPDATE SET canonical_peer_id=excluded.canonical_peer_id, source=excluded.source;
```

DB aliases take precedence over file aliases for Discord peer resolution.

## Rollout order

1. `mode=off` (default) on both apps.
2. Enable `ingest` on both apps.
3. Verify queue drains (`bash scripts/runbook.sh queue`).
4. Validate cross-app smoke:
   ```bash
   cd /home/shuv/repos/shuvoncho
   ./scripts/memory-cross-app-smoke.sh
   ```
5. Enable recall (`ingest_recall`) for canary users/channels.

## Live canary validation (shivcord)

```bash
# ingest mode canary
cd /home/shuv/repos/shivcord/discord
# set SHIVCORD_MEMORY_MODE=ingest in .env, restart shivcord
pnpm exec tsx --env-file .env src/cli.ts send -c <channel_id> -u <username> -p "memory ingest canary"

# ingest+recall mode canary
# set SHIVCORD_MEMORY_MODE=ingest_recall in .env, restart shivcord
pnpm exec tsx --env-file .env src/cli.ts send -c <channel_id> -u <username> -p "memory recall canary"
```

Expected logs in running shivcord process:
- `[MEMORY] mode=ingest enabled=true` (ingest canary)
- `[MEMORY] mode=ingest_recall enabled=true` + `[MEMORY] recall ...` (recall canary)

## Monitoring checks during rollout

```bash
# backend + queue
cd /home/shuv/repos/shuvoncho
bash scripts/runbook.sh status
bash scripts/runbook.sh queue
bash scripts/runbook.sh logs
```

- Shiv `/status` should show memory mode + queue depth + last sync.
- Shivcord logs should show `[MEMORY] recall ...` and `[OUTBOX] ... depth=...` lines.

Outage fail-open check:
```bash
cd /home/shuv/repos/shuvoncho
bash scripts/runbook.sh stop
# trigger one canary request in shiv/shivcord
# confirm session still completes and memory logs show fail-open warnings
bash scripts/runbook.sh start
```

## Immediate rollback

- Shiv: set `memory.mode` to `off`, restart shiv.
- Shivcord: `export SHIVCORD_MEMORY_MODE=off`, restart shivcord.

This is fail-open by design; core bot behavior should continue when Honcho is down.
