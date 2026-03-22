# v1 session-server bootstrap

Related docs:

- `docs/README.md`
- `docs/architecture.md`
- `docs/public-networking.md`
- `docs/operator-cli.md`
- `docs/session-lifecycle.md`

## recommendation

Boot each temporary session server from a **stock provider Ubuntu LTS image**.

Do **not** maintain custom VM snapshots/images for v1.
Do **not** put `apt install`, public DNS, public TLS, or Docker image pulls on the session-create hot path.
Do **not** run Docker on the temporary session server unless measurements force it.

Use this bootstrap chain instead:

- provider VM from stock image
- cloud-init user-data
- one-shot bootstrap systemd unit
- versioned session-server release bundle
- `systemd` services for `livekit-server` and `sessiond`

## why

This keeps the temporary server boring:

- no snapshot/image lifecycle to maintain or pay for
- no image drift problem
- no Docker daemon or registry dependency on short-lived boxes
- one deterministic bootstrap path the mock provider and real provider can both model
- simple rollback: change the bundle version the session-runner asks the VM to install

## session-server shape

For v1, a temporary session server is exactly:

- one stock Ubuntu LTS VM with cloud-init and systemd
- one pinned `livekit-server` binary
- one pinned `sessiond` binary
- local SQLite + local artifact disk
- no Redis on the temporary server
- no provider, DNS, or edge-mutation credentials on the temporary server

Public hostname ownership, TLS termination, and TURN placement are defined in `docs/public-networking.md`.

## release artifact

The session-runner should bootstrap from **one versioned release bundle** per session-server build, not from ad hoc package installs.

Bundle contents:

- `livekit-server`
- `sessiond`
- default config templates
- systemd unit templates
- a manifest with exact versions and SHA256 checksums

Install layout:

- `/opt/vgpr/releases/<version>/...`
- `/opt/vgpr/current -> /opt/vgpr/releases/<version>`
- `/etc/vgpr/livekit.yaml`
- `/etc/vgpr/sessiond.yaml`
- `/etc/vgpr/bootstrap.env`
- `/var/lib/vgpr/session/`
- `/var/log/vgpr/` if we need file logs; otherwise use journald

Keep the bundle self-contained enough that the VM does not need package-manager work on the hot path.

## bootstrap flow

1. control plane writes provisioning intent
2. session-runner selects region and creates a VM from the stock Ubuntu LTS image
3. session-runner passes cloud-init user-data with:
   - session id
   - control-plane bootstrap URL
   - single-use bootstrap credential
   - bundle URL + SHA256
   - desired public session hostname
   - storage and port settings
4. cloud-init writes config files and systemd units, then starts `vgpr-session-bootstrap.service`
5. `vgpr-session-bootstrap.service` waits for `network-online.target`, creates the service user and directories, downloads the bundle, verifies checksum, and installs it under `/opt/vgpr/releases/<version>`
6. bootstrap renders `livekit.yaml` and `sessiond.yaml`, enables `vgpr-livekit.service` and `vgpr-sessiond.service`, then starts them
7. `sessiond` exchanges the single-use bootstrap credential for the complete session snapshot plus any runtime-scoped credential it still needs, then deletes the bootstrap credential from disk
8. `sessiond` verifies local disk, initializes the session-local SQLite state, checks local reachability to LiveKit, and exposes a machine-readable readiness endpoint
9. session-runner polls readiness
10. session-runner publishes the public route only after readiness passes, per `docs/public-networking.md`

## systemd units

Use 3 units:

- `vgpr-session-bootstrap.service`: one-shot, rerunnable bootstrap/install logic
- `vgpr-livekit.service`: long-running LiveKit process
- `vgpr-sessiond.service`: long-running session API/upload process

Rules:

- `vgpr-session-bootstrap.service` is the only unit that downloads artifacts
- `vgpr-livekit.service` and `vgpr-sessiond.service` run as an unprivileged service user
- `vgpr-sessiond.service` starts after `vgpr-livekit.service`
- all services log structured output to journald
- stop uses normal `systemd` signals so LiveKit can drain cleanly

Keep cloud-init small. Put real logic in the bootstrap unit so recovery is `systemctl restart vgpr-session-bootstrap` instead of re-editing user-data.

## LiveKit config stance

For the temporary session server, start with **single-node LiveKit without Redis**.

Use:

- a pinned config file passed via `--config`
- direct host networking on the VM
- the normal WebRTC UDP range
- TCP fallback enabled
- the persistent TURN deployment from `docs/public-networking.md` where needed

Do **not** add Redis to the temporary server until we actually need multi-node LiveKit or a Redis-dependent side service.
Do **not** use LiveKit egress as the primary recording path.

## readiness contract

`session_servers.state = 'ready'` means all of these are true:

- bootstrap unit succeeded
- `livekit-server` process is running with the expected config version
- `sessiond` process is running
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
    "livekit": true,
    "sessiond": true,
    "snapshot_loaded": true,
    "artifact_disk_writable": true,
    "free_space_ok": true,
    "upload_ready": true
  }
}
```

The session-runner should wait for this signal, not guess based on boot time.

## security rules

- bootstrap credential is **single-use** and scoped to one session server
- after first successful bootstrap exchange, delete the bootstrap credential from disk
- keep provider, DNS, and edge credentials off the temporary server
- keep wildcard certs and wildcard private keys off the temporary server
- do not require SSH in the happy path

## failure handling

Before recording starts, failed bootstrap should be handled by **replace, not repair**:

- if bootstrap or readiness times out, mark the runtime failed
- destroy the VM
- create a fresh VM
- keep the same human join link

Do not do in-place package repair on a failed temporary server before recording starts.

If cold boot misses target, optimize in this order:

1. tighten bundle size and bootstrap work
2. add warm standby capacity
3. only then consider a custom image

## non-goals for v1

- custom VM snapshots/images for temporary session servers
- Docker on temporary session servers
- Redis on temporary session servers by default
- per-session DNS creation
- per-session ACME/TLS issuance
- in-place mutation as the primary recovery path
