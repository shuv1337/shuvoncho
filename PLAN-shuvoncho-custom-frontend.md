## Goal

Build a **custom local frontend** for Shuvoncho that mirrors the strongest parts of the managed Honcho dashboard while fitting this self-hosted codebase and local-first workflows.

The plan is optimized for:
- **Frontend:** React + Vite SPA mounted into FastAPI
- **MVP scope:** **full local control plane**
- **Auth:** **local no-auth first**, with a clear path to bearer/API-key auth later
- **Telemetry:** **day-zero, Maple-aligned telemetry**, not console-only instrumentation

This plan does **not** implement the frontend. It defines the architecture, phases, files, task breakdown, and validation steps.

---

## Glossary

| Term | Meaning |
|---|---|
| **Conclusion** | A derived fact stored by the deriver. The API, SDK, and this plan all use "conclusion." The internal model layer historically called these "documents" — ignore that naming; the frontend uses **conclusion** everywhere. |
| **Peer card** | A biographical summary of a peer, maintained by the deriver. |
| **Representation** | A formatted block of conclusions + peer card, returned by the representation endpoint. |
| **Dream** | A background consolidation pass that merges/deduplicates conclusions. Currently only the `omni` dream type exists. |

---

## Context and rationale

### What we learned

- The self-hosted Shuvoncho repo currently exposes a **FastAPI API only**; there is no bundled frontend in this repo today.
- The managed Honcho product **does** have a dashboard/UI for:
  - workspaces
  - peers
  - sessions
  - messages
  - representations / peer cards / context
  - API playground
  - performance / instance status
  - webhooks / keys / members / billing
- We found public docs and screenshots for that dashboard, but **no public upstream dashboard source repo** in the Plastic Labs org.

### Why custom frontend instead of a low-code tool

A custom frontend is the best long-term fit because it can:
- match the upstream information architecture closely
- speak the existing Honcho/Shuvoncho API natively
- expose domain-specific tools like peer context, session context, peer cards, queue status, and dream scheduling
- integrate telemetry from day one per project standard
- evolve without being constrained by a generic CRUD tool's abstraction model

### Important project constraints

- Prefer **safe, reversible** changes
- Validate changes before declaring success
- Telemetry is a **mandatory day-zero requirement**
- This repo is Python/FastAPI-based today; keep integration clean and maintainable
- First version should work well with `AUTH_USE_AUTH=false`, but avoid painting ourselves into a corner for auth later

---

## Existing backend capabilities we can build on

### App entrypoint

- FastAPI application lives in `src/main.py`
- Routers are mounted under `/v3` in `src/main.py`
- Prometheus metrics endpoint exists at `/metrics`
- **No static file serving infrastructure exists today** — no `StaticFiles` import, no mount, no SPA fallback route

### CORS configuration (important for frontend dev)

The current CORS `allow_origins` in `src/main.py` is hardcoded for a very small set of origins and does **not** include a Vite dev server origin such as `http://localhost:5173`.

Phase 0 must address this with:
- a Vite proxy for normal development
- **comma-separated** extra origin support via `FRONTEND_CORS_ORIGINS`

### Workspace endpoints

Router: `src/routers/workspaces.py` (prefix `/workspaces`)

Key capabilities:
- get/create workspace
- list workspaces
- update workspace
- delete workspace
- workspace search
- queue status
- schedule dream

**Important auth caveat:** workspace listing is effectively **admin-only** when auth is enabled. In no-auth mode this is fine because auth resolves to admin internally.

### Peer endpoints

Router: `src/routers/peers.py` (prefix `/workspaces/{workspace_id}/peers`)

Key capabilities:
- list peers
- get/create peer
- update peer
- list sessions for peer
- peer chat (streaming and non-streaming)
- peer representation
- get/set peer card
- peer context
- peer search

### Session endpoints

Router: `src/routers/sessions.py` (prefix `/workspaces/{workspace_id}/sessions`)

Key capabilities:
- list sessions
- get/create session
- update session
- delete session
- clone session
- add/set/remove peers in session
- get/set session peer config
- list session peers
- session context
- session summaries
- session search

### Message endpoints

Router: `src/routers/messages.py` (prefix `/workspaces/{workspace_id}/sessions/{session_id}/messages`)

Key capabilities:
- create messages
- upload file as messages
- list messages
- get message
- update message

### Conclusions endpoints

Router: `src/routers/conclusions.py`

Key capabilities:
- create conclusions
- list conclusions
- semantic query conclusions
- delete conclusion

