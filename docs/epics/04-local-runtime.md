# epic 04 — real local runtime

## Recommended PR slices

split into 2 PRs:
- [done] local runtime topology/config source of truth
- [done] local runtime compose/config/scripts + smoke output

Related docs:

- `docs/local-stack.md`
- `docs/alpha-scope.md`
- `docs/testing.md`
- `docs/repo-layout.md`

## goal

Create one real local runtime that milestone 1 development and the harness both use.

## scope

Add:

```text
deploy/
└── local/
    ├── compose.yaml
    ├── livekit.yaml
    ├── sessiond.env
    └── README.md

scripts/
├── local-up
├── local-down
├── local-reset
└── local-smoke
```

Bring up the minimum real stack:

- control plane
- session app
- sessiond
- LiveKit
- local storage/state

## non-goals

- hosted bootstrap assets for milestone 2
- generic infra/deploy abstraction
- operator-grade setup UX
- separate local runtime just for tests

## acceptance criteria

- one command path brings up the full local runtime
- the same runtime is used for app development and E2E harness work
- local state/logs/artifacts are inspectable
- `local-smoke` emits text-first health status plus the resolved control-app and session-app URLs
- local control/session app origins, API URLs, and runtime ports come from one local-runtime source of truth instead of new scattered `127.0.0.1` literals
- `deploy/local/` exists, but `deploy/session-server/` stays deferred until hosted bootstrap work is real

## feedback loop

Primary proof is a fast smoke path:

```bash
mise exec -- ./scripts/local-up
mise exec -- ./scripts/local-smoke
mise exec -- ./scripts/local-down
```

If smoke validation is flaky, improve logs and health output before adding more product work.

## notes

This is the one deliberate early `deploy/` addition because milestone 1 needs a real local stack. Keep the control app and session app as distinct runtime targets, even if a local reverse proxy fronts them later. Do **not** use this as an excuse to add hosted bootstrap assets yet.

Treat local topology as product contract, not random app config. This epic should remove or centralize the existing hard-coded local origins/ports as it lands so epic 05 does not build more harness/runtime logic on duplicated topology assumptions.
