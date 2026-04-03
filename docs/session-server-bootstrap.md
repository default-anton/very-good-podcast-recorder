# v1 session-server bootstrap

Related docs:

- `docs/README.md`
- `docs/architecture.md`
- `docs/public-networking.md`
- `docs/operator-cli.md`
- `docs/version-pins.md`
- `docs/session-lifecycle.md`
- `docs/releases.md`

## recommendation

Boot each disposable session server from a **stock DigitalOcean Ubuntu LTS image**.

Do **not** maintain custom VM snapshots/images for alpha.
Do **not** run Docker on the disposable session server unless measurements force it.

For alpha, accept a little more session-create hot-path work in exchange for lower steady-state cost:

- the control plane publishes a per-session Cloudflare DNS record
- the disposable backend terminates its own TLS
- the disposable backend runs its own TURN service

Use this bootstrap chain instead:

- DigitalOcean VM from stock image
- cloud-init user-data
- one-shot bootstrap systemd unit
- versioned session-server release bundle
- `systemd` services for `caddy`, `livekit-server`, `sessiond`, and `coturn`

## why

This keeps the disposable server boring while avoiding an always-on edge bill:

- no snapshot/image lifecycle to maintain or pay for
- no image drift problem
- no Docker daemon or registry dependency on short-lived boxes
- one deterministic bootstrap path
- simple rollback: change the bundle version used for new servers
- no persistent edge box required for alpha

## session-server shape

For alpha, a disposable session server is exactly:

- one stock DigitalOcean Ubuntu LTS VM with cloud-init and systemd
- one pinned `caddy` binary for session-side TLS
- one pinned `livekit-server` binary
- one pinned `sessiond` binary
- one pinned `coturn` runtime for that session
- local SQLite + local artifact disk
- no Redis on the temporary server
- no provider or DNS-mutation credentials on the temporary server

Public hostname ownership, TLS termination, and TURN placement are defined in `docs/public-networking.md`.

## release artifact

Bootstrap from **one versioned release bundle** per session-server build, not from ad hoc package installs.
The published asset naming and release manifest contract live in `docs/releases.md`.

Bundle contents:

- `caddy`
- `livekit-server`
- `sessiond`
- `coturn`
- default config templates
- systemd unit templates
- a manifest with exact versions and SHA256 checksums

The chosen third-party version pins live in `docs/version-pins.md`.

Install layout:

- `/opt/vgpr/releases/<version>/...`
- `/opt/vgpr/current -> /opt/vgpr/releases/<version>`
- `/etc/vgpr/Caddyfile`
- `/etc/vgpr/livekit.yaml`
- `/etc/vgpr/sessiond.yaml`
- `/etc/vgpr/turnserver.conf`
- `/etc/vgpr/bootstrap.env`
- `/var/lib/vgpr/session/`
- `/var/log/vgpr/` if we need file logs; otherwise use journald

Keep the bundle self-contained enough that the VM does not need package-manager work on the hot path.

## bootstrap flow

1. control plane writes provisioning intent
2. control-plane provisioning logic selects a region and creates a VM from the stock DigitalOcean Ubuntu LTS image
3. the control plane allocates the public session hostname and publishes its Cloudflare DNS record to the backend IP
4. the control plane passes cloud-init user-data with:
   - session id
   - control-plane bootstrap URL
   - single-use bootstrap credential
   - bundle URL + SHA256
   - desired public session hostname
   - storage and port settings
5. cloud-init writes config files and systemd units, then starts `vgpr-session-bootstrap.service`
6. `vgpr-session-bootstrap.service` waits for `network-online.target`, creates the service user and directories, downloads the bundle, verifies checksum, and installs it under `/opt/vgpr/releases/<version>`
7. bootstrap renders `Caddyfile`, `livekit.yaml`, `sessiond.yaml`, and TURN config, enables `vgpr-caddy.service`, `vgpr-livekit.service`, `vgpr-sessiond.service`, and `vgpr-turn.service`, then starts them
8. Caddy obtains or serves the TLS config for the session hostname
9. `sessiond` exchanges the single-use bootstrap credential for the complete session snapshot plus any runtime-scoped credential it still needs, then deletes the bootstrap credential from disk
10. `sessiond` verifies local disk, initializes the session-local SQLite state, checks local reachability to LiveKit, and exposes a machine-readable readiness endpoint
11. control-plane provisioning logic polls readiness and marks the runtime ready only after the public session hostname is usable

