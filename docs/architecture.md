# v1 architecture and tech stack

Related docs:

- `docs/repo-layout.md`
- `docs/milestones.md`
- `docs/testing.md`

## recommendation

Ship v1 as a **single-tenant temporary session server** per recording.

Keep the product split into 3 independent paths:

- **live call path**: browser ↔ SFU for conversation and monitoring
- **local capture path**: browser records per-participant media locally in rolling chunks
- **upload path**: browser uploads those chunks in the background with retry + resume

That is the right shape for reliability. A bad live connection must not silently ruin the local recording, and a stalled upload must not kill the call.

## stack

- **frontend**: TypeScript, React, Vite
- **live media**: self-hosted **LiveKit** on the temporary session server
- **app api / upload service**: Go, `net/http` + stdlib `ServeMux`
- **state**: SQLite for session metadata, upload manifests, and track status
- **file storage**: local disk on the session VM for v1, organized by session/participant/track/chunk
- **edge / tls**: Caddy
- **turn / nat traversal**: coturn
- **packaging**: Docker Compose on a single Ubuntu VM
- **provisioning**: start with one cloud target only (Hetzner or DigitalOcean), add others later
- **tests**: Go test for backend, Vitest for frontend units, Playwright for host/guest smoke flows
- **observability**: structured JSON logs, per-track upload counters, explicit session manifests

## why this stack

- **don’t build an SFU first**. LiveKit is the boring choice and buys us reconnects, room semantics, TURN support, and a path to scale.
- **Go for the control plane and upload path** is the better long-term default: simpler deployment, lower overhead on chunk ingest, and still fast to ship.
- **SQLite + local disk** is enough for temporary per-session infrastructure. No Postgres, no S3 dependency, no Kubernetes.
- **Docker Compose on one VM** matches the product model: create a box, record, download, destroy.

## implementation notes

- Record **browser-native WebM chunks first**. Do not fight MP4/final packaging in the critical path.
- Persist upload progress per chunk so refresh/reconnect resumes instead of restarting.
- Store an append-only manifest per track so incomplete uploads are visible and recoverable.
- Use signed join tokens with roles: host can start/stop recording; guest can only join.
- Make the download artifact explicit: session folder + manifest, not a “magic” post-process pipeline.

## non-goals for v1

- multi-region orchestration
- cloud storage integrations
- server-side compositing or livestreaming
- a custom SFU or media backend

If we hit real limits, the first split is **separate upload ingest from session API**, not a full re-architecture.