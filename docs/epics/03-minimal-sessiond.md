# epic 03 — minimal `sessiond`

## Recommended PR slices

split into 2–3 PRs:
- [done] service skeleton + config + health
- [done] claims/state basics
- uploads + manifest persistence

Related docs:

- `docs/architecture.md`
- `docs/session-server-bootstrap.md`
- `docs/seat-claim-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/repo-layout.md`

## goal

Land the first real Go backend slice for the disposable session server.

## scope

Add:

```text
cmd/
└── sessiond/
    └── main.go

internal/
└── sessiond/
    ├── config.go
    ├── server.go
    ├── routes_health.go
    ├── routes_claims.go
    ├── routes_recording.go
    ├── routes_upload.go
    ├── livekit.go
    ├── manifests.go
    ├── artifact_paths.go
    ├── sqlite.go
    ├── server_test.go
    └── doc.go

db/
└── migrations/
    └── sessiond/
        └── 00001_init.sql
```

Implement only what milestone 1 needs:

- readiness/health endpoint
- seat claim/reclaim basics
- recording start/stop-related server state needed for the local flow
- chunk upload acceptance
- raw chunk + manifest persistence to local disk/SQLite

## non-goals

- takeover flow
- advanced degraded/failure salvage behavior
- hosted bootstrap concerns
- broad cleanup/reconciliation machinery
- `pkg/` or a wide Go service tree

## acceptance criteria

- `cmd/sessiond/` is the only entrypoint root for the service
- `internal/sessiond/` holds the runtime code
- one session run can accept baseline uploads and write manifests/raw files
- SQLite state and artifact paths are explicit and inspectable
- the shape remains boring and reviewable

## feedback loop

Prove the slice with focused Go checks first:

```bash
mise exec -- gofmt -w cmd/sessiond/main.go internal/sessiond/*.go
mise exec -- go vet ./cmd/sessiond ./internal/sessiond
mise exec -- go test ./internal/sessiond
```

If signals are weak, add one deterministic integration-style test around claim + upload happy path before adding more features.

## notes

Do **not** introduce `pkg/`.
Do **not** add `cmd/controlplane/`.
This slice should stay tightly scoped to the disposable session server.