**Important semantic-query caveat:** conclusion semantic search requires both `observer` and `observed`. There is no true workspace-global semantic query endpoint today.

### Webhooks and keys

- Webhooks router: `src/routers/webhooks.py`
- Keys router: `src/routers/keys.py`

Important behavior:
- webhooks list is **paginated**
- keys endpoint is **generation only** (`POST /v3/keys`), not a full key-management CRUD API
- when auth is disabled, key creation returns a disabled error

### Existing response schemas the UI can rely on

All in `src/schemas/api.py`:

| Schema | Class name |
|---|---|
| Workspace | `Workspace` |
| Peer | `Peer` |
| Representation | `RepresentationResponse` |
| Peer card | `PeerCardResponse` |
| Message | `Message` |
| Session | `Session` |
| Session context | `SessionContext` |
| Peer context | `PeerContext` |
| Session summaries | `SessionSummaries` |
| Conclusion | `Conclusion` |
| Queue status | `QueueStatus` |
| Schedule dream request | `ScheduleDreamRequest` |
| Webhook endpoint | `WebhookEndpoint` |

### Existing TypeScript SDK we should reuse

The repo contains a TypeScript SDK at `sdks/typescript/`.

**SDK is a local package** — it lives at `sdks/typescript/` with package name `@honcho-ai/sdk`. The frontend must reference it as a local file dependency, not install from npm:

```json
{
  "dependencies": {
    "@honcho-ai/sdk": "file:../sdks/typescript"
  }
}
```

The SDK must be built before the frontend can use it; add an automated prebuild hook so this is not a manual footgun.

#### SDK coverage by domain

| Domain | SDK status | Notes |
|---|---|---|
| Workspace-scoped peer/session/message flows | Strong | Good fit for frontend reuse |
| Peer utilities (representation/context/card/chat/search) | Strong | Good fit |
| Session utilities (context/summaries/search/queue) | Strong | Good fit |
| Conclusions for a specific observer/observed scope | Strong | `ConclusionScope` is pair-scoped |
| Webhooks | Missing | Use direct HTTP |
| Keys | Missing | Use direct HTTP |
| Arbitrary workspace admin CRUD/list management | Partial/awkward | Prefer direct HTTP in frontend control plane |
| Per-request request-ID / telemetry hooks | Missing | Requires local SDK patch or wrapper |

#### SDK pagination note

The SDK `Page` class wraps **page/size pagination**, not cursor pagination. All UI list views should be designed around explicit page number + page size.

### SDK usage strategy

The frontend should:
- use the SDK for peer / session / message / scoped-conclusion flows
- use direct HTTP for:
  - workspace list/create/update/delete flows in the control plane
  - webhooks
  - keys
  - playground requests
  - system/status and telemetry relay endpoints
  - workspace-wide conclusions listing where that is more convenient than forcing pair-scoped SDK abstractions
- patch the local SDK **only if needed** to support per-request headers / request-correlation hooks cleanly

---

## Product direction for the custom frontend

### Target UX

A local-first control plane that mirrors the upstream dashboard structure:

1. **Explore**
   - workspace picker/list
   - workspace overview
   - peer list
   - session list
   - session detail/messages
   - conclusions exploration

2. **Utilities**
   - peer representation viewer
   - peer context viewer
   - peer card viewer/editor
   - session context viewer
   - session summaries viewer
   - search interfaces
   - queue status
   - schedule dream

3. **API / Ops**
   - API playground
   - **key generator** (not full key management, unless backend expands later)
   - webhooks
   - performance/metrics-style page
   - instance health/status

### MVP navigation proposal

- `/app`
- `/app/workspaces`
- `/app/workspaces/:workspaceId`
- `/app/workspaces/:workspaceId/peers`
- `/app/workspaces/:workspaceId/peers/:peerId`
- `/app/workspaces/:workspaceId/sessions`
- `/app/workspaces/:workspaceId/sessions/:sessionId`
- `/app/workspaces/:workspaceId/conclusions`
- `/app/playground`
- `/app/metrics`
- `/app/webhooks`
- `/app/keys`

### MVP page responsibilities

#### Workspace list
- list accessible workspaces
- create workspace
- navigate into workspace
- in auth-enabled non-admin mode, gracefully degrade to **current-workspace-only** UX instead of assuming global listing works

#### Workspace overview
- summary cards
- peer count
- session count
- queue status snapshot
- quick actions for create peer/session
- recent peers/sessions
- config/metadata viewer

#### Peer list
- sortable/filterable peers table with pagination
- create/update peer
- quick drill-down

