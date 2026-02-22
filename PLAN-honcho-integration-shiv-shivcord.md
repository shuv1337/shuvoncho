# PLAN-honcho-integration-shiv-shivcord

## Objective

Implement **shared Honcho/Shuvoncho memory** across:
- `shiv` (Telegram, Pi-core backend)
- `shivcord` (Discord, Pi-core backend)

So both agents can:
1. ingest user/assistant turns into a common memory backend,
2. retrieve relevant memory before answering,
3. share context when operating on the same projects and users.

---

## Scope & Non-Goals

### In scope
- Add Honcho client integration to both apps.
- Durable async ingestion (outbox + retries).
- Optional recall path (memory hints pre-prompt).
- Shared identity/workspace/session mapping strategy.
- Config flags + rollout controls.
- Tests + runbooks.

### Out of scope (initial)
- Replacing Pi-core session storage.
- Migrating all historical session archives on day 1.
- Building a separate microservice for identity resolution (start local/simple).

---

## Repositories and key files

### Honcho/Shuvoncho backend
- `README.md`
- `src/main.py`
- `src/routers/peers.py`
- `src/routers/messages.py`
- `src/routers/sessions.py`
- `src/routers/workspaces.py`
- `sdks/typescript/src/client.ts`
- `sdks/typescript/src/peer.ts`

### shiv
- `/home/shuv/repos/shiv/src/config.ts`
- `/home/shuv/repos/shiv/src/bootstrap.ts`
- `/home/shuv/repos/shiv/src/agent.ts`
- `/home/shuv/repos/shiv/src/telegram.ts`
- `/home/shuv/repos/shiv/src/runtime-state.ts`
- `/home/shuv/repos/shiv/package.json`
- `/home/shuv/repos/shiv/test/*`

### shivcord
- `/home/shuv/repos/shivcord/discord/src/config.ts`
- `/home/shuv/repos/shivcord/discord/src/pi-session-handler.ts`
- `/home/shuv/repos/shivcord/discord/src/discord-bot.ts`
- `/home/shuv/repos/shivcord/discord/src/backend-adapter.ts`
- `/home/shuv/repos/shivcord/discord/src/database.ts`
- `/home/shuv/repos/shivcord/discord/src/db.ts`
- `/home/shuv/repos/shivcord/discord/schema.prisma`
- `/home/shuv/repos/shivcord/discord/src/schema.sql`
- `/home/shuv/repos/shivcord/discord/package.json`

---

## Architecture decisions (must lock before coding)

- [x] **D1: Backend mode**
  - [x] Use local self-hosted shuvoncho on this machine (`http://127.0.0.1:8000`) for development.
  - [x] Decide prod target (self-hosted vs managed API URL). → **self-hosted shuvoncho**

- [x] **D2: Auth mode**
  - [x] Dev: allow `AUTH_USE_AUTH=false` if machine-local only.
  - [x] Prod: enable scoped keys and set `HONCHO_API_KEY`. → **scoped keys**

- [x] **D3: Workspace derivation**
  - [x] Standardize on `workspace_id = ws_<sha256(real_project_path)[:16]>`. ✅ implemented in both apps
  - [x] Always store raw path in metadata (`project_path`) for traceability.

- [x] **D4: Identity strategy**
  - [x] Default peer IDs:
    - [x] Discord user: `u_discord_<discordUserId>`
    - [x] Telegram user: `u_telegram_<telegramUserId>`
    - [x] Shiv agent: `a_shiv`
    - [x] Shivcord agent: `a_shivcord_<appIdShort>`
  - [x] Decide if phase-1 includes optional alias mapping (`discord + telegram -> canonical person`). ✅ config-file alias mapping implemented

- [x] **D5: Recall policy**
  - [x] Start with `reasoningLevel = minimal`.
  - [x] Timeout budget <= 1200ms.
  - [x] Fail-open (no memory must never block responses).

Decision log (2026-02-22):
- Prod backend target: self-hosted shuvoncho.
- Prod auth mode: scoped keys + `HONCHO_API_KEY`.
- Identity alias strategy: add optional `honcho_identity_alias` DB table (shivcord), keep file mapping support.

---

## Milestone 0 — Backend readiness (shuvoncho)

### 0.1 Local service bootstrap
- [x] In `/home/shuv/repos/shuvoncho`, create `.env` from `.env.template`.
- [x] Start infra (`postgres`, `redis`) via docker compose.
- [x] Run migrations.
- [x] Start API process.
- [x] Start deriver worker process.

