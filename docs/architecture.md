# v1 architecture and tech stack

Related docs:

- `docs/repo-layout.md`
- `docs/feedback-loop.md`
- `docs/testing.md`
- `docs/public-networking.md`
- `docs/session-server-bootstrap.md`
- `docs/operator-cli.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/database-schema.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/capture-profile.md`

## recommendation

Ship v1 as a **persistent host control plane**, a **private session-runner**, and a **single-tenant temporary session server** per recording.

Keep the product split into 3 independent paths:

- **live call path**: browser ↔ SFU for conversation and monitoring
- **local capture path**: browser records per-seat source instances locally in rolling chunks
- **upload path**: browser uploads those chunks in the background with retry + resume

That is the right shape for reliability. A bad live connection must not silently ruin the local recording, and a stalled upload must not kill the call.

Keep host orchestration out of the media-critical path: the persistent control plane owns sessions, participant identities, and provisioning intent/state; the private session-runner owns provider credentials, provisioning, edge route changes, and teardown; the temporary session server owns the live call and chunk ingest.

Keep public networking persistent too: stable control-plane join links, a persistent edge that owns DNS/TLS, and disposable session backends behind it. Do not make per-session DNS or ACME issuance part of the hot path.

## stack

- **frontend**: TypeScript, React, Vite; our own control-plane and session UIs
- **browser live media client**: LiveKit browser/JS SDK used from the session app
- **control plane api**: Go, `net/http` + stdlib `ServeMux`
- **session-runner**: private Go process/service that reconciles provisioning jobs and owns cloud/edge credentials
- **live media server**: self-hosted **LiveKit** on the temporary session server, initially single-node without Redis
- **session api / upload service**: Go, `net/http` + stdlib `ServeMux`
- **control-plane state**: SQLite for session metadata, participant identities, and provisioning intent/state
- **session-local state**: SQLite manifests + local disk for upload progress and track status, keyed by control-plane session/participant IDs
- **file storage**: local disk on the session VM for v1, organized by session/participant/source/source-instance/segment/chunk
- **edge / tls**: persistent Caddy edge with stable public hostnames and wildcard routing for temporary session backends
- **turn / nat traversal**: persistent coturn; allow co-hosted installs for tiny deployments, but keep dedicated TURN as the default recommendation once reliability matters
- **operator CLI**: local `vgpr` CLI installed on the host laptop; it owns setup, bootstrap, and routine ops
- **packaging**: Docker Compose for the local stack. Remote temporary session servers boot from a stock Ubuntu LTS image via cloud-init and run `livekit-server` + `sessiond` under systemd from a versioned release bundle; the CLI bootstraps remote hosts and then uses the control-plane API for normal operations
- **provisioning**: implement the mock provider first to lock the flow down; the control plane writes provisioning intent and the session-runner reconciles it; first real compute target is DigitalOcean, with Cloudflare DNS and DigitalOcean DNS both supported
- **tests**: Go test for backend, Vitest for frontend units, Playwright for host/guest smoke flows
- **observability**: structured JSON logs, per-track upload counters, explicit session manifests

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
- device setup and session-specific UI
- host controls, including recording start / stop
- local browser recording in rolling chunks
- background upload, retry, resume, and manifest state
- final artifact layout and download workflow
- durable participant identity from the control plane

Use the LiveKit JS SDK from our session app. Do **not** build the product on top of an off-the-shelf LiveKit UI. LiveKit React components are acceptable only as implementation helpers for non-core room UI, not as the foundation of the workflow.

## why this stack

- **don’t build an SFU first**. LiveKit is the boring choice and buys us reconnects, room semantics, TURN support, and a path to scale.
- **a persistent control plane** is the right place for host UX, stable participant IDs, and provisioning intent/state.
- **a private session-runner** is the right security boundary for cloud-provider and edge orchestration.
- **a persistent public edge** keeps DNS and TLS out of per-session provisioning, which is the only sane way to make new recording servers feel instantly available.
- **persistent TURN with deployment knobs** is the practical compromise for open source: co-host it on tiny installs, split it out when reliability or relay load matters, and make replacement/move operations explicit.
- **Go for the control plane and upload path** is the better long-term default: simpler deployment, lower overhead on chunk ingest, and still fast to ship.
- **SQLite + local disk** is enough for v1. Keep durable session and participant state in the control plane; keep only upload-local state on the temporary session server.
- **Docker Compose** is for the local stack and persistent deployment only. The disposable session server should stay 2 systemd-managed binaries on a stock VM.

## implementation notes

- Record **browser-native WebM chunks first**. Do not fight MP4/final packaging in the critical path.
- Lock v1 capture to **one mic source per seat**, **one or more camera source instances per seat**, and **repeatable optional screen-share source instances** with paired best-effort **system audio** when the browser/platform exposes it. Keep **1080p30 video** with **720p30 fallback** and **48 kHz Opus audio** as the baseline. Do **not** chase 2K/4K in the critical path.
- Model capture as **seat → source type → source instance → segment**. A fresh screen-share start creates a new source instance; a reconnect/restart of the same still-active source creates the next segment for that same source instance.
- Mint stable participant IDs in the control plane and sync the minimum session/participant snapshot to the temporary server.
- Keep provider and edge credentials out of the public control-plane process. The control plane requests runtime changes; the private session-runner executes them.
- Share only stable control-plane join links with humans. Treat the temporary session-server URL as internal bootstrap state, not the product surface.
- Map durable control-plane seat identity into LiveKit tokens and room identity; do not let LiveKit identity become the only source of truth, and do not assume one seat publishes only one media track.
- Persist upload progress per chunk so refresh/reconnect resumes instead of restarting.
- Bootstrap the temporary session server from a stock Ubuntu LTS image with cloud-init, a versioned release bundle, and systemd. Do **not** put package install, Docker image pulls, public DNS creation, or ACME issuance on the session-create critical path.
- Store an append-only manifest per source-instance segment so incomplete uploads are visible and recoverable.
- Record browser-monotonic capture offsets relative to the session recording epoch as sync metadata. Do **not** treat server receive time as track timing.
- Use 2 bearer join links per session (host, guest) plus stable participant seats and per-browser claim secrets for reconnect and takeover handling.
- Keep LiveKit room state separate from local recording state and upload state. Failure in one path must stay visible and recoverable in the others.
- Do not use LiveKit server-side recording or egress as the primary recording source for v1.
- Make the download artifact explicit: session folder + manifest, not a “magic” post-process pipeline.

## non-goals for v1

- multi-region orchestration
- cloud storage integrations
- server-side compositing or livestreaming
- a custom SFU or media backend

If we hit real limits, the first split is **separate upload ingest from session API**, not a full re-architecture.