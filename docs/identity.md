# v1 identity, join auth, and rejoin

Related docs:

- `docs/README.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/database-schema.md`

## recommendation

Use **2 bearer invite links per session**:

- **host link**: shared by all host seats
- **guest link**: shared by all guest seats

This is **identification**, not strong auth. Possession of a link is the credential. No accounts, passwords, email, or SMS.

The durable runtime identity is the **session seat**. Reconnects, uploads, manifests, and final downloads key off that seat id. Do not recycle it within a session.

Do **not** add a reusable participant directory to alpha. It is extra product surface without enough value.

## identity model

For alpha, the control plane keeps one layer only:

- **session seats**: one seat in one session, with its own stable runtime id

Per session:

- `1..n` host seats
- `0..n` guest seats

Each session seat has:

- `id`
- `role`: `host | guest`
- `display_name`

Rules:

- users pick a pre-created seat; no freeform join-time names
- display names must be unambiguous before the session starts
- all hosts are equal inside the session server; there is no separate `cohost` class in v1

## credentials and ownership

There are 3 credentials in play:

1. **join key**: bearer access to one role group in one session
2. **session seat id**: durable runtime identity
3. **claim secret**: proof that one browser currently owns one seat

Ownership rules:

- one active browser per seat
- same-browser refresh/rejoin keeps the same seat id
- new-device recovery keeps the same seat id if the seat is recovered or taken over
- takeover rotates the claim secret and invalidates the old browser immediately

`docs/seat-claim-protocol.md` owns the claim state machine, liveness rules, and endpoint contract.
This doc owns the identity meaning: the seat id stays stable across reconnect, recovery, and takeover.

## join links

Invite link shape:

- `/join/{session_id}/host?k=...`
- `/join/{session_id}/guest?k=...`

Rules:

- store only **hashed** join keys
- treat the raw link as a bearer secret
- let the host regenerate either link if it leaks before the session becomes `active`
- never log raw join keys

## permissions

The session server only knows 2 permission classes:

- `host`
- `guest`

Rules:

- all `host` seats are equal
- all `guest` seats are equal
- `host` can control recording
- `guest` cannot

## LiveKit identity and token mapping

LiveKit room identity must mirror the durable session seat, not invent a second runtime identity.

Rules:

- LiveKit **participant identity** = session seat id
- LiveKit **room** = the single temporary session room for that `session_id`
- LiveKit **display name** = the seat `display_name`
- LiveKit **metadata** may include `session_id`, `role`, and seat id, but the seat id remains the canonical identifier

Token minting rules:

- mint a LiveKit token only after the browser proves join-link access and successfully claims a seat
- scope the token to one session room
- keep token issuance tied to the current seat claim
- do not rely on LiveKit alone to decide seat ownership or recording authority

## control plane → session server sync

For the single `session_id` hosted by a given temporary server, sync the complete current auth + roster snapshot for that one session when the server is created.

In v1, keep the active session's auth model static once the control-plane session becomes `active` per `docs/session-lifecycle.md`, but keep **authentication itself** live for the whole hosted run.

Sync:

- `session_id`
- `roster_version`
- hashed host and guest join keys
- session seats: `id`, `role`, `display_name`
- role permissions: `host` can control recording, `guest` cannot

The session server does **not** need a global participant directory. It only needs the session-local seat snapshot.

## schema ownership

- table and index definitions live in `docs/database-schema.md`
- seat-claim transitions and errors live in `docs/seat-claim-protocol.md`
- recording and upload auth usage lives in `docs/recording-control-protocol.md` and `docs/recording-upload-protocol.md`

## non-goals for v1

- reusable participant records across sessions
- personal accounts
- passwords, email, SMS, magic links
- separate identity classes for `host` and `cohost`
- strong identity proof beyond possession of a role link
- multiple active devices on one seat
