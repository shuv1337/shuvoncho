## Goal

Build a **custom local frontend** for Shuvoncho that mirrors the strongest parts of the managed Honcho dashboard while fitting this self-hosted codebase and local-first workflows.

The plan is optimized for:
- **Frontend:** React + Vite SPA mounted into FastAPI
- **MVP scope:** **full local control plane**
- **Auth:** **local no-auth first**, with a clear path to bearer/API-key auth later

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

- The self-hosted Shuvoncho repo currently exposes a **FastAPI API only**; there is no bundled frontend in this repo.
  - The `app = FastAPI(...)` call in `src/main.py`
  - Routers mounted under `/v3` in `src/main.py` via `app.include_router()`
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

- FastAPI application: the `app = FastAPI(...)` call in `src/main.py`
- Seven routers mounted under `/v3` via `app.include_router()` in `src/main.py`
- Prometheus metrics endpoint at `/metrics` via `app.add_route()` in `src/main.py`
- **No static file serving infrastructure exists today** — no `StaticFiles` import, no mount, no SPA fallback route. `starlette.staticfiles.StaticFiles` is available via the existing FastAPI/Starlette dependency (no extra install needed).

### CORS configuration (important for frontend dev)

The current CORS `allow_origins` in `src/main.py` is:
```python
origins = [
    "http://localhost",
    "http://127.0.0.1:8000",
    "https://api.honcho.dev",
]
```