#### Peer detail
- metadata/config view
- session membership
- peer card
- representation
- context
- search across peer messages
- chat/dialectic tool panel

#### Session list
- sortable/filterable sessions table with pagination
- create session
- clone/delete session

#### Session detail
- messages timeline with pagination
- filter by peer
- add messages
- upload file
- search session
- session peers management
- session peer config editing
- context tab
- summaries tab
- queue status tab

#### Conclusions view
- list conclusions with filters and pagination
- semantic query tool that **requires explicit observer + observed selection**
- inspect conclusion payloads (raw JSON inspector)
- optional delete action

#### Playground
- endpoint catalog auto-generated from the OpenAPI spec at `/openapi.json`
- path/query/body editor
- execute request action
- response inspector
- copy-as-cURL
- optional bearer token field for future auth mode

#### Metrics / health
- parse selected metrics from `/metrics` into cards/tables rather than dumping raw Prometheus text only
- queue status rollups
- message creation / dialectic call / worker counters where useful
- basic health/config status from a new `/v3/system/status` endpoint
- raw metrics text fallback viewer for debugging

#### Webhooks
- paginated list endpoints
- create endpoint
- delete endpoint
- test emit

#### Key generator
- create scoped key when auth is enabled
- show disabled-state guidance when `AUTH_USE_AUTH=false`
- clearly label this as **generation-only**, not full key management

### Dream scheduling form fields

The `ScheduleDreamRequest` schema requires:

| Field | Type | Required | Description |
|---|---|---|---|
| `observer` | string | yes | Observer peer name |
| `observed` | string | no | Observed peer name (defaults to observer) |
| `dream_type` | enum | yes | Currently only `"omni"` exists |
| `session_id` | string | no | Scope the dream to a specific session |

The dream scheduling UI should present these four fields with peer/session pickers and a dropdown for dream type (pre-populated with `omni`, extensible when new types are added).

The form must also handle a **dreams disabled** backend state gracefully.

---

## Technical architecture

### Recommended frontend stack

- **React**
- **Vite**
- **TypeScript**
- **bun** as the package manager
- **React Router** for page routing
- **TanStack Query** for server state
- **Tailwind CSS** for utility-first styling
- **shadcn/ui** for tables, tabs, forms, status badges, JSON viewers, empty states, code blocks, copy buttons
- **Honcho TypeScript SDK** (`@honcho-ai/sdk` as local file dependency) as the primary data-access layer where it maps cleanly
- direct HTTP helpers for control-plane gaps

### Recommended repository layout

Add a frontend package inside this repo:

```text
frontend/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.ts
  components.json
  src/
    main.tsx
    app/
    routes/
    components/
    features/
    lib/
    styles/
```

Suggested internal frontend structure:

```text
frontend/src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  lib/
    honcho.ts              # SDK wrapper
    api.ts                 # direct HTTP helpers
    auth.ts                # token injection abstraction
    telemetry.ts           # event emission + relay
    request-id.ts          # request ID generator/helpers
    format.ts              # entity formatters
  components/
    ui/
    layout/
    data-table/
    code-viewer/
    status-badge/
    json-view/
    empty-state/
  features/
    workspaces/
    peers/
    sessions/
    messages/
    conclusions/
    webhooks/
    keys/
    playground/
    metrics/
    system/
  routes/
    workspaces/
    peers/
    sessions/
    conclusions/
    playground/
    metrics/
```

### Frontend build/base requirements

The SPA will be served from `/app`, so Vite must be configured with:

```ts
base: '/app/'
```

Without this, built asset paths will point to `/assets/...` instead of `/app/assets/...` and production serving will break.

### FastAPI integration approach

Serve the built SPA from FastAPI in production/local-dev integration mode.

Required additions to `src/main.py`:
- import `StaticFiles`
- compute **absolute paths** to `frontend/dist` and `frontend/dist/assets`
- mount `StaticFiles` at `/app/assets`
- add `GET /app` returning `frontend/dist/index.html`
- add `GET /app/{path:path}` returning `frontend/dist/index.html`
- these routes must come **after** `/v3` routers and `/metrics` to avoid path conflicts

During development, use Vite's dev server with a proxy instead of serving from FastAPI.

### CORS strategy for development and LAN access

**Problem:** The Vite dev server runs on `http://localhost:5173` (or similar), which is not currently allowed by backend CORS.

**Solution (two-pronged):**

1. **Vite proxy (primary for development):**

```typescript
export default defineConfig({
  base: '/app/',
  server: {
    proxy: {
      '/v3': 'http://localhost:8000',
      '/metrics': 'http://localhost:8000',
      '/openapi.json': 'http://localhost:8000',
    },
  },
})
```

