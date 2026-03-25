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

Land the local session join loop as 4 reviewable slices instead of one oversized issue.

## why now

The original slice mixed local boot, session bootstrap, seat-claim auth, browser join UX, and the first multi-browser harness.
That is too much to debug at once.

We need one boring path to a real demo:

1. boot the stack
2. seed one known session
3. claim seats and mint LiveKit tokens
4. join from 3 browsers and prove identity mapping

This stays the second product slice from `docs/feedback-loop.md`, but it should ship as child issues.

## recommendation

Use a **deterministic seeded local session** for this join-loop slice.
Do **not** build the real control-plane session-create flow here.

Why:

- it still proves the real join path
- it gives the harness fixed inputs
- it avoids mixing host setup UX into the first join demo
- it leaves a cleaner seam for the recording slice in `docs/issues/003-implement-the-single-participant-recording-path.md`

## child issues

1. `docs/issues/002a-boot-the-local-core-stack-and-seed-one-demo-session.md`
2. `docs/issues/002b-implement-seat-claim-and-livekit-token-issuance.md`
3. `docs/issues/002c-ship-the-session-app-join-flow.md`
4. `docs/issues/002d-prove-the-local-three-browser-join-loop.md`

## implementation order

Ship these in order:

1. local stack boot + seeded session
2. seat claim + LiveKit token issuance
3. session app join flow
4. 3-browser Playwright harness

Do not skip ahead to the harness before the lower-level contracts are real.

## done means

This umbrella is done when all 4 child issues are done and the final proof exists:

- `vgpr setup local`
- `pnpm exec playwright test e2e/scenarios/join-happy-path.spec.ts`
- summary JSON under `.vgpr/local/e2e/`
- structured logs showing `session_id`, `participant_seat_id`, `role`, and LiveKit identity fields

## out of scope

For this umbrella, keep these out until the join loop is stable:

- real control-plane session-create UX
- recording start / stop
- local track recording
- chunk upload
- reconnect on a new browser
- active-seat takeover completion flow
- upload failure scenarios
