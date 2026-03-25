# issue 002c: ship the session app join flow

Related docs:

- `docs/ux-contract.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/testing.md`

## goal

Make the session app open a role link, claim a seat, and join the real LiveKit room for the seeded local session.

## why now

Once the backend claim contract is real, the browser should consume it with the smallest possible join UX.
We need one working browser path before adding the 3-browser harness.

This is the third child slice of `docs/issues/002-ship-the-local-session-join-loop.md`.

## scope

- parse the seeded host and guest role links in `web/session`
- validate the role link through the seat-picker API
- render the seat picker states from `docs/seat-claim-protocol.md`:
  - `available`
  - `you`
  - `in_use`
  - `rejoin_available`
- auto-reclaim the current browser's owned seat when `owned_seat_id` is present
- allow claiming an `available` seat
- fail explicitly when a seat is already active and takeover is not implemented yet
- use the returned LiveKit token to join the real room
- show the joined seat name, role, and durable seat identity in the minimal room UI
- emit browser-side signals the harness can inspect for seat id, role, and room join state

## acceptance criteria

- opening a valid seeded role link loads the correct seat picker for that role
- claiming a seat joins the real LiveKit room with the expected `participant_seat_id`
- refreshing the same browser reclaims the same seat and rejoins with the same identity
- opening an already-active seat in another browser fails explicitly instead of silently replacing the owner
- the minimal room UI exposes enough state to inspect the joined seat and role without manual guesswork
- the join flow is covered by focused browser tests or a narrow Playwright scenario

## feedback loop

Use the smallest browser proof first:

- `vgpr setup local`
- `mise exec -- pnpm exec playwright test e2e/scenarios/session-join-single-browser.spec.ts`
- inspectable browser state for `session_id`, `participant_seat_id`, `role`, and room join status
- structured backend logs for the same join

## out of scope

- polished room layout
- recording controls
- takeover UI
- reconnect on a new browser
- multi-browser orchestration assertions
