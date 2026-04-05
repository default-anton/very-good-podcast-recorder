# engineering feedback loop

## recommendation

The engineering baseline is not optional setup work. It is the mechanism that lets us ship the next implementation slice without slowing down or guessing.

## goals

Optimize for:

- fast local feedback
- deterministic checks
- text-first signals an agent can inspect
- safe defaults before the next real feature lands

## local loop [done]

Every developer should have a small, boring default loop:

1. format changed files
2. lint changed files
3. run relevant tests for changed code
4. inspect failing output before guessing

Use:

- **gofmt** for Go formatting
- **go vet** and **go test** for cheap Go semantic checks
- **Oxfmt** for frontend formatting
- **Oxlint** for frontend linting
- **tsgo** for frontend type checks
- **Vitest** for lightweight frontend tests
- **prek** for pre-commit hooks

## hook policy [done]

Use pre-commit hooks for checks that are:

- fast
- deterministic
- high-signal
- scoped to staged or changed files

Default pre-commit hooks:

- formatter on staged files
- linter on staged files
- cheap semantic checks on staged-language changes (`go vet`, `go test`, `tsgo`, `vitest`)
- merge-conflict marker check

Do **not** put slow or flaky work in pre-commit.

## ci policy [done]

CI runs the broader gates:

- full unit test suite
- type checks
- integration or e2e checks as they arrive
- dependency and vulnerability scanning

Vulnerability scanning belongs in CI first, not the commit hook. It matters, but it must not make the inner loop miserable.

## logging policy

The repo is currently harness-only, so there are no backend or CLI log emitters to mark done.

Current requirements:

- scripts and tests fail with text-first, actionable output
- any future harness summary should be machine-readable JSON
- when backend or CLI code returns, keep stdout/stderr separation and use stable IDs like `session_id`, `participant_id`, `track_id`, and `chunk_id`
- never silently swallow context that would block reproduction

If a flow matters, it needs output we can grep and machine-parse.

## engineering baseline

**Goal:** keep the repo fast and trustworthy while application implementation is absent.

**Must ship:**

- bootstrap instructions so a contributor can install deps and run the default checks quickly
- `scripts/format`, `scripts/lint`, `scripts/typecheck`, `scripts/test`, and `scripts/check`
- a small Go harness package so `go vet` and `go test` stay live
- frontend tooling config for `web/control/` and `web/session/`
- Vitest coverage for tooling and contract-focused guardrails around shared runtime/config surfaces and module seams
- Playwright config plus `e2e/` placeholders for the future multi-participant harness
- pre-commit hooks via `prek`
- CI or scripted audit coverage for formatting, lint, type checks, tests, and vulnerability scanning

**Done when:**

- a contributor can clone the repo, install dependencies, and discover the default checks quickly
- the harness catches accidental drift in shared runtime/config contracts and key module ownership seams
- staged Go and frontend changes are formatted and cheap semantic checks run before commit
- CI blocks merges on broken formatting, lint, tests, or critical dependency issues

**Non-goals:**

- perfect rule coverage before code exists
- heavyweight pre-push or pre-commit pipelines
- enterprise compliance tooling

## default command shape [done]

Keep the public interface small. Prefer commands like:

- `format`
- `lint`
- `typecheck`
- `test`
- `test:unit`
- `test:e2e`
- `check`   → local quality gate

`scripts/` or package scripts should expose these consistently. Humans and agents should not need to remember tool-specific incantations.

## recommended implementation order

1. engineering baseline
2. session join loop
3. single-participant recording path
4. multi-participant happy path
5. reconnect during recording
6. upload stall and resume
7. remote alpha