2. **Extend CORS for LAN/remote access:** Add optional `FRONTEND_CORS_ORIGINS` support to `src/main.py`. This should be a comma-separated list, e.g.:

```bash
FRONTEND_CORS_ORIGINS=http://localhost:5173,http://192.168.1.20:5173
```

### Why this architecture

- Keeps the API and UI in one repo
- Reuses the existing TypeScript SDK where it fits well
- Uses direct HTTP where the SDK is awkward or incomplete
- Allows iterative rollout: read-heavy first, then full control plane
- Easy to deploy locally in one process after build
- Easy to run separately during development with Vite dev server + proxy
- Tailwind + shadcn/ui dramatically reduce component-building scope

---

## Auth strategy

### Phase 1: local no-auth first

Default behavior should assume auth is off (`AUTH_USE_AUTH=false`).

Frontend behavior:
- no login wall in local mode
- no required token entry for normal browsing
- key generator page should show explanatory disabled state when auth is off
- API playground should allow optional bearer token field, but not require it

### Phase 2: auth-ready architecture

Do not hardcode a no-auth assumption into the app architecture.

From day one, structure the app so that:
- HTTP client can optionally send `Authorization: Bearer ...`
- token can be sourced from local storage / env / user input later
- unauthorized states (401/403) are surfaced cleanly in UI
- routes/components can adapt to enabled auth without rewrite
- workspace listing degrades gracefully for non-admin scoped users

---

## Telemetry requirements for the frontend

Telemetry is mandatory and is part of MVP, not a later follow-up.

### Frontend telemetry objectives

For the UI, we need enough observability to answer:
- what page was opened?
- which workspace/peer/session was involved?
- which API action was triggered?
- did it succeed/fail?
- how long did it take?

### Minimum frontend telemetry contract

- [ ] route-view events
- [ ] action events for create/update/delete/search/chat/context/playground execution
- [ ] client-side latency measurement around major API calls
- [ ] explicit error telemetry for failed requests and failed render states
- [ ] stable entity IDs in event payloads where applicable (`workspace_id`, `peer_id`, `session_id`)
- [ ] events forwarded into the project telemetry pipeline via backend relay → Maple

### MVP telemetry implementation (concrete)

#### a. Frontend event emitter

`frontend/src/lib/telemetry.ts` should export a `track()` function that:
- emits structured JSON to `console.log` for immediate local debugging
- also forwards events to a new backend relay endpoint

```typescript
interface TelemetryEvent {
  event: string
  workspace_id?: string
  peer_id?: string
  session_id?: string
  endpoint?: string
  method?: string
  status_code?: number
  latency_ms?: number
  error?: string
  timestamp: string
  request_id?: string
  route?: string
}
```

#### b. Request correlation

All API calls from `frontend/src/lib/api.ts` and SDK-backed calls should attach an `X-Request-ID` header (UUID v4). The backend must be updated to:
- prefer incoming `X-Request-ID` when present
- fall back to generated IDs when absent
- echo the chosen request ID back in the response header

#### c. Request timing

Wrap all API calls with `performance.now()` timing. Emit telemetry events with `latency_ms`, `status_code`, `endpoint`, and `request_id`.

#### d. Route instrumentation

Use a React Router hook or app-shell effect to emit `route.view` on every navigation, including entity IDs derived from route params.

#### e. Backend telemetry relay

Add a lightweight backend endpoint, e.g. `POST /v3/system/frontend_telemetry`, that:
- accepts validated frontend telemetry events
- logs them structurally
- forwards them into the existing telemetry path aligned with Maple/CloudEvents where practical

This avoids browser credential/CORS issues and keeps telemetry consistent with backend observability standards.

### Frontend files needed

- `frontend/src/lib/telemetry.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/request-id.ts`
- route instrumentation in app shell/router

---

## Additional backend support required for the frontend

To make the control plane robust, add a small system/ops API surface:

### System status endpoint

Add `GET /v3/system/status` returning safe, non-secret instance info such as:
- version
- auth enabled
- metrics enabled
- telemetry enabled
- sentry enabled
- dream enabled
- base API URL hints if useful

This gives the Metrics/health page a real source of truth rather than inferring state from `/metrics` alone.

### Frontend telemetry relay endpoint

Add `POST /v3/system/frontend_telemetry` for validated browser telemetry events.

### Request ID behavior

Update backend request middleware to:
- use incoming `X-Request-ID` if present
- generate one otherwise
- set the resolved request ID on the response header

---

## Design direction