### 0.2 Health checks
- [x] Verify API docs reachable.
- [x] Verify `/v3/workspaces` get-or-create works.
- [x] Verify queue status endpoint works (`/v3/workspaces/{workspace_id}/queue/status`).
- [x] Verify one end-to-end ingest + chat query manually (curl or SDK script).

Validation notes:
- 2026-02-21: Verified API docs (`/docs`), workspace get-or-create, queue status, and end-to-end ingest+chat via local scripts and curl against `127.0.0.1:8000`.

### 0.3 Operational scripts ✅
- [x] Add small runbook scripts (or docs) for:
  - [x] start/stop backend,
  - [x] reset local data,
  - [x] check queue backlog.

**Exit criteria**
- [x] Backend can ingest turns and answer chat queries locally.
- [x] Deriver queue drains reliably.

---

## Milestone 1 — Shared integration contract (both apps)

> Start by implementing a common shape in both repos (can extract later).

### 1.1 Contract design ✅
- [x] Define shared interfaces:
  - [x] `MemoryConfig`
  - [x] `MemoryIds`
  - [x] `MemoryIngestEvent`
  - [x] `MemoryRecallRequest` (explicit type implemented in both repos)
  - [x] `MemoryHint`
  - [x] `MemoryAdapter` methods:
    - [x] `init()`
    - [x] `enqueueUserTurn()`
    - [x] `enqueueAssistantTurn()`
    - [x] `getHints()`
    - [x] `flush()`
    - [x] `health()`

### 1.2 Deterministic ID utilities ✅
- [x] Implement safe ID normalizer (`[A-Za-z0-9_-]`, length guards).
- [x] Implement project-path hashing helper.
- [x] Implement session ID builders:
  - [x] shiv: `tg_chat_<chatId>_<sessionCounterOrEpoch>`
  - [x] shivcord: `dc_thread_<threadId>`

### 1.3 Durable outbox strategy ✅
- [x] Define common outbox semantics:
  - [x] at-least-once delivery,
  - [x] idempotency key per event,
  - [x] exponential backoff with jitter,
  - [x] max retry threshold + dead-letter marker.

**Exit criteria**
- [x] Both repos use the same ID and event schema semantics.

---

## Milestone 2 — Shiv: ingest-only integration

### 2.1 Dependencies and config
- [x] Add `@honcho-ai/sdk` to `/home/shuv/repos/shiv/package.json`.
- [x] Extend `/home/shuv/repos/shiv/src/config.ts` with `memory` section:
  - [x] `enabled`
  - [x] `mode: "off" | "ingest" | "ingest_recall"`
  - [x] `baseUrl`, `apiKey`
  - [x] `workspaceStrategy`
  - [x] `projectPath` override
  - [x] `reasoningLevel`
  - [x] `timeoutMs`
  - [x] `maxHintChars`
  - [x] `outbox` tuning (batch size, retry caps)

### 2.2 Memory module scaffold
- [x] Add new files:
  - [x] `/home/shuv/repos/shiv/src/memory/ids.ts`
  - [x] `/home/shuv/repos/shiv/src/memory/honcho.ts`
  - [x] `/home/shuv/repos/shiv/src/memory/outbox.ts`
  - [x] `/home/shuv/repos/shiv/src/memory/types.ts`

### 2.3 Bootstrap wiring
- [x] Initialize memory adapter in runner startup path (`/home/shuv/repos/shiv/src/agent.ts`, created during `createAgentRunner(...)`).
- [x] Pass memory adapter into runner execution path.

### 2.4 Ingestion hooks
- [x] In `/home/shuv/repos/shiv/src/telegram.ts`, enqueue every user message on receive.
- [x] In `/home/shuv/repos/shiv/src/agent.ts`, enqueue final assistant response in `onComplete` path.
- [x] Include metadata in each event:
  - [x] platform
  - [x] chat_id
  - [x] telegram_message_id
  - [x] attachment refs
  - [x] model/provider

### 2.5 Session lifecycle alignment
- [x] On `/new` in `/home/shuv/repos/shiv/src/telegram.ts`, rotate memory session ID mapping.
- [x] Ensure follow-up/steer messages are ingested as separate user turns.

### 2.6 Fail-open resilience
- [x] Memory failures must not fail user response.
- [x] Log warning + enqueue retry only.

**Exit criteria**
- [x] Shiv writes user + assistant turns into Honcho with retries.
- [x] No functional regression in existing Telegram behavior (unit/build checks passing).

