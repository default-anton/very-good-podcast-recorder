# v1 database schema

Related docs:

- `docs/architecture.md`
- `docs/identity.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`

## recommendation

Keep the **control-plane** and **session-server** schemas explicit and separate.

Use this doc as the schema source of truth for v1. Keep join, rejoin, takeover, and role semantics in `docs/identity.md`.

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

Keep the session-server schema focused on 3 things only:

- auth + roster snapshot for the hosted session
- seat ownership for join/rejoin/takeover
- append-only recording/upload manifests

Do **not** add a separate `recordings` table in v1. One hosted session has at most one recording run. If a browser reconnect splits a track, represent that with a new `recording_tracks` row and a bumped `segment_index`.

For v1, the shared recording epoch is simply the moment `session_snapshot.recording_state` first moves to `recording`. `recording_tracks` stores capture offsets relative to that shared zero point. Do **not** use server receive time as sync metadata.

```sql
-- session_snapshot: auth + high-level recording state for the one session hosted by this temporary server.
create table session_snapshot (
  session_id text primary key,          -- The single control-plane session this server is hosting.
  host_join_key_hash blob not null,     -- Hash of the shared host join secret copied from the control plane.
  guest_join_key_hash blob not null,    -- Hash of the shared guest join secret copied from the control plane.
  roster_version integer not null,      -- Version of the auth/roster snapshot currently loaded here.
  recording_state text not null check (recording_state in ('waiting', 'recording', 'draining', 'stopped', 'failed')),
                                        -- waiting=room exists; recording=local capture is active; draining=recording stopped but uploads still finishing; stopped=uploads drained and artifact set is stable; failed=operator attention required.
  recording_epoch_id text,              -- Stable opaque id for the one v1 recording run. Null before recording starts.
  recording_epoch_started_at text,      -- Audit timestamp for the accepted waiting->recording transition. Null before recording starts.
  updated_at text not null              -- When this server last applied a control-plane snapshot or changed recording state.
);

-- participant_seats: local roster snapshot so join/rejoin does not depend on the control plane.
create table participant_seats (
  id text primary key,                  -- Same id as session_participants.id from the control plane. Main runtime identity key.
  session_id text not null references session_snapshot(session_id) on delete cascade,
                                        -- Redundant but useful for sanity checks and local queries.
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

-- recording_tracks: append-only track segments produced by one seat's browser recorder.
create table recording_tracks (
  id text primary key,                  -- Stable opaque track id chosen by the browser and reused for chunk upload, resume, and manifests.
  participant_seat_id text not null references participant_seats(id) on delete cascade,
                                        -- Durable seat that owns this recorded segment.
  session_id text not null references session_snapshot(session_id) on delete cascade,
                                        -- Redundant copy of the hosted session id for simple local queries and artifact paths.
  kind text not null check (kind in ('audio', 'video')),
                                        -- Browser-local media kind.
  segment_index integer not null check (segment_index >= 0),
                                        -- 0-based segment number per seat + kind. Bump when reconnect/restart creates a new segment.
  mime_type text not null,              -- Browser-reported container/codec string, e.g. audio/webm or video/webm.
  state text not null check (state in ('recording', 'uploading', 'complete', 'abandoned', 'failed')),
                                        -- recording=chunks still expected; uploading=local capture stopped and backlog is draining; complete=all expected chunks stored; abandoned=seat disappeared before upload completion; failed=terminal server-side error.
  expected_chunk_count integer check (expected_chunk_count >= 0),
                                        -- Null while the recorder is still running; set once the browser knows the final chunk count.
  created_at text not null,             -- When the server created this track segment.
  updated_at text not null              -- Tracks chunk progress and finalization.
);

-- idx_recording_tracks_session_seat_kind_segment_unique: prevents duplicate segments for one seat and kind.
create unique index idx_recording_tracks_session_seat_kind_segment_unique
  on recording_tracks(session_id, participant_seat_id, kind, segment_index);

-- idx_recording_tracks_session_state: supports manifest generation and "waiting for uploads" checks.
create index idx_recording_tracks_session_state
  on recording_tracks(session_id, state);

-- track_chunks: append-only upload manifest entries for completed chunks only.
create table track_chunks (
  id text primary key,                  -- Stable server-local chunk row id for logs and manifest rows.
  recording_track_id text not null references recording_tracks(id) on delete cascade,
                                        -- Owning track segment.
  chunk_index integer not null check (chunk_index >= 0),
                                        -- 0-based chunk number within the track segment.
  storage_path text not null,           -- Relative path under the session artifact root where the chunk file lives.
  byte_size integer not null check (byte_size >= 0),
                                        -- Persisted file size for verification and listings.
  sha256_hex text not null,             -- Content digest used for integrity checks and idempotent retry validation.
  created_at text not null              -- When the chunk was fully received and committed.
);

-- idx_track_chunks_track_chunk_unique: makes chunk ingest idempotent for retries/resume.
create unique index idx_track_chunks_track_chunk_unique
  on track_chunks(recording_track_id, chunk_index);

-- idx_track_chunks_track_created_at: preserves append order for per-track manifest reads.
create index idx_track_chunks_track_created_at
  on track_chunks(recording_track_id, created_at);
```

`seat_claims` is ephemeral session-server state. Do not sync it back to the control plane.

`recording_tracks` and `track_chunks` are session-local durability only. In v1, the control plane can fetch summaries or manifests from the session server when it needs to show download readiness; it does not need its own copy of per-chunk state.

The downloadable artifact is the session folder on disk plus manifests derived from `session_snapshot`, `participant_seats`, `recording_tracks`, and `track_chunks`. Do not add a separate artifact table until we hit a real need.

## implementation notes for `recording_tracks` and `track_chunks`

Treat these as the implementation contract for v1.

### `recording_tracks`

One row means one seat's one logical media track segment:

- one `participant_seat_id`
- one `kind` (`audio` or `video`)
- one `segment_index`

Create a `recording_tracks` row when the browser starts a new local recorder for that seat + kind.

Typical cases:

- a participant browser starts local recorders after the session enters `recording` → create 2 rows for that seat: one `audio`, one `video`
- browser reloads or reconnects and starts a fresh recorder → create a new row with the next `segment_index`

Update `recording_tracks` only on lifecycle changes:

- create with `state = 'recording'`
- when local capture stops, set `expected_chunk_count`
- if chunks are still draining, move to `state = 'uploading'`
- when all expected chunks are durably present, move to `state = 'complete'`
- if the segment will never finish cleanly after disconnect/restart, move to `state = 'abandoned'`
- if the server hits a terminal integrity/storage error, move to `state = 'failed'`

Do **not** use `recording_tracks` as the per-chunk source of truth. That is what `track_chunks` is for.

### `track_chunks`

One row means one fully received and durably committed chunk file for one `recording_track_id`.

Insert a `track_chunks` row only after the server has:

1. received the full chunk
2. verified its byte size and SHA-256 digest
3. written it successfully
4. committed or moved it to its final `storage_path`

`track_chunks` should be append-only in normal operation. Retries and resume should hit the unique index on `(recording_track_id, chunk_index)` and behave idempotently.

Do **not** insert rows for:

- upload started
- partial chunk received
- temp file exists but final commit did not happen

### recording artifact rule

For v1, recording success means:

- raw browser-native chunk files exist on disk
- `recording_tracks` accurately describes track lifecycle and segment splits
- `track_chunks` accurately lists the committed chunks

Do **not** require server-side stitching, muxing, or transcoding in the recording-critical path. If we later add export steps that concatenate chunks or mux audio + video into nicer deliverables, that is post-process convenience work, not the definition of a successful recording.