### Visual language

Use the upstream dashboard as inspiration, not a pixel-perfect clone:
- dark-first palette
- monospaced labels and counts
- left nav rail
- high-contrast data tables
- sparse, tool-like controls
- straightforward operational UX over decorative marketing polish
- small route/version/environment badge in the shell header so the user always knows what instance they are viewing

### UX principles

- prioritize exploration and inspection over dashboard fluff
- optimize for dense, inspectable data
- keep JSON visible and easy to copy
- allow quick drill-down from workspace → peer/session → messages/context
- make expensive operations visually distinct (chat, context generation, semantic query, dream scheduling)
- clearly label destructive actions

### Accessibility and usability considerations

- keyboard-navigable tables and tabs
- empty/loading/error states everywhere
- clear timestamps and timezone handling
- large raw text areas for context/representation output
- code/json blocks with copy buttons
- explicit disabled states for:
  - auth-disabled key generation
  - metrics-disabled metrics page
  - dreams-disabled scheduling form

---

## Recommended implementation phases

### Phase 0 — architecture and scaffolding

- [x] Create a frontend package under `frontend/`
- [x] Add Vite + React + TypeScript setup with **bun** as package manager
- [x] Add Tailwind CSS with dark mode configuration
- [x] Initialize shadcn/ui (`components.json` + base components)
- [x] Add React Router and TanStack Query
- [x] Add `@honcho-ai/sdk` as a local file dependency (`"file:../sdks/typescript"`)
- [x] Add an SDK rebuild step via `prebuild`/workspace script so frontend builds do not silently use stale SDK output
- [x] Configure Vite `base: '/app/'`
- [x] Add a shared app shell with left nav, top header, route/version badge, and content area
- [x] Add design tokens and base styling
- [x] Add environment/config handling for API base URL and optional bearer token
- [x] Add frontend telemetry scaffolding (`lib/telemetry.ts`, `lib/request-id.ts`)
- [x] Configure Vite proxy for `/v3/*`, `/metrics`, and `/openapi.json` → `http://localhost:8000`
- [x] Add `FRONTEND_CORS_ORIGINS` support to `src/main.py`
- [x] Add backend request-ID preference/echo behavior in `src/main.py`
- [x] Add `StaticFiles` mount for `frontend/dist/assets`
- [x] Add explicit `/app` route returning `index.html`
- [x] Add explicit `/app/{path:path}` SPA fallback returning `index.html`
- [x] Use **absolute paths** for all frontend-dist serving in FastAPI
- [x] Add new system router with `/v3/system/status`
- [x] Add new system router with `/v3/system/frontend_telemetry`

### Validation
- [x] `bun install` succeeds in `frontend/`
- [ ] `bun run dev` starts Vite dev server and loads a placeholder app
- [ ] API calls from Vite dev server to `/v3/workspaces` succeed (proxy works, no CORS errors)
- [x] `bun run build` produces static assets in `frontend/dist/`
- [ ] FastAPI can serve the built app at `/app`
- [ ] FastAPI can serve nested routes like `/app/workspaces/demo`
- [ ] built assets resolve under `/app/assets/...`
- [x] `/v3/system/status` returns expected config flags
- [ ] telemetry events appear in browser console and can be posted to the relay endpoint

---

### Phase 1 — data layer, SDK integration, and instrumentation

- [x] Create a frontend Honcho client wrapper (`lib/honcho.ts`) around `@honcho-ai/sdk`
- [x] Add direct HTTP helpers (`lib/api.ts`) for control-plane endpoints not cleanly covered by the SDK:
  - workspace admin CRUD/list
  - webhooks
  - keys
  - playground requests
  - system/status
  - telemetry relay
- [x] Decide and implement one request-correlation path:
  - **preferred:** patch local SDK HTTP client to support per-request headers or request hooks
  - fallback: route SDK traffic through a thin wrapper that can inject request IDs consistently
- [x] Add shared TanStack Query key conventions for workspaces/peers/sessions/messages/conclusions/webhooks/system
- [x] Add pagination handling using page/size semantics from day one
- [x] Add entity mappers/formatters where SDK responses need shaping for UI
- [x] Add consistent error handling and retry policy (TanStack Query retry + error boundary)
- [x] Add request timing instrumentation in both SDK-backed and direct HTTP paths
- [x] Add auth token injection abstraction in `lib/auth.ts`