---

## Milestone 3 — Shiv: recall integration

### 3.1 Pre-prompt hint retrieval
- [x] In `/home/shuv/repos/shiv/src/agent.ts`, before `agent.prompt(...)`, fetch memory hints when mode is `ingest_recall`.
- [x] Build safe injected block:
  - [x] compact bullet summary
  - [x] explicit stale-data warning
  - [x] max chars/tokens guard

### 3.2 Prompt hygiene
- [x] Never inject raw JSON blobs directly.
- [x] Strip unsafe or excessively long fields.
- [x] Ensure no duplicate injection for follow-up runs unless needed.

### 3.3 Status observability
- [x] Extend `/status` output in `/home/shuv/repos/shiv/src/telegram.ts` to show memory health:
  - [x] enabled/mode
  - [x] outbox depth
  - [x] last sync success/failure

**Exit criteria**
- [x] Shiv can recall relevant memory hints without increasing failure rate.

---

## Milestone 4 — Shivcord: ingest-only integration

### 4.1 Dependencies and config
- [x] Add `@honcho-ai/sdk` to `/home/shuv/repos/shivcord/discord/package.json`.
- [x] Extend `/home/shuv/repos/shivcord/discord/src/config.ts` with memory config getters/env support.

### 4.2 DB schema additions (durable queue + mapping)
- [x] Update `/home/shuv/repos/shivcord/discord/schema.prisma`:
  - [x] `honcho_thread_map`
  - [x] `honcho_outbox`
  - [x] optional `honcho_identity_alias` (if included in phase 1)
- [x] Regenerate client + update `/home/shuv/repos/shivcord/discord/src/schema.sql`.
- [x] Add migration handling in `/home/shuv/repos/shivcord/discord/src/db.ts`.
- [x] Add CRUD helpers in `/home/shuv/repos/shivcord/discord/src/database.ts`.

### 4.3 Memory module scaffold
- [x] Add new files:
  - [x] `/home/shuv/repos/shivcord/discord/src/memory/ids.ts`
  - [x] `/home/shuv/repos/shivcord/discord/src/memory/honcho.ts`
  - [x] `/home/shuv/repos/shivcord/discord/src/memory/outbox.ts`
  - [x] `/home/shuv/repos/shivcord/discord/src/memory/types.ts`

### 4.4 Ingestion hooks
- [x] In `/home/shuv/repos/shivcord/discord/src/discord-bot.ts`, enqueue user text/attachment events at receive time.
- [x] In `/home/shuv/repos/shivcord/discord/src/pi-session-handler.ts`, enqueue assistant final text on `agent_end` completion flow (not every delta).
- [x] Include metadata:
  - [x] guild_id, channel_id, thread_id
  - [x] discord_message_id
  - [x] worktree info
  - [x] model/provider

### 4.5 Thread-session mapping
- [x] Persist deterministic Honcho session mapping per thread in `honcho_thread_map`.
- [x] Keep separate from existing Pi session reference (`thread_sessions.session_id` currently stores `pi:file:*` / `pi:id:*`).

### 4.6 Fail-open resilience
- [x] If Honcho fails, shivcord still responds normally.
- [x] Outbox retries in background.

**Exit criteria**
- [x] Shivcord ingests user + assistant turns durably with no UX regression.

---

## Milestone 5 — Shivcord: recall integration

### 5.1 Pre-prompt hint retrieval
- [x] In `/home/shuv/repos/shivcord/discord/src/pi-session-handler.ts`, fetch hints before `session.prompt(...)`.
- [x] Inject compact hint block into prompt assembly.

### 5.2 Steering/follow-up compatibility
- [x] Ensure steer and follow-up paths also use recall policy appropriately.
- [x] Prevent duplicate hint spam during rapid steer bursts.

### 5.3 Verbosity-safe behavior
- [x] Keep memory hints internal (do not auto-echo memory metadata to thread).

**Exit criteria**
- [x] Shivcord recall path improves continuity while preserving responsiveness.

---

## Milestone 6 — Cross-app memory sharing (shiv + shivcord)

### 6.1 Workspace unification
- [x] Verify both apps compute identical workspace ID for same real project path.
- [x] Add diagnostics logging for `workspaceId` in both apps.

### 6.2 Identity unification
- [x] Implement optional alias mapping (if enabled):
  - [x] config-based mapping file or DB table
  - [x] canonical peer ID lookup before ingest/recall
- [x] Keep default isolated IDs when alias not configured.

