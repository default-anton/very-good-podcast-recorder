# milestones

## rule

Each milestone must be small enough to finish without a parallel planning project.

Each one ends with:

- a runnable demo
- a machine-checkable signal
- one new fact about the product, not just more code

Milestone 0 exists to protect speed. Do it first.

## milestone 0 — engineering baseline

See `docs/feedback-loop.md` for the quality bar and tool choices.

**Goal:** establish the fast feedback loop before feature work starts compounding.

**Must ship:**

- initial repo structure in place, aligned with `docs/repo-layout.md`
- initial setup for `web/control/`, `web/session/`, `cmd/controlplane/`, `cmd/sessiond/`, `e2e/`, `deploy/`, and `scripts/`
- formatter + linter wired into stable local commands
- `prek` pre-commit hooks for fast changed-file checks
- initial unit-test command shape
- CI quality gate for formatting, linting, tests, and vulnerability scanning
- structured logging conventions for backend and harness code
- bootstrap docs so a contributor can install deps and run the default checks quickly

**Done when:**

- contributors get fast local feedback by default
- the repo already has the expected structure for the first backend, frontend, harness, and deploy slices
- CI blocks obvious regressions
- new code has a clear path for logs, checks, and tests

## milestone 1 — session join loop

**Goal:** prove we can stand up the basic live session and identity model.

**Must ship:**

- local stack boots with one command
- host uses the control plane to create a session and participant records locally
- host and 2 guests join via browser URLs
- all 3 participants appear in the same live room
- harness emits JSON showing join success by participant

**Done when:**

- the happy-path join scenario passes headless on a dev machine
- participant IDs and roles are explicit in logs and summary JSON

**Not yet:**

- recording
- uploads
- remote cloud provisioning

## milestone 2 — single-participant recording path

**Goal:** prove the browser can record locally and upload chunks safely.

**Must ship:**

- one participant records locally in rolling chunks
- chunks upload to `sessiond`
- upload state is persisted in a per-track manifest
- a downloadable session artifact exists on local disk
- harness verifies chunk count and manifest contents

**Done when:**

- one participant produces more than one chunk
- uploaded chunks and manifest agree
- final artifact can be listed and inspected from control-plane metadata and local manifests

**Not yet:**

- multi-participant recording
- reconnect recovery
- polished UI

## milestone 3 — multi-participant happy path

**Goal:** prove the full core workflow works before we chase failure modes.

**Must ship:**

- host + 2 guests join the same live session
- host starts and stops recording
- each participant records local chunks
- each participant uploads during the call
- final session manifest shows all expected participants and tracks
- one-command harness runs the full happy path and emits JSON

**Done when:**

- all expected tracks upload more than one chunk
- final artifact layout matches the session manifest
- the full happy path is stable enough to run repeatedly on a dev machine

**Not yet:**

- reconnect handling
- upload stall/resume
- remote alpha workflow

## what comes right after

1. reconnect during recording
2. upload stall and resume
3. remote alpha on one cloud target

That keeps the order right:

- fast feedback loop
- basic session loop
- basic recording loop
- full happy path
- failure tolerance
- remote packaging
