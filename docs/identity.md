# v1 identity, join auth, and rejoin

## recommendation

Use **2 bearer invite links per session**:

- **host link**: shared by all host seats
- **guest link**: shared by all guest seats

This is **identification**, not strong auth. Possession of a link is the credential. No accounts, passwords, email, or SMS.

The durable runtime identity is the **session seat**. Every seat gets a stable ID when added to the session, stored in `session_participants.id`. Reconnects, uploads, manifests, and final downloads key off that ID. Do not recycle it within a session.

The control plane also keeps reusable participants in `participants.id`. The session server does **not** use that global ID as the runtime identity.

The session server only knows 2 permission classes: `host` and `guest`.

## model

The control plane keeps two layers:

- **participants**: reusable people records created once and reused across sessions
- **session participants**: one row per participant-in-this-session, with its own stable runtime ID

Per session:

- 1..n host seats
- 0..n guest seats

Each session participant has:

- `id`
- `participant_id`
- `role`: `host | guest`
- `display_name`

Do **not** allow freeform names at join time. Users pick a pre-created seat.

All hosts are equal inside the session server. There is no separate `cohost` or `main host` auth class there.

## join and rejoin

Invite links:

- `/join/{session_id}/host?k=...`
- `/join/{session_id}/guest?k=...`

Rules:

- store only **hashed** join keys
- treat the raw link as a bearer secret
- let the host regenerate either link if it leaks
- never log raw join keys

Join UI:

- host link shows host seats
- guest link shows guest seats
- if this browser already owns a seat for that link, auto-rejoin it
- sort by `display_name`
- force name disambiguation in the control plane before the session starts

Seat states:

- `available`
- `you`
- `in use`
- `rejoin available`

After seat selection, mint a per-seat **claim secret** and return it in a secure cookie. Store only its hash.

Identity layers:

1. **join key**: access to a role group for a session
2. **session participant id**: durable seat identity for media and uploads
3. **claim_secret**: proof this browser currently owns that seat

Reconnect semantics:

- **transport reconnect**: temporary network loss; keep the same seat and session participant id
- **browser rejoin**: refresh/crash/restart; if the cookie still has the `claim_secret`, auto-reclaim the same seat
- **new-device recovery**: user opens the shared link elsewhere, picks the same seat, and if the old browser is gone or disconnected, the server rotates to a new `claim_secret`

Duplicate handling:

- one active device per seat
- same `claim_secret` replaces the old connection
- different `claim_secret` on an active seat is rejected by default with **Take over seat** as an explicit action
- takeover rotates the `claim_secret` and invalidates the old device

Permissions:

- all `host` seats are equal
- all `guest` seats are equal
- `host` can control recording
- `guest` cannot

## schema

The v1 database schema now lives in `docs/database-schema.md`.

Keep this doc focused on identity, join, rejoin, takeover, and permission semantics. Keep table definitions and indexes in the schema doc.

## control plane → session server sync

For the single `session_id` hosted by a given temporary server, sync the **complete current auth + roster snapshot for that one session** when the server is created, then whenever the roster or join keys change.

Sync:

- `session_id`
- `roster_version`
- hashed host and guest join keys
- participant seats: `id`, `role`, `display_name`
- role permissions: `host` can control recording, `guest` cannot

The session server does **not** need the global `participants` table. It only needs the session-local seat snapshot.

## non-goals for v1

- personal accounts
- passwords, email, SMS, magic links
- separate identity classes for `host` and `cohost`
- strong identity proof beyond possession of a role link
- multiple active devices on one seat
