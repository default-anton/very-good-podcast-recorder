# first 3 milestones

## rule

Each milestone must be small enough to finish without a parallel planning project.

Each one ends with:

- a runnable demo
- a machine-checkable signal
- one new fact about the product, not just more code

## milestone 1 — session join loop

**Goal:** prove we can stand up the basic live session and identity model.

**Must ship:**

- local stack boots with one command
- host creates a session locally
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
- final artifact can be listed and inspected from the CLI

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

Once milestone 3 is green, the next milestones are:

1. reconnect during recording
2. upload stall and resume
3. remote alpha on one cloud target

That keeps the order right:

- basic session loop
- basic recording loop
- full happy path
- failure tolerance
- remote packaging
