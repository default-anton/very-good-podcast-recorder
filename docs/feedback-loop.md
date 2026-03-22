# engineering feedback loop

## recommendation

The engineering baseline is not optional setup work. It is the mechanism that lets us ship the first product slices without slowing down or guessing.

## goals

Optimize for:

- fast local feedback
- deterministic checks
- text-first signals an agent can inspect
- safe defaults before the first real feature lands

## local loop

Every developer should have a small, boring default loop:

1. format changed files
2. lint changed files
3. run relevant tests for changed code
4. inspect structured logs when something fails

For frontend, use:

- **Oxfmt** for formatting
- **Oxlint** for linting
- **prek** for pre-commit hooks

## hook policy

Use pre-commit hooks for checks that are:

- fast
- deterministic
- high-signal
- scoped to staged or changed files

Default pre-commit hooks:

- formatter on staged files
- linter on staged files
- lightweight tests only when they can be targeted cheaply

Do **not** put slow or flaky work in pre-commit.

## ci policy

CI runs the broader gates:

- full unit test suite
- type checks
- integration or e2e checks as they arrive
- dependency and vulnerability scanning

Vulnerability scanning belongs in CI first, not the commit hook. It matters, but it must not make the inner loop miserable.

## logging policy

Structured logging starts in the engineering baseline.

Requirements:

- JSON logs for backend services
- stable fields for `session_id`, `participant_id`, `track_id`, `chunk_id`, `role`
- explicit error context, never silent failure
- harness summaries emitted as JSON

If a flow matters, it needs logs we can grep and machine-parse.

## engineering baseline

**Goal:** create the minimum quality system that keeps the repo fast and trustworthy.

**Must ship:**

- initial repo skeleton matching `docs/repo-layout.md`
- initial setup for the main surfaces: `web/control/`, `web/session/`, `cmd/controlplane/`, `cmd/sessionrunner/`, `cmd/sessiond/`, `cmd/vgpr/`, `e2e/`, `deploy/`, `scripts/`
- formatter configured and runnable from one stable command
- linter configured and runnable from one stable command
- pre-commit hooks via `prek`
- test command shape defined, even if the first suite is small
- CI runs formatter, linter, tests, and vulnerability scan
- structured logging conventions documented for backend, CLI, and harness code
- bootstrap instructions so a new contributor can install deps and run the default checks quickly

**Done when:**

- a contributor can clone the repo, install dependencies, and discover the default checks quickly
- the repo already has the expected top-level structure for backend, frontend, CLI, harness, deploy, and scripts work
- staged frontend files are auto-formatted and linted before commit
- CI blocks merges on broken formatting, lint, tests, or critical dependency issues
- new code has an obvious place to put machine-readable logs

**Non-goals:**

- perfect rule coverage before code exists
- heavyweight pre-push or pre-commit pipelines
- enterprise compliance tooling

## default command shape

Keep the public interface small. Prefer commands like:

- `format`
- `lint`
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
