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

Ship v1 as a **hosted alpha**, not as a self-hosting product.

Runtime shape:

1. **persistent control plane on Cloudflare**
2. **single-tenant disposable DigitalOcean session server per recording session**
3. **Cloudflare DNS publication for direct session hostnames**

Keep the product split into 3 independent runtime paths:

- **live call path**: browser ↔ SFU for conversation and monitoring
- **local capture path**: browser records per-seat sources locally in rolling chunks
- **upload path**: browser uploads those chunks in the background with retry + resume

That split is still the core reliability decision. A bad live connection must not silently ruin the local recording, and a stalled upload must not kill the call.

## component boundaries

### control plane

Owns:

- host-facing web UI and API
- persistent session metadata
- per-session seats and stable join links
- provisioning intent and reconciliation
- responsive host/guest UI delivery
- the browser bootstrap that tells clients where the current session runtime lives

Does **not** own:

- media transport
- chunk ingest
- long-lived media state for a session server

For alpha, keep provisioning logic inside the hosted control-plane deployment. Do **not** split a separately operated session-runner product surface yet.

### disposable session server

Owns:

- live session backend
- seat-claim endpoints
- recording control endpoints
- chunk ingest and local manifests
- session-local durability state

It is disposable. It should not own long-lived control-plane state.

### public networking and TURN

Own:

- stable control-plane hostnames
- session hostname publication in Cloudflare DNS
- session-side TLS termination
- NAT traversal support

For alpha, keep this minimal:

- no persistent reverse-proxy or edge box
- each disposable session server terminates its own TLS
- TURN runs on the disposable session server, not on a separate persistent VM
- do **not** add dedicated TURN deployment choices yet

## stack

- **frontend**: TypeScript, React, Vite, `tsgo` for type checks
- **responsive UI requirement**: all host and guest screens must reflow cleanly across common viewport sizes; responsive does **not** imply broad mobile recording support yet
- **persistent control plane**: Cloudflare Workers
- **control-plane state**: Cloudflare D1
- **browser live media client**: LiveKit browser/JS SDK
- **disposable session API / upload service**: Go, `net/http` + stdlib `ServeMux`
- **live media server**: self-hosted LiveKit, single-node first
- **session-local state**: SQLite + local disk
- **public DNS**: Cloudflare DNS
- **session-side TLS**: Caddy on the disposable session server
- **TURN**: coturn on the disposable session server
- **temporary session-server packaging**: stock Ubuntu LTS VM + cloud-init + systemd + versioned release bundle
- **operator surface**: browser UI for normal operation; internal maintainer scripts for deployment and recovery
- **local dev harness**: Docker Compose or equivalent repo-local runtime, not a user-facing deployment product
- **tests**: Go test, Vitest, Playwright
- **observability**: structured JSON logs and explicit manifests

## deployment shape

Lock alpha to one boring hosted topology:

- **Cloudflare**: control plane app/API + D1 + DNS
- **DigitalOcean**: disposable session servers
- **no persistent edge box**

Do **not** build alpha around:

- self-hosting
- a user-facing local install flow
- provider abstraction
- multiple DNS providers
- multiple compute providers
- a separate dedicated TURN product mode

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
- alpha deployment boundary and deferred CLI → `docs/operator-cli.md`
- release bundles and hosted updates → `docs/releases.md`
- join links, seats, and LiveKit identity mapping → `docs/identity.md`
- claim/reclaim/takeover wire contract → `docs/seat-claim-protocol.md`
- lifecycle states and failure escalation → `docs/session-lifecycle.md`
- schema → `docs/database-schema.md`
- capture/source model → `docs/capture-profile.md`
- recording state and clock sync → `docs/recording-control-protocol.md`
- track/chunk upload protocol → `docs/recording-upload-protocol.md`
- local harness/runtime contract → `docs/local-stack.md`
- version policy and version pins → `docs/version-pins.md`
- local harness and scenario coverage → `docs/testing.md`

## why this shape

- **cut ops scope first**: a hosted alpha gets to value faster than a self-hosting product.
- **don’t build an SFU first**: LiveKit is the boring choice and buys us room semantics, reconnects, and TURN support.
- **Cloudflare control plane**: cheap persistent UI/API with a simple deployment story.
- **disposable session servers**: keeps session cost tied to actual recording time.
- **single hosted topology**: fewer branches, fewer docs, fewer bugs.
- **direct session hostnames**: cheaper than running a persistent edge box for alpha.
- **session-scoped TURN**: keep TURN support without paying for a separate always-on VM.
- **responsive UI**: required from the start because cramped layouts create operational mistakes.

## non-goals for v1 alpha

- self-hosting as a supported product feature
- public operator CLI
- local deployment for operators
- multiple cloud or DNS providers
- a persistent edge box or persistent TURN deployment
- dedicated TURN sizing/placement modes
- multi-region orchestration
- cloud storage integrations
- server-side compositing or livestreaming
- a custom SFU or media backend
- broad browser/platform support before the Chromium-first baseline is solid
