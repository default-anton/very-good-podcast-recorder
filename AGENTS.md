# Project Overview

very-good-podcast-recorder is an open-source remote podcast recorder: browser-based session joining via URL, local per-participant tracks, a temporary session server, and host-controlled recording files and workflow.

`README.md` is the high-level overview of the project.
`docs/README.md` is the docs map and source-of-truth index for the rest of `docs/`.

If you need a spec or are updating docs, start with `docs/README.md` and follow the owning doc.
If you are making architecture, infrastructure, or stack decisions, read `docs/architecture.md` first.
If you are changing join/session/recording/upload/reconnect flows or the test harness around them, read `docs/testing.md` first.

## Current state

- Repo is bootstrap-only right now. Keep the first implementation simple and easy to evolve.
- Add structure, tooling, and dependencies only when they directly help ship the next demoable slice.

## Fast feedback loop (required)

Run the narrowest checks that prove the touched path before handoff:

```bash
go test ./path/to/package
pnpm exec vitest run web/tests/path/to/spec.ts
pnpm exec playwright test e2e/scenarios/<scenario>.spec.ts
pnpm exec tsc --noEmit -p web/control/tsconfig.json
pnpm exec tsc --noEmit -p web/session/tsconfig.json
pnpm exec oxlint path/to/file.tsx
pnpm exec oxfmt --check path/to/file.tsx
```

Prefer focused runs over full-suite runs unless requested.

If you touch join/session/recording/upload/reconnect flows, also run the relevant local harness scenario from `docs/testing.md` and inspect the summary JSON/logs.

If the repo does not have the narrow command you need yet, add it as part of the bootstrap work instead of falling back to broad or manual-only validation.

## Top priorities / invariants

- Reliability, robustness, and stability first.
- Design for bad networks. Assume packet loss, reconnects, slow uploads, and intermittent failure, especially for guests on poor connections.
- Performance first. Support older hardware and low-end Android phones.
- Protect the recording path over convenience features.
- Keep the live call path, local capture path, and upload path loosely coupled. Failure in one path must not silently corrupt the others.
- Prefer boring, observable systems. Critical paths need logs, reproducible tests, or other fast feedback loops.
- Treat reality-like local end-to-end coverage as part of the product, not test polish. For join/session/recording/upload/reconnect work, prefer a dev-machine harness that runs a real multi-user session against the real local stack over mocks or remote-only manual testing.
- Changes to session-critical flows are not done with unit tests alone; maintain a scriptable local multi-participant smoke path and extend it for failures that matter (disconnects, packet loss, stalled uploads, resume/retry).
