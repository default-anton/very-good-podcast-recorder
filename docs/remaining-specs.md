# remaining specs

Related docs:

- `docs/README.md`
- `docs/artifact-manifest.md`
- `docs/feedback-loop.md`
- `docs/testing.md`

## recommendation

Keep the remaining contracts thin.

Everything already specified should stay in its existing source-of-truth doc from `docs/README.md`. Do **not** restate those contracts here.

The remaining missing docs are:

1. local dev/runtime contract
2. minimal v1 UX contract
3. basic non-functional targets

Tables and example JSON beat prose.

Artifact manifest format is now owned by `docs/artifact-manifest.md`.

## 1. local dev/runtime contract

Need one doc that locks down:

- one-command local boot flow
- required tool versions
- env vars/config files
- port map
- which services run locally
- where logs and artifacts land

Why this still matters:

- parallel development stays slow until boot/run conventions are boring
- CI and the local harness need the same runtime assumptions

## 2. minimal v1 UX contract

Need one doc that locks down the minimum user-visible workflow for:

- host session creation and sharing
- guest device/setup/join flow
- host recording controls and participant state
- reconnect, recovery, and error states
- final artifact download flow

Why this still matters:

- backend and frontend work will drift without one shared product contract
- the testing harness needs known user-visible checkpoints

## 3. basic non-functional targets

Need one doc that locks down a small set of targets for:

- supported browsers for v1
- max participants for v1
- expected recording duration
- reconnect expectations
- acceptable upload lag/backlog
- temporary-server disk assumptions
- performance budgets that matter for low-end hardware

Why this still matters:

- “performance first” is not actionable until the budgets are written down
- operators need concrete resource expectations

## what not to define yet

Do not burn time on:

- multi-cloud provisioning
- storage integrations
- polished post-production workflows
- broad cross-browser support before Chromium is stable
- full admin/permission systems
- server-side transcoding in the recording-critical path

## practical call

Keep shipping against the current contracts.

When one of the three missing areas above starts blocking implementation or tests, write **one** new owning doc for it and add it to `docs/README.md`.