## systemd units

Use 5 units:

- `vgpr-session-bootstrap.service`: one-shot, rerunnable bootstrap/install logic
- `vgpr-caddy.service`: long-running HTTPS front door for the session hostname
- `vgpr-livekit.service`: long-running LiveKit process
- `vgpr-sessiond.service`: long-running session API/upload process
- `vgpr-turn.service`: long-running TURN process for that session server

Rules:

- `vgpr-session-bootstrap.service` is the only unit that downloads artifacts
- `vgpr-caddy.service`, `vgpr-livekit.service`, `vgpr-sessiond.service`, and `vgpr-turn.service` run as an unprivileged service user where practical
- `vgpr-sessiond.service` starts after `vgpr-livekit.service`
- all services log structured output to journald
- stop uses normal `systemd` signals so LiveKit can drain cleanly

Keep cloud-init small. Put real logic in the bootstrap unit so recovery is `systemctl restart vgpr-session-bootstrap` instead of re-editing user-data.

## LiveKit config stance

For the disposable session server, start with **single-node LiveKit without Redis**.

Use:

- a pinned config file passed via `--config`
- direct host networking on the VM
- the normal WebRTC UDP range
- TCP fallback enabled
- the session-scoped TURN service from `docs/public-networking.md` where needed

Do **not** add Redis to the disposable server until we actually need multi-node LiveKit or a Redis-dependent side service.
Do **not** use LiveKit egress as the primary recording path.

## sessiond process health [done]

The first `sessiond` slice exposes 2 text-first JSON endpoints:

- `GET /healthz` returns `200` when the process is alive
- `GET /readyz` returns `200` only when the configured artifact root and SQLite directory exist locally; otherwise it returns `503`

On startup, `sessiond` prepares the artifact root and SQLite parent directory with service-private permissions before serving requests.

Both endpoints report:

- `status`
- `session_id`
- `release_version`
- `listen_addr`
- `artifact_root`
- `sqlite_path`
- a `checks` object for the current local runtime-path signals

This is the service-local health contract only. Hosted readiness will extend `checks` until it satisfies the full server contract below.

## readiness contract

`session_servers.state = 'ready'` means all of these are true:

- bootstrap unit succeeded
- `caddy` process is running with the expected config
- the public session hostname is serving HTTPS
- `livekit-server` process is running with the expected config version
- `sessiond` process is running
- TURN process is running
- session snapshot and roster/auth state are fully loaded locally
- session-local SQLite is writable
- artifact root exists and passes a minimum free-space check
- session control endpoints are ready
- upload endpoints are ready
- local `sessiond -> LiveKit` dependency checks pass

Expose readiness as text-first JSON, for example:

```json
{
  "status": "ready",
  "session_id": "sess_123",
  "release_version": "2026.03.21",
  "checks": {
    "bundle_installed": true,
    "caddy": true,
    "public_tls_ready": true,
    "livekit": true,
    "sessiond": true,
    "turn": true,
    "snapshot_loaded": true,
    "artifact_disk_writable": true,
    "free_space_ok": true,
    "upload_ready": true
  }
}
```

The control plane should wait for this signal, not guess based on boot time.

## security rules

- bootstrap credential is **single-use** and scoped to one session server
- after first successful bootstrap exchange, delete the bootstrap credential from disk
- keep provider and DNS-mutation credentials off the disposable session server
- keep wildcard certs and wildcard private keys off the disposable session server
- do not require SSH in the happy path

## failure handling

Before recording starts, failed bootstrap should be handled by **replace, not repair**:

- if bootstrap or readiness times out, mark the runtime failed
- destroy the VM
- create a fresh VM
- repoint the DNS record if needed
- keep the same human join link

Do not do in-place package repair on a failed disposable server before recording starts.

If cold boot misses target, optimize in this order:

1. tighten bundle size and bootstrap work
2. add warm standby capacity
3. only then consider a custom image or a persistent edge later

## non-goals for v1

- custom VM snapshots/images for disposable session servers
- Docker on disposable session servers
- Redis on disposable session servers by default
- multiple DNS providers
- in-place mutation as the primary recovery path
