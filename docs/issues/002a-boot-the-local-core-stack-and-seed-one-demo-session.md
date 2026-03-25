# issue 002a: boot the local core stack and seed one demo session

Related docs:

- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/operator-cli.md`
- `docs/testing.md`

## goal

Make `vgpr setup local` boot the `core` profile and expose one deterministic local session for the rest of the join loop.

## why now

Nothing else in the join path is trustworthy until the local runtime is boring.
We need one supported bring-up path, one known session, and one place to collect logs and artifacts.

This is the first child slice of `docs/issues/002-ship-the-local-session-join-loop.md`.

## scope

- implement `vgpr setup local` for the default `core` profile from `docs/local-stack.md`
- boot the minimum local services for the join path:
  - control plane
  - sessiond
  - LiveKit
  - `web/control`
  - `web/session`
- create the expected local directories under `.vgpr/local/` for:
  - `config/`
  - `state/`
  - `logs/`
  - `artifacts/`
  - `e2e/`
- generate the minimum runtime config needed for the local stack
- seed one deterministic local session with:
  - one host seat
  - two guest seats
  - fixed display names
  - fixed local join links
- print the local app URL(s) and seeded join links at the end of setup
- make rerunning `vgpr setup local` for the same deployment idempotent when possible

## acceptance criteria

- `vgpr setup local` boots the default `core` profile successfully
- the local stack is reachable on the expected default ports from `docs/local-stack.md`
- the command prints the control app URL, session app URL, and seeded host/guest join links
- the seeded session is deterministic across runs unless the local deployment is explicitly reset
- `.vgpr/local/config/`, `.vgpr/local/state/`, `.vgpr/local/logs/`, `.vgpr/local/artifacts/`, and `.vgpr/local/e2e/` exist after setup
- service logs are preserved under `.vgpr/local/logs/`
- rerunning setup does not silently create duplicate local deployments or duplicate seeded sessions

## feedback loop

Use text-first proof only:

- `vgpr setup local --no-open`
- `vgpr doctor`
- service readiness or health responses for the local stack
- printed URLs and join links
- structured logs under `.vgpr/local/logs/`

## out of scope

- seat claim endpoints
- LiveKit token minting
- session app join UI
- Playwright browser orchestration
- real control-plane session creation UX
