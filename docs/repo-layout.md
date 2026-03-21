# recommended repo layout

## recommendation

Keep one repo with one persistent control plane, one private session-runner, one temporary session service, and one end-to-end harness.

Do **not** introduce workspaces, shared packages, or extra services until duplication or scale forces it.

```text
.
├── cmd/
│   ├── controlplane/     # Go entrypoint: host control plane API
│   ├── sessionrunner/    # Go entrypoint: private session-server lifecycle reconciler
│   └── sessiond/         # Go entrypoint: temporary session API + upload ingest
├── internal/
│   ├── artifacts/        # session manifests, download assembly, file layout
│   ├── auth/             # signed join tokens, roles
│   ├── controlplane/     # sessions, participants, provisioning intent/state
│   ├── provisioning/     # provider adapters, runner jobs, reconciliation
│   ├── recordings/       # recording lifecycle, track state
│   ├── sessions/         # temporary session state synced from control plane
│   └── uploads/          # chunk ingest, resume, retry bookkeeping
├── web/
│   ├── control/          # host control plane web app
│   ├── session/          # browser join/room/recording app
│   └── tests/
├── e2e/
│   ├── scenarios/        # happy path, reconnect, upload stall
│   └── fixtures/         # fake media, deterministic inputs
├── deploy/
│   ├── compose.yaml      # local stack + control-plane/temp-session packaging
│   ├── caddy/
│   └── livekit/
├── scripts/              # stable one-command dev and CI entrypoints
├── testdata/             # backend fixtures and golden manifests
└── docs/
```

## rules

- `cmd/` stays thin. Business logic lives under `internal/`.
- `web/` owns both browser surfaces: the host control plane and the participant session app.
- `e2e/` is part of the product, not optional test polish.
- `deploy/` only contains what is required to boot the persistent control plane, the private session-runner, and one temporary session server.
- `scripts/` is the public interface for humans and CI. Prefer a few stable commands over many ad hoc ones.

## avoid for now

Skip these until the repo proves it needs them:

- `pkg/` public Go libraries
- `packages/` or a JS workspace split
- a separate ingest service
- Terraform or multi-cloud provisioning code
- server-side media post-processing pipelines

The first split, if we hit real pressure, is **extract upload ingest from `sessiond`**. Do not pre-split before that.
