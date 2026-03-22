# recommended repo layout

## recommendation

Keep one repo with one persistent control plane, one private session-runner, one temporary session service, one operator CLI, and one end-to-end harness.

Do **not** introduce workspaces, shared packages, extra services, or separate repos until duplication or scale forces it.

```text
.
├── cmd/
│   ├── controlplane/     # Go entrypoint: host control plane API
│   ├── sessionrunner/    # Go entrypoint: private session-server lifecycle reconciler
│   ├── sessiond/         # Go entrypoint: temporary session API + upload ingest
│   └── vgpr/             # Go entrypoint: operator CLI
├── internal/
│   ├── artifacts/        # session manifests, download assembly, file layout per docs/artifact-manifest.md
│   ├── auth/             # signed join tokens, roles
│   ├── controlplane/     # sessions, participants, provisioning intent/state
│   ├── provisioning/     # provider adapters, runner jobs, reconciliation
│   ├── recordings/       # recording lifecycle, track state
│   ├── sessions/         # temporary session state synced from control plane
│   └── uploads/          # chunk ingest, resume, retry bookkeeping
├── web/
│   ├── control/          # host control plane web app
│   ├── session/          # browser join/room/recording app
│   └── tests/            # frontend-local tests only; multi-participant harness lives in e2e/
├── e2e/
│   ├── scenarios/        # happy path, reconnect, upload stall
│   └── fixtures/         # fake media, deterministic inputs
├── deploy/
│   ├── local/            # local stack packaging, Compose, and dev-runtime assets
│   ├── caddy/            # persistent edge / TLS router config
│   ├── livekit/          # shared/local LiveKit config
│   └── session-server/   # cloud-init, systemd, config templates, bootstrap assets, release-bundle inputs
├── scripts/              # stable one-command dev and CI entrypoints
├── testdata/             # backend fixtures and golden manifests
└── docs/
```

## rules

- `cmd/` stays thin. Business logic lives under `internal/`. CLI and services are sibling binaries.
- `web/` owns both browser surfaces: the host control plane and the participant session app.
- `web/tests/` is for frontend-local tests. The reality-like multi-participant harness lives in `e2e/`.
- `e2e/` is part of the product, not optional test polish.
- `deploy/` owns only what is required to boot the local stack, the persistent edge, and one temporary session server. Keep session-server bootstrap assets together instead of scattering them across the repo.
- `scripts/` is the public interface for humans and CI. Prefer a few stable commands over many ad hoc ones.

## avoid for now

Skip these until the repo proves it needs them:

- `pkg/` public Go libraries
- `packages/` or a JS workspace split
- a separate repo for `vgpr`
- a separate repo for deploy/bootstrap assets
- a separate ingest service
- Terraform or multi-cloud provisioning code
- server-side media post-processing pipelines

The first split, if we hit real pressure, is **extract upload ingest from `sessiond`**. Do not pre-split before that.
