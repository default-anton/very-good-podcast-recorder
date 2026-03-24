# issue 001: bootstrap the repo and engineering baseline

Related docs:

- `docs/feedback-loop.md`
- `docs/repo-layout.md`
- `docs/local-stack.md`
- `docs/operator-cli.md`
- `docs/version-pins.md`

## goal

Turn the repo from docs-only into a runnable skeleton with one boring default dev loop.

## why now

Everything after this gets slower and less trustworthy without a stable inner loop.
We need the repo shape, commands, hooks, and CI before we pile on product code.

This is the first slice from `docs/feedback-loop.md`.

## scope

- create the top-level layout from `docs/repo-layout.md`
- initialize the Go module and thin entrypoints for:
  - `cmd/controlplane/`
  - `cmd/sessionrunner/`
  - `cmd/sessiond/`
  - `cmd/vgpr/`
- initialize `web/control/` and `web/session/` with TypeScript, React, Vite, and `tsgo`
- add stable repo commands for `format`, `lint`, `typecheck`, `test`, and `check`
- configure `oxfmt`, `oxlint`, `tsgo`, and `prek`
- add a minimal CI workflow that runs formatting, lint, type checks, tests, and dependency / vulnerability scanning
- add structured logging conventions for Go binaries, the CLI, and the future harness
- add bootstrap docs so a fresh contributor can install deps and discover the default checks quickly

## acceptance criteria

- the repo contains the baseline directories from `docs/repo-layout.md`
- `go test ./...` passes with the initial Go skeleton
- `pnpm exec tsgo --noEmit -p web/control/tsconfig.json` passes
- `pnpm exec tsgo --noEmit -p web/session/tsconfig.json` passes
- changed frontend files can be checked with `pnpm exec oxlint ...` and `pnpm exec oxfmt --check ...`
- one stable local quality command exists and runs the default gate
- pre-commit hooks auto-format and lint staged frontend files
- CI blocks merges on broken format, lint, type checks, tests, or critical dependency issues
- `go run ./cmd/vgpr --help` shows the top-level CLI shape from `docs/operator-cli.md`, even if most commands are still stubs

## feedback loop

Text-first only. No manual browser work.

Use these as the proof:

- `go test ./...`
- `pnpm exec tsgo --noEmit -p web/control/tsconfig.json`
- `pnpm exec tsgo --noEmit -p web/session/tsconfig.json`
- `pnpm exec oxlint ...`
- `pnpm exec oxfmt --check ...`
- the CI run for the same checks

## out of scope

- real session creation
- LiveKit integration
- seat claim / join flow
- recording start / stop
- chunk upload
- remote provisioning
