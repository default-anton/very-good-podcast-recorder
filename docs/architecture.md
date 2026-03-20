# v1 architecture and tech stack

Related docs:

- `docs/repo-layout.md`
- `docs/milestones.md`
- `docs/feedback-loop.md`
- `docs/testing.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/database-schema.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/capture-profile.md`

## recommendation

Ship v1 as a **persistent host control plane** plus a **single-tenant temporary session server** per recording.

Keep the product split into 3 independent paths:

- **live call path**: browser ↔ SFU for conversation and monitoring
- **local capture path**: browser records per-seat source instances locally in rolling chunks
- **upload path**: browser uploads those chunks in the background with retry + resume

That is the right shape for reliability. A bad live connection must not silently ruin the local recording, and a stalled upload must not kill the call.

Keep host orchestration out of the media-critical path: the persistent control plane owns sessions, participant identities, and provisioning; the temporary session server owns the live call and chunk ingest.

## stack

- **frontend**: TypeScript, React, Vite; our own control-plane and session UIs
- **browser live media client**: LiveKit browser/JS SDK used from the session app
- **control plane api**: Go, `net/http` + stdlib `ServeMux`
- **live media server**: self-hosted **LiveKit** on the temporary session server
- **session api / upload service**: Go, `net/http` + stdlib `ServeMux`
- **control-plane state**: SQLite for session metadata, participant identities, and provisioning state
- **session-local state**: SQLite manifests + local disk for upload progress and track status, keyed by control-plane session/participant IDs
- **file storage**: local disk on the session VM for v1, organized by session/participant/source/source-instance/segment/chunk
- **edge / tls**: Caddy
- **turn / nat traversal**: LiveKit embedded TURN by default; external TURN only if we hit a concrete requirement
- **packaging**: Docker Compose for the temporary session server; keep the control plane simple enough to run locally or on a small Ubuntu VM
- **provisioning**: start with one cloud target only (Hetzner or DigitalOcean), add others later
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
- **a persistent control plane** is the right place for host UX, stable participant IDs, and cloud-provider orchestration.
- **Go for the control plane and upload path** is the better long-term default: simpler deployment, lower overhead on chunk ingest, and still fast to ship.
- **SQLite + local disk** is enough for v1. Keep durable session and participant state in the control plane; keep only upload-local state on the temporary session server.
- **Docker Compose on one VM** still matches the temporary server model. The control plane can run on a laptop or a cheap VPS.

## implementation notes

- Record **browser-native WebM chunks first**. Do not fight MP4/final packaging in the critical path.
- Lock v1 capture to **one mic source per seat**, **one or more camera source instances per seat**, and **repeatable optional screen-share source instances** with paired best-effort **system audio** when the browser/platform exposes it. Keep **1080p30 video** with **720p30 fallback** and **48 kHz Opus audio** as the baseline. Do **not** chase 2K/4K in the critical path.
- Model capture as **seat → source type → source instance → segment**. A fresh screen-share start creates a new source instance; a reconnect/restart of the same still-active source creates the next segment for that same source instance.
- Mint stable participant IDs in the control plane and sync the minimum session/participant snapshot to the temporary server.
- Map durable control-plane seat identity into LiveKit tokens and room identity; do not let LiveKit identity become the only source of truth, and do not assume one seat publishes only one media track.
- Persist upload progress per chunk so refresh/reconnect resumes instead of restarting.
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