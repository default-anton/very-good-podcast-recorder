# remaining specs

Related docs:

- `docs/architecture.md`
- `docs/identity.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/testing.md`
- `docs/milestones.md`

## recommendation

Do not split milestone 1+ feature work too broadly until the remaining contracts below are written down.

The recording control contract now exists in `docs/recording-control-protocol.md`.

The recording/upload contract now exists in `docs/recording-upload-protocol.md`.

The next thin specs to lock down are:

1. session state machine
2. artifact manifest format
3. local dev/runtime contract
4. minimal v1 UX contract
5. basic non-functional targets

Keep them short. Tables and example JSON beat prose.

## 1. session state machine

Define the allowed states and transitions for:

- session lifecycle
- seat claim lifecycle
- recording lifecycle
- upload/draining lifecycle
- terminal failure states

This is the contract that keeps frontend, backend, and harness work aligned.

## 2. artifact manifest format

The docs already say "session folder + manifest." Now lock the shape down.

Define:

- session directory layout
- session manifest JSON schema
- per-track manifest JSON schema
- status values for complete/partial/missing/failed
- file naming conventions

Without this, the harness cannot assert correctness cleanly.

## 3. local dev/runtime contract

For milestone 0 and early milestone 1 work, define the boring runtime details up front:

- one-command local boot flow
- required tool versions
- env vars/config files
- port map
- which services run locally
- where logs and artifacts land

This is what makes parallel development actually move.

## 4. minimal v1 UX contract

Do not overdesign. Do define the minimum workflow.

Host flow:

- create session
- share URL
- start recording
- stop recording
- download artifact

Guest flow:

- open URL
- grant permissions
- join
- recover from reconnect

Also define:

- host-visible participant and recording state
- guest-visible error states
- minimum device/setup UI

## 5. basic non-functional targets

Set a few concrete targets so "performance first" means something:

- target browsers for v1
- max participants for v1
- expected recording duration
- minimum reconnect behavior
- acceptable upload lag/backlog
- temp-server disk assumptions

## what not to define yet

Do not burn time on:

- multi-cloud provisioning
- storage integrations
- polished post-production workflows
- broad cross-browser support before Chromium is stable
- full admin/permission systems
- server-side transcoding in the recording-critical path

## practical call

You can keep coding milestone 0 immediately.

Before assigning milestone 1+ work in parallel, write the thin specs above. Otherwise the team will drift on:

- frontend/backend contracts
- harness assertions
- reconnect semantics
- artifact format
- what "done" means
