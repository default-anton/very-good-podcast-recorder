# v1 public networking

Related docs:

- `docs/architecture.md`
- `docs/operator-cli.md`
- `docs/session-lifecycle.md`
- `docs/testing.md`
- `docs/database-schema.md`

## recommendation

Keep **public networking persistent** and make **session servers disposable backends**.

Do **not** put per-session DNS record creation or per-session ACME/TLS issuance on the hot path.

For v1, ship:

- stable control-plane links on one persistent domain
- a persistent public edge that owns DNS/TLS and routes session traffic
- a private session-runner that owns provider and edge mutation credentials
- a persistent TURN deployment with explicit knobs for co-hosted vs dedicated placement
- temporary session servers that boot fast and never own public certificate lifecycle

## topology

Default v1 layout:

- `app.<domain>`: persistent control plane UI + API
- `*.sessions.<domain>`: persistent edge-routed session hostnames
- `turn.<domain>`: persistent TURN hostname
- one temporary session server per recording session

The control plane shares only stable control-plane join links with humans, for example:

- `https://app.<domain>/j/<session-id>?role=guest&k=...`

The browser join flow fetches session bootstrap info from the control plane and then connects to the current session backend.

That keeps user-facing links stable even if pre-recording provisioning fails and the control plane has to destroy and recreate the temporary backend.

## what stays persistent

Persistent services:

- control plane
- private session-runner
- edge / TLS router
- DNS zone
- TURN deployment

Disposable per-session runtime:

- LiveKit
- `sessiond`
- local artifact disk

## integrations

Start with:

- **compute**: DigitalOcean
- **DNS**: Cloudflare DNS or DigitalOcean DNS
- **operator surface**: local `vgpr` CLI on the host laptop
- **edge / TLS**: Caddy
- **TURN**: coturn
- **session image**: prebaked DigitalOcean snapshot/image

Use the DNS provider's API for record management, not as the primary media proxy.

Do **not** put compute, DNS, or edge mutation credentials in the public control-plane process. Keep them in the private session-runner.

## routing model

The edge owns wildcard TLS for `*.sessions.<domain>` and routes by hostname to the currently assigned temporary backend.

The private session-runner publishes or updates the route only after the temporary backend passes readiness checks.

Minimum readiness for `session_servers.state = 'ready'`:

- backend API healthy
- session snapshot synced
- LiveKit ready
- upload endpoints ready

## TURN deployment modes

Support both modes in v1.

### 1. co-hosted TURN

Run coturn on the same VPS as the control plane/edge.

Use this for:

- tiny installs
- demos
- low concurrency
- operators who want the cheapest possible footprint

### 2. dedicated TURN

Run coturn on its own VPS.

Use this as the default recommendation once:

- outside users matter
- multiple sessions may overlap
- relay-heavy networks are expected
- reliability matters more than absolute lowest cost

## TURN knobs

The product should let operators:

- choose co-hosted or dedicated TURN
- change TURN VM size
- destroy and recreate the TURN deployment
- move TURN from co-hosted to dedicated and back
- rotate TURN credentials without changing join-link shape

Treat TURN as replaceable infrastructure, not a hand-managed pet box.

For providers without easy vertical resize, replacement is the expected operation.

## provisioning flow

### session provisioning

1. host creates session; control plane join links are immediately shareable
2. control plane writes provisioning intent for that session
3. private session-runner selects a region and boots a temporary session server from a prebaked image
4. backend starts `sessiond` + LiveKit and pulls bootstrap state from the control plane
5. private session-runner waits for readiness checks
6. private session-runner publishes the edge route for the session hostname
7. `session_servers.state` becomes `ready`
8. browsers join through the stable control-plane flow

### retry before recording start

If provisioning fails before any `recording_epoch_id` exists:

- destroy the failed temporary backend
- boot a fresh one
- republish the route
- keep the same human join link

This matches `docs/session-lifecycle.md`.

## TLS rules

Do this:

- terminate public TLS at the persistent edge
- keep wildcard certs off temporary session servers
- keep public DNS static except for controlled edge routing changes

Do **not** do this:

- issue TLS certs on each temporary session server at runtime
- depend on fresh public DNS propagation before a session becomes joinable
- copy wildcard private keys onto every temporary backend
- expose raw temporary-backend URLs as the main user-facing join links

## v1 targets

Set these targets for the first real deployment slice:

- cold provision to joinable: p95 under 45s
- route publish/update: under 1s once the backend is healthy
- pre-recording reprovision keeps the same human join link
- one scripted remote smoke path proves create → provision → join → record → upload → stop

If cold boot is too slow, the next optimization is warm standby capacity in one region. Do not add that before measuring.