### Validation
- [x] frontend can list workspaces through direct HTTP with pagination
- [ ] frontend can create/update workspaces through direct HTTP
- [x] frontend can load peer/session data through SDK
- [x] frontend can list session messages through SDK with pagination
- [ ] frontend can list scoped conclusions through SDK and workspace-wide conclusion lists through direct HTTP
- [x] frontend can call webhooks/key-generator/system endpoints through direct HTTP helper
- [x] request failures surface readable UI errors and telemetry events
- [ ] `X-Request-ID` is visible end-to-end in request/response handling

---

### Phase 2 — Explore core

### Workspace flows
- [x] Build workspace list page (paginated)
- [x] Build workspace create flow
- [x] Build workspace overview page
- [x] Add workspace metadata/config viewer/editor
- [x] Add queue status summary card to workspace overview
- [x] Add graceful scoped-auth fallback when workspace listing is not available

### Peer flows
- [x] Build peer list page (paginated)
- [x] Add peer create/edit flows
- [x] Build peer detail page shell
- [x] Show metadata/config
- [x] Show sessions-for-peer table (paginated)

### Session flows
- [x] Build session list page (paginated)
- [x] Add session create flow
- [ ] Add session clone/delete actions (with destructive-action confirmation)
- [x] Build session detail page shell
- [ ] Show session metadata/config
- [ ] Show session peers table

### Messages
- [x] Build messages timeline/tab in session detail (paginated)
- [ ] Add peer filter for messages
- [x] Add create message form
- [x] Add file upload flow for message ingestion

### Conclusions
- [x] Build workspace conclusions list page (paginated, direct HTTP)
- [x] Add semantic query tool that requires observer + observed selection
- [x] Add details panel / raw JSON inspector
- [ ] Add optional delete action

### Validation
- [x] can navigate workspace → peers → peer detail
- [x] can navigate workspace → sessions → session detail
- [x] can view/add messages in a session
- [x] can inspect conclusions with filters and scoped semantic query
- [x] pagination works on all list views (next/prev, page size)

---

### Phase 3 — utilities and advanced tools

### Peer utilities
- [x] Add peer representation tab
- [x] Add peer context tab
- [ ] Add peer card tab with edit/set support
- [ ] Add peer search tab
- [ ] Add dialectic chat panel with streaming support if feasible

### Session utilities
- [ ] Add session search tab
- [x] Add session context tab
- [x] Add session summaries tab
- [ ] Add session peer config editor
- [x] Add session queue status view

### Workspace utilities
- [ ] Add workspace-global search UI
- [ ] Add schedule dream form with observer (required), observed (optional), dream_type, and session_id (optional)
- [x] Add workspace queue breakdown view
- [ ] Add disabled/error state for dream scheduling when the feature is off

### Validation
- [ ] peer representation/context/card flows work end-to-end
- [ ] session context/summaries/search work end-to-end
- [ ] schedule dream can be triggered and result is visible in queue status
- [ ] dream scheduling form validates required fields and provides peer/session pickers
- [ ] dream-disabled state is clearly surfaced

---

### Phase 4 — local control plane pages

### API playground
- [x] Fetch OpenAPI spec from `/openapi.json` to auto-generate endpoint catalog
- [x] Group endpoints by tag (workspaces, peers, sessions, messages, conclusions, webhooks, keys, system)
- [x] Add path/query/body editor (pre-populate from OpenAPI parameter schemas)
- [x] Add execute request action
- [x] Add response inspector (JSON viewer with syntax highlighting)
- [x] Add copy-as-cURL
- [x] Add optional bearer token field

### Webhooks
- [x] Build paginated webhook list/create/delete pages (direct HTTP)
- [x] Add test emit action
- [x] Show disabled/error states clearly

### Key generator
- [x] Build create-key UI (direct HTTP)
- [x] Show auth-disabled state when `AUTH_USE_AUTH=false`
- [x] Support workspace/peer/session scoped key generation when auth is enabled
- [x] Label page copy as generation-only

### Metrics/health
- [x] Build metrics page using `/metrics` plus `/v3/system/status`
- [ ] Surface queue status, basic counters, and health notes
- [ ] Parse selected Prometheus counters into cards/tables
- [x] Add raw metrics text view for debugging
- [x] Add backend config awareness from system status (auth enabled, metrics enabled, sentry enabled, telemetry enabled, dream enabled)

### Validation
- [ ] API playground can successfully hit a representative set of endpoints
- [ ] playground endpoint catalog stays in sync with API (driven by OpenAPI spec)
- [ ] webhook CRUD/test works
- [ ] key generator behaves correctly in both no-auth and auth-enabled modes
- [ ] metrics page loads and shows useful local state
- [ ] metrics-disabled state is clearly surfaced

---

