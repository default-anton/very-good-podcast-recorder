# issue 002d: prove the local three-browser join loop

Related docs:

- `docs/testing.md`
- `docs/local-stack.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`

## goal

Prove that one host plus two guests can join the same real local session from 3 browsers with stable seat identities and explicit harness output.

## why now

This is the first product-shaped demo for the join path.
Once the stack, claim contract, and browser join flow exist, we need one reality-based proof instead of intuition.

This is the fourth child slice of `docs/issues/002-ship-the-local-session-join-loop.md`.

## scope

- add `e2e/scenarios/join-happy-path.spec.ts`
- launch 3 headless Chromium browsers with deterministic fake media
- join the seeded local session as:
  - one host seat
  - two guest seats
- verify all 3 browsers join the same real LiveKit room
- verify each browser is associated with the expected `participant_seat_id`
- verify the explicit `participant_seat_id -> LiveKit identity` mapping in logs or summary JSON
- emit a machine-readable harness summary under `.vgpr/local/e2e/`
- preserve service and browser logs on failure
- include one explicit duplicate-ownership probe that proves a second browser cannot silently become the active owner of an already-active seat

## acceptance criteria

- `pnpm exec playwright test e2e/scenarios/join-happy-path.spec.ts` runs headless against the real local stack
- one host and two guests join the same real LiveKit room from 3 browsers
- each joined browser is associated with the expected `participant_seat_id`
- the harness summary JSON includes per-browser seat, role, and LiveKit identity data
- the duplicate-ownership probe fails explicitly and is reflected in logs or summary output
- failure artifacts are preserved under `.vgpr/local/e2e/` and `.vgpr/local/logs/`

## feedback loop

The proof must stay text-first and reproducible:

- `vgpr setup local`
- `mise exec -- pnpm exec playwright test e2e/scenarios/join-happy-path.spec.ts`
- harness summary JSON under `.vgpr/local/e2e/`
- structured logs with `session_id`, `participant_seat_id`, `role`, and LiveKit identity fields

## out of scope

- recording start / stop
- local track recording
- chunk upload
- reconnect scenarios
- takeover completion flow
- upload failure scenarios
