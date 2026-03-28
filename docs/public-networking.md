# v1 public networking

Related docs:

- `docs/README.md`
- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/version-pins.md`
- `docs/session-server-bootstrap.md`
- `docs/operator-cli.md`
- `docs/session-lifecycle.md`

## recommendation

Keep public networking **minimal and cheap** for alpha.

Ship one hosted topology only:

- stable control-plane links on a Cloudflare-managed domain
- Cloudflare DNS as the only supported DNS provider
- disposable DigitalOcean session servers
- **no persistent edge box**
- **no persistent TURN VM**
- each disposable session server terminates its own TLS and runs its own TURN service

Do **not** turn networking into a product matrix yet.

## topology

Default alpha layout:

- `app.<domain>`: persistent control plane UI + API on Cloudflare
- `<session-id>.sessions.<domain>`: session hostname published in Cloudflare DNS directly to the current disposable backend
- one disposable DigitalOcean session server per recording session
- TURN exposed by that same disposable session server for the lifetime of the session

The control plane shares only stable human join links, for example:

- `https://app.<domain>/j/<session-id>?role=guest&k=...`

The browser join flow fetches session bootstrap info from the control plane and then connects to the current session backend.

That bootstrap payload may include:

- session hostname / base URL
- LiveKit connection info
- session-scoped TURN host, ports, transport options, and credentials

That keeps human join links stable even if pre-recording provisioning fails and the control plane has to destroy and recreate the disposable backend.

## what stays persistent

Persistent services:

- Cloudflare-hosted control plane
- Cloudflare DNS zone

Disposable per-session runtime:

- Caddy
- LiveKit
- `sessiond`
- TURN
- local artifact disk

## integrations

Start with exactly this:

- **control plane**: Cloudflare Workers + D1
- **compute**: DigitalOcean
- **DNS**: Cloudflare DNS
- **session-side TLS**: Caddy on the disposable session server
- **TURN**: coturn on the disposable session server
- **session server base image**: stock DigitalOcean Ubuntu LTS image

Do **not** support DigitalOcean DNS, mock providers, or multiple TURN modes in alpha.

## DNS publication model

There is no persistent reverse-proxy layer in front of session servers.

Instead:

- the control plane allocates a session hostname such as `<session-id>.sessions.<domain>`
- the control plane creates or updates a Cloudflare DNS record pointing that hostname to the disposable backend IP
- the disposable session server serves HTTPS on that hostname
- when the session ends, the control plane removes the DNS record during teardown

Rules:

- the human-shared join link stays on `app.<domain>`
- the direct session hostname is a machine-facing bootstrap target, not the main human URL
- if provisioning fails before recording starts, the control plane may recreate the backend and repoint the DNS record while keeping the same human join link

## TURN stance

Do **not** ship alpha with a broad TURN feature matrix.

Do this instead:

- keep TURN support available from day one
- run TURN on the disposable session server itself
- use session-scoped credentials
- expose TURN only for the lifetime of that session server
- do **not** offer dedicated TURN placement, resizing UX, or migration modes yet

The cut is **persistent networking infrastructure as a product feature**, not TURN support itself.

## provisioning flow

### session provisioning

1. host creates a session; control-plane join links are immediately shareable
2. control plane writes provisioning intent for that session
3. control-plane provisioning logic selects a DigitalOcean region and boots a disposable session server
4. control plane allocates the session hostname and publishes the Cloudflare DNS record to that backend IP
5. temporary-server bootstrap runs per `docs/session-server-bootstrap.md`
6. the disposable server obtains or loads its session-side TLS config and reaches readiness
7. the control plane stores the session-scoped TURN details for browser bootstrap
8. `session_servers.state` becomes `ready`
9. browsers join through the stable control-plane flow

### retry before recording start

If provisioning fails before any `recording_epoch_id` exists:

- destroy the failed disposable backend
- boot a fresh one
- repoint the DNS record to the new backend
- replace the TURN details with the new backend's details
- keep the same human join link

This matches `docs/session-lifecycle.md`.

## TLS rules

Do this:

- terminate public TLS at Cloudflare for the control plane
- terminate session-side TLS on the disposable session server itself
- use per-session or per-hostname certificates for the disposable backend
- keep wildcard private keys off disposable session servers

Do **not** do this:

- pay for a separate always-on edge box in alpha
- pay for a separate always-on TURN VM in alpha
- support multiple DNS providers in alpha
- expose raw temporary-backend URLs as the main human-facing join links

## tradeoff

Removing the persistent edge box saves money and simplifies operations, but it means alpha accepts more work on the session-create hot path:

- per-session DNS publication
- session-side TLS setup on the disposable backend

That is a good trade for alpha.

## v1 targets

Set these targets for the first real hosted slice:

- cold provision to joinable: p95 under 60s
- pre-recording reprovision keeps the same human join link
- one scripted hosted smoke path proves create → provision → join → record → upload → stop

If cold boot is too slow, optimize in this order:

1. tighten bundle size and bootstrap work
2. add warm standby capacity in one region
3. only then revisit the network shape
