# epic 04a — code-organization guardrails

## Recommended PR slices

split into 2–3 PRs:
- shared session/runtime contract extraction
- session app state split by seam
- sessiond persistence/artifact split + guardrail refresh

Related docs:

- `docs/architecture.md`
- `docs/repo-layout.md`
- `docs/local-stack.md`
- `docs/testing.md`
- `docs/epics/04-local-runtime.md`
- `docs/epics/05-happy-path-harness.md`

## goal

Keep milestone-1 velocity without baking in avoidable maintenance debt.

## scope

Tight cleanup only. No repo split. No generic abstraction pass.

Do the minimum structural work needed before more runtime and harness complexity lands:

- extract shared control/session contract types and local runtime topology data out of UI-owned modules
- stop `web/control/src/api/**` from depending on `web/control/src/app/lib/**` for core API/domain ownership
- split `web/session/src/app/lib/sessionState.ts` by seam so bootstrap shaping, reducer actions, demo presets, and derived presentation logic do not keep accreting in one file
- split the next meaningful `internal/sessiond` touch so upload persistence and manifest generation are not forced to keep growing as single large files
- refresh repo guardrail tests so they assert the current landing zones and the still-deferred trees truthfully

## non-goals

- new packages or a JS workspace split
- `pkg/` in Go
- speculative provider abstractions
- a broad rename/move-only refactor with no product payoff
- perfect file-size purity before the next feature can land

## acceptance criteria

- one neutral module owns shared local session/runtime contracts used across control API, control app, and session app
- local runtime topology literals are not duplicated across multiple app-owned modules
- `web/control/src/api/**` no longer depends on `web/control/src/app/lib/**` for primary contract ownership
- `web/session/src/app/lib/sessionState.ts` is split into smaller files aligned to real seams
- the next touched oversized `internal/sessiond` file is split instead of extended past the current shape
- repo guardrail tests describe the actual current landing zones and deferred trees

## feedback loop

Prove this with focused checks, not a giant regression run:

```bash
mise exec -- pnpm exec vitest run web/tests/tooling-harness.spec.ts
mise exec -- pnpm exec vitest run web/tests/control-*.spec.ts web/tests/session-state.spec.ts
mise exec -- pnpm exec tsgo --noEmit -p web/control/tsconfig.json
mise exec -- pnpm exec tsgo --noEmit -p web/session/tsconfig.json
mise exec -- go test ./internal/sessiond ./cmd/sessiond
```

If a split weakens confidence, add or tighten a contract test before moving more code.

## notes

This is a guardrail epic, not a rewrite epic.

The point is to stop two specific failure modes before they spread:

1. UI modules accidentally becoming the source of truth for API/domain contracts
2. a few already-large files turning into permanent kitchen sinks

Do this in the same pragmatic style as the rest of the repo: small reviewable moves, each with proof.
