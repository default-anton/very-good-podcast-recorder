# issue 002: ship the local session join loop

Related docs:

- `docs/architecture.md`
- `docs/local-stack.md`
- `docs/operator-cli.md`
- `docs/ux-contract.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/testing.md`

## goal

Boot the real local stack and prove that one host plus two guests can join the same session with stable seat identities.

## why now

This is the first product-shaped demo.
It proves the control plane, session app, seat identity model, and LiveKit boundary all line up on a real dev machine.
It also gives us the first reality-based harness instead of guessing from unit tests.

This is the second slice from `docs/feedback-loop.md`.

## scope

- make `vgpr setup local` boot the `core` profile from `docs/local-stack.md`
- stand up the minimum local services for the join path:
  - control plane
  - sessiond
  - LiveKit
  - `web/control`
  - `web/session`
- add the minimum session bootstrap path needed for development and the harness:
  - either a tiny control-plane session-create flow
  - or a deterministic seeded local session with one host seat and two guest seats
- implement role-link validation, seat picker, seat claim, and room join in the session app
- define and persist the `seat_id -> LiveKit identity` mapping from `docs/identity.md`
- reject ambiguous duplicate active seat ownership; if takeover is not implemented yet, fail explicitly instead of silently allowing two owners
- add the first Playwright scenario that launches three browsers with fake media and verifies the join loop
- emit a machine-readable harness summary and structured logs with seat identity data

## acceptance criteria

- `vgpr setup local` brings up the local stack and prints the local app URL(s)
- the local stack is reachable with the default `core` profile from `docs/local-stack.md`
- one host seat and two guest seats can join the same real LiveKit room from three browsers
- each joined browser is associated with the expected `participant_seat_id`
- the `seat_id -> LiveKit identity` mapping is explicit in logs or the harness summary JSON
- a second browser cannot silently become an active owner for the same seat
- `e2e/scenarios/` contains a join scenario that runs headless with deterministic fake media
- the scenario emits a summary JSON artifact under `.vgpr/local/e2e/`

## feedback loop

The proof must be text-first and reproducible:

- `vgpr setup local`
- `pnpm exec playwright test e2e/scenarios/join-happy-path.spec.ts`
- harness summary JSON with per-browser seat and identity data
- structured logs for control plane, session app, and sessiond with `session_id`, `participant_seat_id`, `role`, and LiveKit identity fields

## out of scope

- polished host session setup UX
- recording start / stop
- local track recording
- chunk upload
- reconnect, takeover completion flow, or upload failure scenarios