### 6.3 Validation scenarios
- [x] Scenario A: user detail learned in shiv appears in shivcord recall.
- [x] Scenario B: project preference learned in shivcord appears in shiv recall.

**Exit criteria**
- [x] Proven cross-app recall on same machine/project setup.

Validation notes:
- 2026-02-21: Verified with `scripts/memory-cross-app-smoke.sh` against local shuvoncho (`http://127.0.0.1:8000`) with deriver queue draining between ingest and recall checks.

---

## Milestone 7 — Testing and QA

### 7.1 Shiv tests
- [x] Add unit tests under `/home/shuv/repos/shiv/test/` for:
  - [x] ID generation
  - [x] config validation
  - [x] outbox retry/backoff
  - [x] prompt injection truncation
- [x] Add integration-style test with mocked Honcho SDK client.

### 7.2 Shivcord tests
- [x] Add tests in `/home/shuv/repos/shivcord/discord/src/*.test.ts` for:
  - [x] DB mapping CRUD
  - [x] outbox worker behavior
  - [x] session mapping separation (Pi session ref vs Honcho session id)
  - [x] prompt injection formatting

### 7.3 End-to-end local validation
- [x] Bring up local shuvoncho backend.
- [x] Run shiv and shivcord simultaneously.
- [x] Validate ingest-only mode.
- [x] Validate ingest+recall mode.
- [x] Validate backend outage behavior (fail-open).

Validation notes:
- 2026-02-22: Confirmed both processes active together locally (`shiv` existing process on 127.0.0.1:8788 + `shivcord` live process) while Honcho backend and deriver were running.
- 2026-02-22: Live shivcord E2E validated via `src/cli.ts send ...` canary threads with explicit mode toggles:
  - `ingest`: session completed with memory mode `ingest`, no recall path invoked.
  - `ingest_recall`: session completed with recall path invoked (`[MEMORY] recall ...` logs).
  - backend outage: with shuvoncho stopped, sessions still completed; memory errors logged as fail-open without blocking responses.

### 7.4 Command validation
- [x] Shiv:
  - [x] `npm test`
  - [x] `npm run test:unit`
  - [x] `npm run build`
- [x] Shivcord:
  - [x] `pnpm --filter shivcord test`
  - [x] `pnpm --filter shivcord generate`
  - [x] `pnpm --filter shivcord prepublishOnly` (or equivalent typecheck build)

**Exit criteria**
- [x] Tests pass in both repos.
- [x] Manual E2E scenarios pass.

---

## Milestone 8 — Rollout strategy

### 8.1 Feature flags
- [x] Default both apps to `memory.mode = off` initially.
- [x] Enable `ingest` first.
- [x] After stability period, enable `ingest_recall` for canary users/channels.

Validation notes:
- 2026-02-22: Executed staged mode progression locally (`off` → `ingest` → `ingest_recall`) on shivcord with canary session threads.

### 8.2 Monitoring
- [x] Add structured logs for:
  - [x] enqueue success/failure
  - [x] outbox depth
  - [x] recall latency
  - [x] recall timeout/fallback counts
- [x] Add `/status` memory section in shiv and equivalent debug/status output in shivcord.

### 8.3 Rollback
- [x] Document immediate rollback: set mode to `off` and restart. (`docs/honcho-memory-rollout.md`)
- [x] Ensure no hard dependency on Honcho for core bot operation.

**Exit criteria**
- [x] Controlled gradual rollout with quick rollback path.

---

## Optional Milestone 9 — Historical backfill

- [ ] Shiv: parse archived `sessions/*.jsonl` and backfill selected windows.
- [ ] Shivcord: backfill from thread history where useful.
- [ ] Throttle ingestion to avoid queue overload.
- [ ] Tag backfilled events (`metadata.source = "backfill"`).

---

## API usage reference (via SDK)

- [x] Workspace get-or-create
- [x] Peer get-or-create (`user` and `agent`)
- [x] Session get-or-create
- [x] Add peers to session
- [x] Add messages to session
- [x] Recall path: `peer.chat(query, { session, reasoningLevel })`
- [x] Queue monitoring: workspace queue status (for diagnostics)

---

## Acceptance checklist (final)

- [x] Shiv and shivcord both ingest user+assistant turns to Honcho.
- [x] Both apps continue working when Honcho is down.
- [x] Recall hints are injected safely and bounded.
- [x] Cross-app shared memory works for same project/user mapping.
- [x] All new tests pass.
- [x] Rollout + rollback docs are complete.