### Phase 5 — polish, hardening, and rollout

- [ ] Add loading skeletons and empty states for all list/detail pages
- [ ] Add copy buttons for IDs, JSON, context, representations
- [ ] Add destructive-action confirmations (delete workspace/session/conclusion, etc.)
- [ ] Add filter persistence (URL search params or localStorage)
- [ ] Add optimistic refresh/invalidation behavior where appropriate
- [ ] Review CORS/static serving needs for local browser access from LAN
- [ ] Add documentation for local frontend development and build/serve workflow
- [ ] Add tests for critical frontend routes/components
- [ ] Add backend validation tests for new static-serving routes, SPA fallback, system status, request-ID behavior, and telemetry relay

### Validation
- [ ] smooth navigation across entire control plane
- [ ] all major empty/loading/error states are covered
- [ ] docs allow a fresh developer to run both API and frontend locally
- [ ] telemetry path is validated end-to-end for frontend-originated events

---

## API-to-UI feature map

| UI area | Primary backend/API | Preferred access path |
|---|---|---|
| Workspace list/admin CRUD | `/v3/workspaces*` | direct HTTP |
| Workspace overview | workspace + peers + sessions + queue status | mixed |
| Peer list/detail | `/v3/workspaces/{workspace}/peers*` | TS SDK |
| Session list/detail | `/v3/workspaces/{workspace}/sessions*` | TS SDK |
| Messages | `/v3/workspaces/{workspace}/sessions/{session}/messages*` | TS SDK |
| Conclusions list | `/v3/workspaces/{workspace}/conclusions/list` | direct HTTP |
| Conclusions semantic query | `/v3/workspaces/{workspace}/conclusions/query` | direct HTTP |
| Peer context/card/representation/chat | peer utilities endpoints | TS SDK |
| Session context/summaries/search | session utilities endpoints | TS SDK |
| Queue status / schedule dream | workspace endpoints | TS SDK |
| Webhooks | `/v3/workspaces/{workspace}/webhooks*` | direct HTTP |
| Key generator | `/v3/keys` | direct HTTP |
| Playground | arbitrary endpoints + `/openapi.json` | direct HTTP |
| Metrics | `/metrics` | direct HTTP |
| System health/config | `/v3/system/status` | direct HTTP |
| Frontend telemetry relay | `/v3/system/frontend_telemetry` | direct HTTP |

---

## Proposed file changes

### New frontend files/directories

- [x] `frontend/package.json`
- [x] `frontend/tsconfig.json`
- [x] `frontend/vite.config.ts`
- [ ] `frontend/tailwind.config.ts`
- [x] `frontend/components.json`
- [x] `frontend/index.html`
- [x] `frontend/src/main.tsx`
- [x] `frontend/src/app/App.tsx`
- [x] `frontend/src/app/router.tsx`
- [x] `frontend/src/app/providers.tsx`
- [x] `frontend/src/lib/honcho.ts`
- [x] `frontend/src/lib/api.ts`
- [x] `frontend/src/lib/auth.ts`
- [x] `frontend/src/lib/telemetry.ts`
- [x] `frontend/src/lib/request-id.ts`
- [x] `frontend/src/components/ui/`
- [x] `frontend/src/styles/globals.css`
- [x] route/component files for each feature area

### Existing backend files that will change

- [x] `src/main.py`
  - Add `StaticFiles` import and absolute-path SPA serving
  - Add `/app` and `/app/{path:path}` handling
  - Add `FRONTEND_CORS_ORIGINS` support
  - Prefer/echo `X-Request-ID`
  - Include the new system router under `/v3`
- [x] `src/schemas/api.py`
  - Add schemas for system status and frontend telemetry relay
- [x] `src/routers/system.py`
  - Add system status endpoint
  - Add frontend telemetry relay endpoint
- [x] `src/routers/__init__.py`
  - Include system router export
- [ ] `README.md`
  - Frontend run/build instructions
  - SDK prebuild note
  - `/app` serving behavior
- [ ] possibly docs under `docs/`
  - local dashboard usage
  - auth-mode caveats

### SDK-related follow-up files

If we patch the SDK for per-request header injection / hooks:
- [x] `sdks/typescript/src/http/client.ts`
- [x] `sdks/typescript/src/client.ts`
- [ ] possibly related types/tests under `sdks/typescript/`

---

## Testing and validation plan

### Backend-side validation

- [ ] existing Python test suite remains green after backend integration changes
- [ ] targeted tests for static mount / SPA fallback behavior
- [x] targeted tests for `/v3/system/status`
- [x] targeted tests for frontend telemetry relay validation
- [x] targeted tests for request-ID preference/echo behavior
- [x] verify `/v3/*` API routes remain unaffected
- [x] verify `/metrics` remains unaffected

