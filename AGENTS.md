# Project Overview

very-good-podcast-recorder is an open-source remote podcast recorder: browser-based session joining via URL, local per-participant tracks, a temporary session server, and host-controlled recording files and workflow.

`docs/README.md` is the docs map and source-of-truth index for the rest of `docs/`.
`docs/implementation-status.md` owns the temporary convention for marking which spec docs and sections are implemented.

If you need a spec or are updating docs, start with `docs/README.md` and follow the owning doc.
If you are making architecture, infrastructure, or stack decisions, read `docs/architecture.md` first.
If you are changing join/session/recording/upload/reconnect flows or the test harness around them, read `docs/testing.md` first.

## Fast feedback loop (required)

Use `mise exec -- ...` for toolchain commands.

Run the narrowest checks that prove the touched path before handoff:

```bash
mise exec -- gofmt -w path/to/file.go
mise exec -- go vet ./path/to/package
mise exec -- go test ./path/to/package
mise exec -- pnpm exec vitest run web/tests/path/to/spec.ts
mise exec -- pnpm exec playwright test e2e/scenarios/<scenario>.spec.ts
mise exec -- pnpm exec tsgo --noEmit -p web/control/tsconfig.json
mise exec -- pnpm exec tsgo --noEmit -p web/session/tsconfig.json
mise exec -- pnpm exec oxlint path/to/file.tsx
mise exec -- pnpm exec oxfmt --check path/to/file.tsx
```

Prefer focused runs over full-suite runs unless requested.

If you touch join/session/recording/upload/reconnect flows, also run the relevant local harness scenario from `docs/testing.md` and inspect the summary JSON/logs.

If the repo does not have the narrow command you need yet, add it as part of the bootstrap work instead of falling back to broad or manual-only validation.

Before handoff, the last step is to update the relevant docs and status markers in `docs/README.md` and the owning spec per `docs/implementation-status.md`.

## Top priorities / invariants

- Reliability, robustness, and stability first.
- Design for bad networks. Assume packet loss, reconnects, slow uploads, and intermittent failure, especially for guests on poor connections.
- Performance first. Support older hardware and low-end Android phones.
- Protect the recording path over convenience features.
- Keep the live call path, local capture path, and upload path loosely coupled. Failure in one path must not silently corrupt the others.
- Prefer boring, observable systems. Critical paths need logs, reproducible tests, or other fast feedback loops.
- Treat reality-like local end-to-end coverage as part of the product, not test polish. For join/session/recording/upload/reconnect work, prefer a dev-machine harness that runs a real multi-user session against the real local stack over mocks or remote-only manual testing.
- Changes to session-critical flows are not done with unit tests alone; maintain a scriptable local multi-participant smoke path and extend it for failures that matter (disconnects, packet loss, stalled uploads, resume/retry).
