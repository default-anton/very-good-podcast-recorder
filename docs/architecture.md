# v1 architecture and tech stack

Related docs:

- `docs/README.md`
- `docs/repo-layout.md`
- `docs/local-stack.md`
- `docs/version-pins.md`
- `docs/feedback-loop.md`
- `docs/testing.md`
- `docs/public-networking.md`
- `docs/session-server-bootstrap.md`
- `docs/operator-cli.md`
- `docs/releases.md`
- `docs/identity.md`
- `docs/session-lifecycle.md`
- `docs/database-schema.md`
- `docs/capture-profile.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`

## recommendation

Ship v1 as 3 runtime components plus 2 persistent infrastructure services:

1. **persistent host control plane**
2. **private session-runner**
3. **single-tenant temporary session server**
4. **persistent public edge**
5. **persistent TURN deployment**

Keep the product split into 3 independent runtime paths:

- **live call path**: browser ↔ SFU for conversation and monitoring
- **local capture path**: browser records per-seat sources locally in rolling chunks
- **upload path**: browser uploads those chunks in the background with retry + resume

That split is the core v1 reliability decision. A bad live connection must not silently ruin the local recording, and a stalled upload must not kill the call.

## component boundaries

### control plane

Owns:

- host-facing web UI and API
- persistent session metadata
- reusable participants and per-session seats
- provisioning intent/state
- stable human join links

Does **not** own:

- cloud or DNS mutation credentials
- media transport
- chunk ingest
- temporary-session bootstrap logic

### session-runner

Owns:

- provider credentials
- edge-route publication
- temporary session-server create/destroy
- readiness polling and reconciliation

It is the security boundary between the public control plane and infrastructure mutation.

### temporary session server

Owns:

- live session backend
- seat-claim endpoints
- recording control endpoints
- chunk ingest and local manifests
- session-local durability state

It is disposable. It should not own public DNS, public TLS, or long-lived control-plane state.

### persistent edge and TURN

Own:

- stable public hostnames
- public TLS termination
- routing to the current temporary backend
- NAT traversal support

These stay persistent so session creation does not depend on fresh DNS or ACME work.

## stack

- **frontend**: TypeScript, React, Vite
- **browser live media client**: LiveKit browser/JS SDK
- **control plane API**: Go, `net/http` + stdlib `ServeMux`
- **session-runner**: private Go service
- **temporary session API / upload service**: Go, `net/http` + stdlib `ServeMux`
- **live media server**: self-hosted LiveKit, single-node first
- **control-plane state**: SQLite
- **session-local state**: SQLite + local disk
- **persistent edge / TLS**: Caddy
- **TURN**: coturn
- **operator surface**: `vgpr` CLI
- **local packaging**: Docker Compose
- **temporary session-server packaging**: stock Ubuntu LTS VM + cloud-init + systemd + versioned release bundle
- **tests**: Go test, Vitest, Playwright
- **observability**: structured JSON logs and explicit manifests

## LiveKit integration boundary

Use LiveKit as the **media substrate**, not as the product.

LiveKit owns:

- room transport for the live call
- participant presence inside the room
- publish / subscribe media routing
- transport reconnect behavior
- TURN / NAT traversal

Our apps own:

- join flow and seat selection UX
- durable seat identity
- host recording controls
- local browser recording
- background upload, retry, and resume
- artifact layout and download workflow

Do **not** build the product on top of an off-the-shelf LiveKit UI.

## source-of-truth map

This doc owns only the top-level shape.

Use the other docs for the detailed contracts:

- networking and hostnames → `docs/public-networking.md`
- temporary-server bootstrap and readiness → `docs/session-server-bootstrap.md`
- operator workflow and CLI UX → `docs/operator-cli.md`
- join links, seats, and LiveKit identity mapping → `docs/identity.md`
- claim/reclaim/takeover wire contract → `docs/seat-claim-protocol.md`
- lifecycle states and failure escalation → `docs/session-lifecycle.md`
- schema → `docs/database-schema.md`
- capture/source model → `docs/capture-profile.md`
- recording state and clock sync → `docs/recording-control-protocol.md`
- track/chunk upload protocol → `docs/recording-upload-protocol.md`
- local boot/runtime contract → `docs/local-stack.md`
- version policy and version pins → `docs/version-pins.md`
- local harness and scenario coverage → `docs/testing.md`

## why this shape

- **don’t build an SFU first**: LiveKit is the boring choice and buys us room semantics, reconnects, and TURN support.
- **persistent control plane**: the right home for host UX, stable seat identity, and provisioning intent.
- **private session-runner**: the right home for cloud, DNS, and edge mutation credentials.
- **persistent edge**: keeps DNS/TLS off the session-create hot path.
- **SQLite + local disk**: enough for v1 and easy to inspect.
- **Go**: simple deployment and good fit for the control plane, reconciler, and chunk ingest.
- **systemd on stock VMs**: simpler than Docker on short-lived boxes.

## non-goals for v1

- multi-region orchestration
- cloud storage integrations
- server-side compositing or livestreaming
- a custom SFU or media backend

If we hit real limits, the first split is **separate upload ingest from `sessiond`**, not a full re-architecture.
