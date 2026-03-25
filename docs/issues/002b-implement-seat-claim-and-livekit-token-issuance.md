# issue 002b: implement seat claim and LiveKit token issuance

Related docs:

- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/database-schema.md`
- `docs/testing.md`

## goal

Implement the real seat-claim contract for the seeded local session and mint LiveKit tokens only after a valid claim.

## why now

This is the core product boundary for the join loop.
If seat ownership is ambiguous, everything after it is fake.

This is the second child slice of `docs/issues/002-ship-the-local-session-join-loop.md`.

## scope

- persist the seeded session roster snapshot needed by `sessiond`
- implement role-link validation for the seeded local session
- implement these endpoints from `docs/seat-claim-protocol.md`:
  - `POST /api/v1/join/seat-picker`
  - `POST /api/v1/seat-claims/claim`
  - `POST /api/v1/seat-claims/reclaim`
  - `POST /api/v1/seat-claims/heartbeat`
- issue and validate the secure claim cookie
- mint a LiveKit token only after successful claim or reclaim
- make LiveKit participant identity equal the durable `participant_seat_id`
- make the LiveKit room map to the seeded `session_id`
- persist and log the explicit `participant_seat_id -> LiveKit identity` mapping
- reject ambiguous duplicate active ownership with an explicit `409`
- reject stale or invalid claim credentials with an explicit `401`

## acceptance criteria

- a valid role link can list only seats for its role
- claiming an `available` seat succeeds and returns a LiveKit token for the expected seat identity
- reclaiming an already-owned seat on the same browser succeeds without rotating ownership silently
- a second browser cannot silently claim an already-active seat
- claim-authenticated endpoints reject stale or invalid claim credentials
- logs or inspectable state show `session_id`, `participant_seat_id`, `role`, `claim_version`, and LiveKit identity fields
- the seat claim contract is covered by focused backend tests

## feedback loop

Use fast, deterministic proof before UI work:

- `mise exec -- go test ./internal/sessions/...`
- focused request/response tests for seat picker, claim, reclaim, heartbeat, and duplicate-claim rejection
- local HTTP smoke checks against the seeded session
- structured logs showing seat identity mapping

## out of scope

- takeover
- reconnect on a new browser
- recording endpoints
- browser room UX beyond consuming the returned contract