Commands:

```bash
uv run pytest -q
```

### Frontend-side validation

- [x] typecheck
- [x] build
- [ ] route smoke tests
- [ ] component tests for key screens
- [ ] basic browser/manual QA on main workflows

Commands:

```bash
cd frontend
bun run typecheck
bun run build
bun test
```

### End-to-end smoke checklist

- [ ] open `/app`
- [ ] create/select workspace
- [ ] create peer
- [ ] create session
- [ ] add peer to session
- [ ] add message(s)
- [ ] view session messages (with pagination)
- [ ] run peer search
- [ ] load peer representation/context/card
- [ ] load session context/summaries
- [ ] inspect conclusions with observer/observed-scoped semantic query
- [ ] trigger dream scheduling
- [ ] run API playground request
- [ ] load metrics page
- [ ] verify `/v3/system/status` values are reflected in UI
- [ ] verify telemetry events in browser console
- [ ] verify frontend telemetry reaches backend relay path
- [ ] verify request IDs correlate across frontend and backend

---

## Risks and mitigations

### Risk: frontend scope balloons too quickly
- **Mitigation:** deliver in phases, starting with Explore core and only then tools/control-plane extras

### Risk: SDK gaps slow implementation
- **Mitigation:** use direct HTTP wrappers for control-plane gaps instead of blocking on SDK changes

### Risk: auth later forces a large rewrite
- **Mitigation:** abstract auth token injection from day one and support scoped-user fallback UX for workspace selection

### Risk: CORS blocks the Vite dev server or LAN access
- **Mitigation:** use Vite proxy for development and add `FRONTEND_CORS_ORIGINS` for LAN/remote scenarios

### Risk: telemetry is neglected
- **Mitigation:** make telemetry part of Phase 0/1 definition-of-done, including relay to backend and request correlation

### Risk: performance degrades on large message/session datasets
- **Mitigation:** use paginated APIs everywhere from day one, lazy-load expensive tabs, avoid auto-loading heavy context until requested

### Risk: local SDK dependency breaks or goes stale
- **Mitigation:** use a prebuild/workspace script that rebuilds `sdks/typescript` automatically before frontend production builds

### Risk: metrics page shows misleading state
- **Mitigation:** use `/v3/system/status` for config awareness and `/metrics` for counters, instead of inferring config from Prometheus output

### Risk: conclusions UX becomes confusing
- **Mitigation:** keep workspace-wide list and pair-scoped semantic query separate in the UI and label the query inputs explicitly

---

## Recommendation on implementation order

1. **Scaffold frontend + serve it from FastAPI correctly under `/app`** (Phase 0)
2. **Add system/status, telemetry relay, request-correlation, and data-layer foundations** (Phase 0/1)
3. **Explore core: workspaces, peers, sessions, messages, conclusions** (Phase 2)
4. **Utilities: representation/context/search/cards/queue/dream** (Phase 3)
5. **Control-plane extras: playground, webhooks, key generator, metrics** (Phase 4)
6. **Polish, docs, tests, auth-ready hardening** (Phase 5)

This order gets useful value fast while keeping the design aligned with the upstream dashboard model and the project telemetry standard.

---

## Definition of done for MVP

The MVP is complete when all of the following are true:

- [ ] built frontend is served locally from this repo at `/app`
- [ ] asset paths work correctly under `/app/assets/...`
- [ ] user can browse workspaces, peers, sessions, messages, and conclusions (all paginated)
- [ ] user can use peer and session utilities (representation/context/search/summaries/cards)
- [ ] user can view queue status and trigger dream scheduling
- [ ] user can use a built-in API playground (driven by OpenAPI spec)
- [ ] user can manage webhooks
- [ ] key generator page behaves correctly in no-auth mode and is ready for auth-enabled mode
- [ ] metrics/health page uses `/v3/system/status` plus `/metrics` and handles disabled states clearly
- [ ] telemetry exists for route views, major actions, latency, errors, and request correlation
- [ ] frontend-originated telemetry is relayed into the backend telemetry path
- [ ] docs explain how to run and validate the frontend locally (both dev and production modes)

---

## Suggested next step after this plan

Choose one of these execution strategies:

1. **Implement the custom frontend directly from this plan**
2. **First create a visual mockup / route map for the app shell and core pages**

Recommended next action: **create a visual mockup + route/component map**, then implement Phase 0 and Phase 1.