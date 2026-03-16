# recommended repo layout

## recommendation

Keep one repo with one web app, one Go service, and one end-to-end harness.

Do **not** introduce workspaces, shared packages, or extra services until duplication or scale forces it.

```text
.
├── cmd/
│   └── sessiond/         # Go entrypoint: session API + upload ingest
├── internal/
│   ├── artifacts/        # session manifests, download assembly, file layout
│   ├── auth/             # signed join tokens, roles
│   ├── recordings/       # recording lifecycle, track state
│   ├── sessions/         # session creation, participant identity, state
│   └── uploads/          # chunk ingest, resume, retry bookkeeping
├── web/
│   ├── src/
│   │   ├── app/          # app shell, providers, routing
│   │   ├── features/     # join, room, recording, uploads
│   │   └── lib/          # thin UI/client helpers
│   └── tests/
├── e2e/
│   ├── scenarios/        # happy path, reconnect, upload stall
│   └── fixtures/         # fake media, deterministic inputs
├── deploy/
│   ├── compose.yaml      # local stack + temp-server packaging
│   ├── caddy/
│   ├── coturn/
│   └── livekit/
├── scripts/              # stable one-command dev and CI entrypoints
├── testdata/             # backend fixtures and golden manifests
└── docs/
```

## rules

- `cmd/` stays thin. Business logic lives under `internal/`.
- `web/` owns browser UX and browser-side recording/upload logic. Keep feature code grouped by user workflow.
- `e2e/` is part of the product, not optional test polish.
- `deploy/` only contains what is required to boot one temporary session server.
- `scripts/` is the public interface for humans and CI. Prefer a few stable commands over many ad hoc ones.

## avoid for now

Skip these until the repo proves it needs them:

- `pkg/` public Go libraries
- `packages/` or a JS workspace split
- a separate ingest service
- Terraform or multi-cloud provisioning code
- server-side media post-processing pipelines

The first split, if we hit real pressure, is **extract upload ingest from `sessiond`**. Do not pre-split before that.
