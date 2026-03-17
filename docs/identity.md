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

## control-plane schema

```sql
-- sessions: one recording session in the persistent control plane.
create table sessions (
  id text primary key,                  -- Public session id shared with the session server and artifact paths.
  title text not null,                  -- Host-facing label only. Not auth-sensitive.
  state text not null check (state in ('draft', 'ready', 'active', 'ended')),
                                        -- draft=editable; ready=links/roster usable; active=server exists or live; ended=history only.
  host_join_key_hash blob not null,     -- Hash of the shared host link secret. Never store the raw secret.
  guest_join_key_hash blob not null,    -- Hash of the shared guest link secret.
  roster_version integer not null default 1,
                                        -- Bump when roster or join keys change so the session server can resync.
  created_at text not null,             -- Audit trail and default ordering.
  updated_at text not null              -- Detects recent edits/stale views.
);

-- participants: reusable people records created once and reused across sessions.
create table participants (
  id text primary key,                  -- Stable control-plane participant id. Reused across many sessions.
  display_name text not null,           -- Default name copied into a session participant row.
  created_at text not null,             -- Audit trail and deterministic ordering fallback.
  updated_at text not null              -- Tracks edits to the reusable participant record.
);

-- idx_participants_display_name: supports control-plane search/pickers by name.
create index idx_participants_display_name on participants(display_name);

-- session_participants: one seat in one session. This row is the durable runtime identity.
create table session_participants (
  id text primary key,                  -- Stable runtime seat id for this session only. Used by reconnects, uploads, and manifests.
  session_id text not null references sessions(id) on delete cascade,
                                        -- Owning session. Cascade removes the roster with the session.
  participant_id text not null references participants(id),
                                        -- Reusable control-plane participant behind this session seat.
  role text not null check (role in ('host', 'guest')),
                                        -- host=may control recording; guest=may join but not control recording.
  display_name text not null,           -- Session-local name snapshot so old sessions stay stable after later renames.
  created_at text not null,             -- When this seat was added to the session.
  updated_at text not null              -- Tracks seat-local edits, e.g. a session-specific name tweak.
);

-- idx_session_participants_session_role_name: fast join-picker reads for one session and one role.
create index idx_session_participants_session_role_name
  on session_participants(session_id, role, display_name);

-- idx_session_participants_session_participant_unique: prevents adding the same reusable participant twice to one session.
create unique index idx_session_participants_session_participant_unique
  on session_participants(session_id, participant_id);

-- idx_session_participants_session_name_unique: forces unambiguous display names within one session.
create unique index idx_session_participants_session_name_unique
  on session_participants(session_id, display_name);

-- session_servers: current temporary server assigned to a session.
create table session_servers (
  id text primary key,                  -- Control-plane id for the provisioned server instance.
  session_id text not null unique references sessions(id) on delete cascade,
                                        -- One active temporary server per session in v1.
  base_url text not null,               -- Public base URL used by browsers and control-plane links.
  region text,                          -- Placement/debug metadata only.
  state text not null check (state in ('creating', 'ready', 'stopping', 'stopped', 'failed')),
                                        -- creating=provisioning; ready=joinable; stopping=teardown requested; stopped=gone; failed=broken.
  synced_roster_version integer,        -- Last roster_version confirmed on that server; null before first sync.
  created_at text not null,             -- Provisioning audit trail.
  updated_at text not null              -- Tracks state changes and sync progress.
);
```

## session-server schema

```sql
-- session_snapshot: auth + roster version for the one session hosted by this temporary server.
create table session_snapshot (
  session_id text primary key,          -- The single control-plane session this server is hosting.
  host_join_key_hash blob not null,     -- Hash of the shared host join secret copied from the control plane.
  guest_join_key_hash blob not null,    -- Hash of the shared guest join secret copied from the control plane.
  roster_version integer not null,      -- Version of the auth/roster snapshot currently loaded here.
  recording_state text not null check (recording_state in ('waiting', 'recording', 'stopped')),
                                        -- waiting=room exists; recording=host started; stopped=recording ended.
  updated_at text not null              -- When this server last applied a control-plane snapshot.
);

-- participant_seats: local roster snapshot so join/rejoin does not depend on the control plane.
create table participant_seats (
  id text primary key,                  -- Same id as session_participants.id from the control plane. Main runtime identity key.
  session_id text not null,             -- Redundant but useful for sanity checks and local queries.
  role text not null check (role in ('host', 'guest')),
                                        -- Must match control-plane permissions exactly.
  display_name text not null,           -- Name shown in the local picker and logs.
  last_synced_at text not null          -- When this row was last refreshed from the control plane.
);

-- idx_participant_seats_session_role_name: fast local picker queries for one role.
create index idx_participant_seats_session_role_name
  on participant_seats(session_id, role, display_name);

-- seat_claims: ephemeral ownership state for refresh, reconnect, and explicit takeovers.
create table seat_claims (
  participant_seat_id text primary key references participant_seats(id) on delete cascade,
                                        -- One claim row per seat. Delete it automatically if the seat leaves the roster.
  claim_secret_hash blob,               -- Hash of the current browser claim secret. Null means never claimed.
  state text not null check (state in ('unclaimed', 'active', 'disconnected')),
                                        -- unclaimed=nobody yet; active=one browser owns it; disconnected=previous owner dropped.
  current_connection_id text,           -- Runtime connection handle so replacement joins can evict the old connection cleanly.
  last_seen_at text,                    -- Heartbeat/disconnect time for UX and cleanup.
  claim_version integer not null default 0,
                                        -- Bump on each claim/takeover so stale browsers cannot silently retake the seat.
  updated_at text not null              -- Last mutation time for this claim row.
);

-- idx_seat_claims_state_last_seen: supports cleanup and "rejoin available" UI.
create index idx_seat_claims_state_last_seen
  on seat_claims(state, last_seen_at);
```

`seat_claims` is ephemeral session-server state. Do not sync it back to the control plane.

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