**This will block requests from the Vite dev server** (typically `http://localhost:5173`). Phase 0 must address this — see [CORS strategy](#cors-strategy-for-development) below.

### Workspace endpoints

Router: `workspaces.router` in `src/routers/workspaces.py` (prefix `/workspaces`)

Key capabilities:
- get/create workspace
- list workspaces
- update workspace
- delete workspace
- workspace search
- queue status
- schedule dream

### Peer endpoints

Router: `peers.router` in `src/routers/peers.py` (prefix `/workspaces/{workspace_id}/peers`)

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

Router: `sessions.router` in `src/routers/sessions.py` (prefix `/workspaces/{workspace_id}/sessions`)

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

Router: `messages.router` in `src/routers/messages.py` (prefix `/workspaces/{workspace_id}/sessions/{session_id}/messages`)

Key capabilities:
- create messages
- upload file as messages
- list messages
- get message
- update message

### Conclusions endpoints

Router: `conclusions.router` in `src/routers/conclusions.py`

Key capabilities:
- create conclusions
- list conclusions
- semantic query conclusions
- delete conclusion

### Webhooks and keys

- Webhooks router: `src/routers/webhooks.py`
- Keys router: `src/routers/keys.py`

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

The repo contains a TypeScript SDK at `sdks/typescript/` (~4,600 lines across 11 source files) that covers most of the frontend surface area.

**SDK is a local package** — it lives at `sdks/typescript/` with package name `@honcho-ai/sdk`. The frontend must reference it as a local file dependency, not install from npm:
```json
{
  "dependencies": {
    "@honcho-ai/sdk": "file:../sdks/typescript"
  }
}
```
The SDK must be built (`bun run build` in `sdks/typescript/`) before the frontend can use it.

#### SDK coverage by domain

| Domain | SDK class/method | Notes |
|---|---|---|
| Client init | `Honcho` constructor in `client.ts` | `baseURL`, `apiKey`, `workspaceId` |
| Workspaces | `honcho.workspaces()`, `.search()`, `.queueStatus()`, `.scheduleDream()` | Full coverage |
| Peers | `peer.chat()`, `.search()`, `.getCard()`, `.setCard()`, `.representation()`, `.context()` | Full coverage |
| Sessions | `session.addPeers()`, `.addMessages()`, `.context()`, `.summaries()`, `.search()`, `.queueStatus()` | Full coverage |
| Messages | `Message` class, `session.addMessages()` | Full coverage |
| Conclusions | `ConclusionScope` class with `.list()`, `.query()`, `.create()`, `.delete()` | Full coverage |
| Pagination | `Page` class in `pagination.ts` (183 lines) | Cursor-based pagination helpers |
| Webhooks | **Not in SDK** | Use direct HTTP |
| Keys | **Not in SDK** | Use direct HTTP |

### SDK gap summary

Only **webhooks and keys** are not represented in the TypeScript SDK. The frontend should:
- use the SDK for workspace / peer / session / message / conclusion flows
- use the SDK's `ConclusionScope` for all conclusion operations
- use the SDK's `Page` class for paginated responses
- use direct HTTP calls only for keys, webhooks, and the playground

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
   - keys (even if local no-auth first, still useful when auth is enabled later)
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

#### Workspace overview
- summary cards
- peer count
- session count
- queue status snapshot
- quick actions for create peer/session
- recent peers/sessions

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
- semantic query tool
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
- embed or summarize `/metrics`
- queue status rollups
- message creation / dialectic call / worker counters where useful
- basic health checks (API reachable, auth mode, metrics enabled)

#### Webhooks
- list endpoints
- create endpoint
- delete endpoint
- test emit

#### Keys
- create scoped key when auth is enabled
- show disabled-state guidance when `AUTH_USE_AUTH=false`

### Dream scheduling form fields

The `ScheduleDreamRequest` schema requires:

| Field | Type | Required | Description |
|---|---|---|---|
| `observer` | string | yes | Observer peer name |
| `observed` | string | no | Observed peer name (defaults to observer) |
| `dream_type` | enum | yes | Currently only `"omni"` exists |
| `session_id` | string | no | Scope the dream to a specific session |

The dream scheduling UI should present these four fields with peer/session pickers and a dropdown for dream type (pre-populated with `omni`, extensible when new types are added).

---

## Technical architecture

### Recommended frontend stack

- **React**
- **Vite**
- **TypeScript**
- **bun** as the package manager (consistent with the existing SDK)
- **React Router** for page routing
- **TanStack Query** for server state
- **Tailwind CSS** for utility-first styling (dark-first palette, avoids building a component library from scratch)
- **shadcn/ui** for the component layer (data tables, tabs, forms, status badges, JSON viewers, empty states, code blocks, copy buttons — all solved out of the box)
- **Honcho TypeScript SDK** (`@honcho-ai/sdk` as local file dependency) as the primary data-access layer
- direct `fetch`/HTTP client only for gaps (keys, webhooks, playground)

### Recommended repository layout

Add a frontend package inside this repo:

```text
frontend/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.ts
  components.json          # shadcn/ui config
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
    honcho.ts              # SDK client wrapper
    api.ts                 # direct HTTP helpers (keys, webhooks, playground)
    auth.ts                # token injection abstraction
    telemetry.ts           # structured event logging + request correlation
    format.ts              # entity formatters
  components/
    ui/                    # shadcn/ui components
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
  routes/
    workspaces/
    peers/
    sessions/
    conclusions/
    playground/
    metrics/
```

### FastAPI integration approach

Serve the built SPA from FastAPI in production/local-dev integration mode.

Required additions to `src/main.py`:
- Import `starlette.staticfiles.StaticFiles` (already available, no new dependency)
- Mount `StaticFiles` at `/app/assets` pointing to `frontend/dist/assets`
- Add an SPA catch-all route for `/app/{path:path}` that returns `frontend/dist/index.html`
- These mounts must come **after** the `/v3` router mounts and `/metrics` to avoid path conflicts

During development, use Vite's dev server with a proxy (see [CORS strategy](#cors-strategy-for-development) below) instead of serving from FastAPI.

### CORS strategy for development

**Problem:** The Vite dev server runs on `http://localhost:5173` (or similar) which is not in the current CORS `allow_origins` list, so API calls from the dev server will be blocked.

**Solution (two-pronged):**

1. **Vite proxy (primary, for development):** Configure `vite.config.ts` to proxy `/v3/*` and `/metrics` to `http://localhost:8000`. This avoids CORS entirely during development because the browser sees same-origin requests.

```typescript
// frontend/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/v3': 'http://localhost:8000',
      '/metrics': 'http://localhost:8000',
      '/openapi.json': 'http://localhost:8000',
    },
  },
})
```

2. **Extend CORS for LAN/remote access:** Add an optional `FRONTEND_CORS_ORIGIN` environment variable to `src/main.py` that allows additional origins. This supports LAN access (e.g., `http://192.168.x.x:5173`) and production flexibility without hardcoding origins.

```python
# In src/main.py, extend the origins list:
import os
extra_origin = os.environ.get("FRONTEND_CORS_ORIGIN")
if extra_origin:
    origins.append(extra_origin)
```

### Why this architecture

- Keeps the API and UI in one repo
- Reuses the existing TypeScript SDK as a local dependency
- Allows iterative rollout: UI can start read-heavy and grow into full control plane
- Easy to deploy locally in one process after build
- Easy to run separately during development with Vite dev server + proxy
- Tailwind + shadcn/ui dramatically reduces component-building scope

---

## Auth strategy

### Phase 1: local no-auth first

Default behavior should assume auth is off (the `AuthSettings` class in `src/config.py` defaults `USE_AUTH=False`).

Frontend behavior:
- no login wall in local mode
- no required token entry for normal browsing
- keys page should show explanatory disabled state when auth is off
- API playground should allow optional bearer token field, but not require it

### Phase 2: auth-ready architecture

Do not hardcode a no-auth assumption into the app architecture.

From day one, structure the app so that:
- HTTP client can optionally send `Authorization: Bearer ...` (abstracted in `frontend/src/lib/auth.ts`)
- token can be sourced from local storage / env / user input later
- unauthorized states (401/403) are surfaced cleanly in UI
- routes/components can adapt to enabled auth without rewrite

---

## Telemetry requirements for the frontend

Telemetry is mandatory and should be included in the plan from the start.

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

### MVP telemetry implementation (concrete)

#### a. Structured console logging

`frontend/src/lib/telemetry.ts` should export a `track()` function that emits structured JSON events to `console.log`:

```typescript
interface TelemetryEvent {
  event: string;               // e.g. "route.view", "api.request", "api.error"
  workspace_id?: string;
  peer_id?: string;
  session_id?: string;
  endpoint?: string;
  method?: string;
  status_code?: number;
  latency_ms?: number;
  error?: string;
  timestamp: string;           // ISO 8601
  request_id?: string;         // correlates with backend
}
```

This is cheap, zero-dependency, and provides immediate observability via browser DevTools.

#### b. Request correlation

All API calls from `frontend/src/lib/api.ts` and the SDK wrapper should attach an `X-Request-ID` header (UUID v4). The backend already reads `request.state.request_id` in its tracking middleware — extending it to prefer the client-provided header enables end-to-end correlation.

#### c. Request timing

Wrap all `fetch` calls (both SDK and direct HTTP) with `performance.now()` timing. Emit `api.request` telemetry events with `latency_ms`, `status_code`, and `endpoint`.

#### d. Route instrumentation

Use a React Router loader or `useEffect` in the app shell to emit `route.view` events on every navigation, including entity IDs extracted from URL params.

### Follow-up telemetry path

- Add browser-to-Maple OTLP ingestion when practical (the project standard pipeline is: service → Maple Ingest `:3474` → OTEL Collector → Tinybird)
- Unify frontend `X-Request-ID` with backend request correlation end-to-end
- Consider OpenTelemetry JS SDK if the event volume justifies it

Frontend files needed:
- `frontend/src/lib/telemetry.ts` — event emitter
- `frontend/src/lib/api.ts` — request timing, `X-Request-ID` injection
- route instrumentation in app shell/router

---

## Design direction

### Visual language

Use the upstream dashboard as inspiration, not a pixel-perfect clone:
- dark-first palette (Tailwind dark mode)
- monospaced labels and counts
- left nav rail
- high-contrast data tables (shadcn/ui DataTable)
- sparse, tool-like controls
- straightforward operational UX over decorative product marketing polish

### UX principles

- prioritize exploration and inspection over "dashboard fluff"
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

---

## Recommended implementation phases

## Phase 0 — architecture and scaffolding

- [ ] Create a frontend package under `frontend/`
- [ ] Add Vite + React + TypeScript setup with **bun** as package manager
- [ ] Add Tailwind CSS with dark mode configuration
- [ ] Initialize shadcn/ui (`components.json` + base components)
- [ ] Add React Router and TanStack Query
- [ ] Add `@honcho-ai/sdk` as a local file dependency (`"file:../sdks/typescript"`)
- [ ] Ensure SDK is built before frontend (`bun run build` in `sdks/typescript/`)
- [ ] Add a shared app shell with left nav, top header, and content area
- [ ] Add design tokens and base styling (Tailwind config)
- [ ] Add environment/config handling for API base URL and optional bearer token
- [ ] Add frontend telemetry scaffolding (`lib/telemetry.ts` with structured console logging)
- [ ] Add `X-Request-ID` header injection in `lib/api.ts`
- [ ] Configure Vite proxy for `/v3/*`, `/metrics`, and `/openapi.json` → `http://localhost:8000`
- [ ] Add `FRONTEND_CORS_ORIGIN` env var support to `src/main.py` CORS config
- [ ] Add `StaticFiles` mount for `frontend/dist/assets` and SPA catch-all route for `/app/{path:path}` in `src/main.py`
- [ ] Build output path: `frontend/dist/` (Vite default)

### Validation
- [ ] `bun install` succeeds in `frontend/`
- [ ] `bun run dev` starts Vite dev server and loads a placeholder app
- [ ] API calls from Vite dev server to `/v3/workspaces` succeed (proxy works, no CORS errors)
- [ ] `bun run build` produces static assets in `frontend/dist/`
- [ ] FastAPI can serve the built app at `/app` (SPA fallback works for nested routes)
- [ ] Telemetry events appear in browser console on route navigation

---

## Phase 1 — SDK integration and data layer

- [ ] Create a frontend Honcho client wrapper (`lib/honcho.ts`) around `@honcho-ai/sdk`
- [ ] Add direct HTTP helpers (`lib/api.ts`) for endpoints not covered by the SDK (webhooks, keys, playground requests)
- [ ] Add shared TanStack Query key conventions for workspaces/peers/sessions/messages/conclusions
- [ ] Add pagination handling using the SDK's `Page` class — all list views must paginate from day one
- [ ] Add entity mappers/formatters where SDK responses need shaping for UI
- [ ] Add consistent error handling and retry policy (TanStack Query retry + error boundary)
- [ ] Add request timing instrumentation in both `lib/honcho.ts` and `lib/api.ts`
- [ ] Add auth token injection abstraction in `lib/auth.ts` (reads from localStorage or config, sends as `Authorization: Bearer` when present)

### Validation
- [ ] frontend can list workspaces through SDK with pagination
- [ ] frontend can load peer/session data through SDK
- [ ] frontend can list conclusions through SDK's `ConclusionScope`
- [ ] frontend can call webhooks/keys endpoints through direct HTTP helper
- [ ] request failures surface readable UI errors and telemetry events
- [ ] `X-Request-ID` headers appear in backend logs for frontend-initiated requests

---

## Phase 2 — Explore core

### Workspace flows
- [ ] Build workspace list page (paginated)
- [ ] Build workspace create flow
- [ ] Build workspace overview page
- [ ] Add workspace metadata/config viewer/editor
- [ ] Add queue status summary card to workspace overview

### Peer flows
- [ ] Build peer list page (paginated)
- [ ] Add peer create/edit flows
- [ ] Build peer detail page shell
- [ ] Show metadata/config
- [ ] Show sessions-for-peer table (paginated)

### Session flows
- [ ] Build session list page (paginated)
- [ ] Add session create flow
- [ ] Add session clone/delete actions (with destructive-action confirmation)
- [ ] Build session detail page shell
- [ ] Show session metadata/config
- [ ] Show session peers table

### Messages
- [ ] Build messages timeline/tab in session detail (paginated)
- [ ] Add peer filter for messages
- [ ] Add create message form
- [ ] Add file upload flow for message ingestion

### Conclusions
- [ ] Build conclusions list page (paginated, using `ConclusionScope.list()`)
- [ ] Add semantic query tool (using `ConclusionScope.query()`)
- [ ] Add details panel / raw JSON inspector
- [ ] Add optional delete action (using `ConclusionScope.delete()`)

### Validation
- [ ] can navigate workspace → peers → peer detail
- [ ] can navigate workspace → sessions → session detail
- [ ] can view/add messages in a session
- [ ] can inspect conclusions with filters and semantic query
- [ ] pagination works on all list views (next/prev, page size)

---

## Phase 3 — utilities and advanced tools

### Peer utilities
- [ ] Add peer representation tab
- [ ] Add peer context tab
- [ ] Add peer card tab with edit/set support
- [ ] Add peer search tab
- [ ] Add dialectic chat panel with streaming support if feasible

### Session utilities
- [ ] Add session search tab
- [ ] Add session context tab
- [ ] Add session summaries tab
- [ ] Add session peer config editor
- [ ] Add session queue status view

### Workspace utilities
- [ ] Add workspace-global search UI
- [ ] Add schedule dream form with observer (peer picker, required), observed (peer picker, optional), dream_type (dropdown, currently only `"omni"`), and session_id (session picker, optional)
- [ ] Add workspace queue breakdown view

### Validation
- [ ] peer representation/context/card flows work end-to-end
- [ ] session context/summaries/search work end-to-end
- [ ] schedule dream can be triggered and result is visible in queue status
- [ ] dream scheduling form validates required fields and provides peer/session pickers

---

## Phase 4 — local control plane pages

### API playground
- [ ] Fetch OpenAPI spec from `/openapi.json` to auto-generate endpoint catalog
- [ ] Group endpoints by tag (workspaces, peers, sessions, messages, conclusions, webhooks, keys)
- [ ] Add path/query/body editor (pre-populate from OpenAPI parameter schemas)
- [ ] Add execute request action
- [ ] Add response inspector (JSON viewer with syntax highlighting)
- [ ] Add copy-as-cURL
- [ ] Add optional bearer token field

### Webhooks
- [ ] Build webhook list/create/delete pages (direct HTTP)
- [ ] Add test emit action
- [ ] Show disabled/error states clearly

### Keys
- [ ] Build create-key UI (direct HTTP)
- [ ] Show auth-disabled state when `AUTH_USE_AUTH=false`
- [ ] Support workspace/peer/session scoped key generation when auth is enabled

### Metrics/health
- [ ] Build metrics page using `/metrics` plus selected API calls
- [ ] Surface queue status, basic counters, and health notes
- [ ] Add backend config awareness where useful (auth enabled, metrics enabled, sentry enabled)

### Validation
- [ ] API playground can successfully hit a representative set of endpoints
- [ ] playground endpoint catalog stays in sync with API (driven by OpenAPI spec)
- [ ] webhook CRUD/test works
- [ ] keys page behaves correctly in both no-auth and auth-enabled modes
- [ ] metrics page loads and shows useful local state

---

## Phase 5 — polish, hardening, and rollout

- [ ] Add loading skeletons and empty states for all list/detail pages
- [ ] Add copy buttons for IDs, JSON, context, representations
- [ ] Add destructive-action confirmations (delete workspace/session/conclusion, etc.)
- [ ] Add filter persistence (URL search params or localStorage)
- [ ] Add optimistic refresh/invalidation behavior where appropriate (TanStack Query)
- [ ] Review CORS/static serving needs for local browser access from LAN (verify `FRONTEND_CORS_ORIGIN` works)
- [ ] Add documentation for local frontend development and build/serve workflow
- [ ] Add tests for critical frontend routes/components
- [ ] Add backend validation tests for new static-serving routes and SPA fallback

### Validation
- [ ] smooth navigation across entire control plane
- [ ] all major empty/loading/error states are covered
- [ ] docs allow a fresh developer to run both API and frontend locally

---

## API-to-UI feature map

| UI area | Primary backend/API | Preferred access path |
|---|---|---|
| Workspace list | `/v3/workspaces`, `/v3/workspaces/list` | TS SDK |
| Workspace overview | workspace + peers + sessions + queue status | TS SDK |
| Peer list/detail | `/v3/workspaces/{workspace}/peers*` | TS SDK |
| Session list/detail | `/v3/workspaces/{workspace}/sessions*` | TS SDK |
| Messages | `/v3/workspaces/{workspace}/sessions/{session}/messages*` | TS SDK |
| Conclusions | `/v3/workspaces/{workspace}/conclusions*` | TS SDK (`ConclusionScope`) |
| Peer context/card/representation/chat | peer utilities endpoints | TS SDK |
| Session context/summaries/search | session utilities endpoints | TS SDK |
| Queue status / schedule dream | workspace endpoints | TS SDK |
| Webhooks | `/v3/workspaces/{workspace}/webhooks*` | direct HTTP |
| Keys | `/v3/keys` | direct HTTP |
| Playground | arbitrary endpoints + `/openapi.json` | direct HTTP |
| Metrics | `/metrics` | direct HTTP |

---

## Proposed file changes

## New frontend files/directories

- [ ] `frontend/package.json` (bun, local SDK dependency)
- [ ] `frontend/tsconfig.json`
- [ ] `frontend/vite.config.ts` (with dev proxy for `/v3`, `/metrics`, `/openapi.json`)
- [ ] `frontend/tailwind.config.ts`
- [ ] `frontend/components.json` (shadcn/ui)
- [ ] `frontend/index.html`
- [ ] `frontend/src/main.tsx`
- [ ] `frontend/src/app/App.tsx`
- [ ] `frontend/src/app/router.tsx`
- [ ] `frontend/src/app/providers.tsx`
- [ ] `frontend/src/lib/honcho.ts` (SDK wrapper)
- [ ] `frontend/src/lib/api.ts` (direct HTTP + timing + `X-Request-ID`)
- [ ] `frontend/src/lib/auth.ts` (token abstraction)
- [ ] `frontend/src/lib/telemetry.ts` (structured event logging)
- [ ] `frontend/src/components/ui/` (shadcn/ui components)
- [ ] `frontend/src/styles/globals.css` (Tailwind base)
- [ ] route/component files for each feature area

## Existing backend files that will change

- [ ] `src/main.py`
  - Add `from starlette.staticfiles import StaticFiles`
  - Add `StaticFiles` mount for `frontend/dist/assets`
  - Add SPA catch-all route for `/app/{path:path}` → `frontend/dist/index.html`
  - Add `FRONTEND_CORS_ORIGIN` env var to extend `origins` list
- [ ] `README.md`
  - Frontend run/build instructions
- [ ] possibly docs under `docs/` for local dashboard usage

## Optional SDK-related follow-up files

If we decide to fill SDK gaps as part of the same initiative:
- [ ] `sdks/typescript/src/client.ts` — add webhook/key methods
- [ ] new SDK types for keys/webhooks
- [ ] tests under `tests/sdk_typescript/`

This is optional; the frontend can ship first with direct HTTP wrappers.

---

## Testing and validation plan

## Backend-side validation

- [ ] existing Python test suite remains green after backend integration changes
- [ ] targeted tests for new static mount / SPA fallback behavior
- [ ] verify `/v3/*` API routes remain unaffected
- [ ] verify `/metrics` remains unaffected

Commands:

```bash
uv run pytest -q
```

## Frontend-side validation

- [ ] typecheck
- [ ] build
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

## End-to-end smoke checklist

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
- [ ] inspect conclusions with semantic query
- [ ] trigger dream scheduling
- [ ] run API playground request
- [ ] load metrics page
- [ ] verify telemetry events in browser console

---

## Risks and mitigations

### Risk: frontend scope balloons too quickly
- **Mitigation:** deliver in phases, starting with Explore core and only then tools/control-plane extras

### Risk: SDK gaps slow implementation
- **Mitigation:** use direct HTTP wrappers for keys/webhooks/playground rather than blocking on SDK changes

### Risk: auth later forces a large rewrite
- **Mitigation:** abstract auth token injection from day one in `frontend/src/lib/auth.ts` and `frontend/src/lib/api.ts`

### Risk: CORS blocks the Vite dev server or LAN access
- **Mitigation:** use Vite proxy for development (no CORS needed); add `FRONTEND_CORS_ORIGIN` env var for LAN/remote scenarios. Both are Phase 0 tasks, not deferred.

### Risk: telemetry is neglected
- **Mitigation:** make telemetry tasks part of Phase 0/1 definition-of-done, not a later polish pass. Concrete deliverables: `telemetry.ts`, `X-Request-ID` injection, request timing.

### Risk: performance degrades on large message/session datasets
- **Mitigation:** use paginated APIs everywhere from Phase 1 (not deferred to Phase 5), lazy-load tabs, and avoid loading heavy context tools until requested

### Risk: local SDK dependency breaks or goes stale
- **Mitigation:** frontend `package.json` references `"file:../sdks/typescript"`. Any SDK change requires `bun run build` in the SDK dir. Document this in the frontend README and consider a `prebuild` script.

### Risk: line references in this plan go stale across upstream merges
- **Mitigation:** all code references use function/class names and file paths, not line numbers. Grep for the named symbol to find the current location.

---

## Recommendation on implementation order

1. **Scaffold frontend + serve it from FastAPI** (Phase 0)
2. **SDK/data layer + pagination + telemetry base** (Phase 1)
3. **Explore core: workspaces, peers, sessions, messages, conclusions** (Phase 2)
4. **Utilities: representation/context/search/cards/queue/dream** (Phase 3)
5. **Control-plane extras: playground, webhooks, keys, metrics** (Phase 4)
6. **Polish, docs, tests, auth-ready hardening** (Phase 5)

This order gets useful value fast while keeping the design aligned with the upstream dashboard model.

---

## Definition of done for MVP

The MVP is complete when all of the following are true:

- [ ] built frontend is served locally from this repo at `/app`
- [ ] user can browse workspaces, peers, sessions, messages, and conclusions (all paginated)
- [ ] user can use peer and session utilities (representation/context/search/summaries/cards)
- [ ] user can view queue status and trigger dream scheduling
- [ ] user can use a built-in API playground (driven by OpenAPI spec)
- [ ] user can manage webhooks
- [ ] keys page behaves correctly in no-auth mode and is ready for auth-enabled mode
- [ ] telemetry exists for route views, major actions, latency, errors, and request correlation
- [ ] docs explain how to run and validate the frontend locally (both dev and production modes)

---

## Suggested next step after this plan

Choose one of these execution strategies:

1. **Implement the custom frontend directly from this plan**
2. **First create a visual mockup / route map for the app shell and core pages**

Recommended next action: **create a visual mockup + route/component map**, then implement Phase 0 and Phase 1.
