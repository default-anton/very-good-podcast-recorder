# v1 database schema

Related docs:

- `docs/architecture.md`
- `docs/public-networking.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/operator-cli.md`
- `docs/releases.md`

## recommendation

Keep the **control-plane** and **session-server** schemas explicit and separate.

Use this doc as the schema source of truth for v1. Keep identity and permissions in `docs/identity.md`, seat-claim transitions in `docs/seat-claim-protocol.md`, and cross-layer state transitions in `docs/session-lifecycle.md`.

## migration policy

Use `pressly/goose` with SQL migration files.
Do **not** build a custom migration tool.

For v1 alpha:

- keep separate migration directories for the persistent control plane and the temporary session server, for example `db/migrations/controlplane` and `db/migrations/sessiond`
- use numbered SQL files such as `00001_init.sql`
- each reversible migration should include both `-- +goose Up` and `-- +goose Down`
- embed those migrations into the Go binaries so hosted deploy/update work does not depend on an extra operator-installed tool
- hosted deploys and updates run `up` only; down migrations are for disposable local development databases during iteration
- run control-plane migrations during hosted deploy/update work
- run session-server migrations only during fresh server bootstrap before readiness, per `docs/session-server-bootstrap.md`
- do **not** in-place migrate an already-running temporary session server in v1
- if a control-plane schema migration committed and the release must be backed out, restore from backup; do **not** rely on production `down` migrations
- the full release and rollback contract lives in `docs/releases.md`

## control-plane schema

```sql
-- sessions: one recording session in the persistent control plane.
create table sessions (
  id text primary key,                  -- Public session id shared with the session server and artifact paths.
  title text not null,                  -- Host-facing label only. Not auth-sensitive.
  state text not null check (state in ('draft', 'ready', 'active', 'ended')),
                                        -- draft=editable; ready=shareable + provisionable before recording starts; active=runtime assigned or hosted run exists; ended=closed history only.
  host_join_key_hash blob not null,     -- Hash of the shared host link secret. Never store the raw secret.
  guest_join_key_hash blob not null,    -- Hash of the shared guest link secret.
  roster_version integer not null default 1,
                                        -- Bump when draft/ready roster or join keys change so the next hosted session snapshot is correct.
  created_at text not null,             -- Audit trail and default ordering.
  updated_at text not null              -- Detects recent edits/stale views.
);

-- session_seats: one seat in one session. This row is the durable runtime identity.
create table session_seats (
  id text primary key,                  -- Stable runtime seat id for this session only. Used by reconnects, uploads, and manifests.
  session_id text not null references sessions(id) on delete cascade,
                                        -- Owning session. Cascade removes the roster with the session.
  role text not null check (role in ('host', 'guest')),
                                        -- host=may control recording; guest=may join but not control recording.
  display_name text not null,
                                        -- Session-local display name chosen by the host before the session starts.
  created_at text not null,
  updated_at text not null
);

-- idx_session_seats_session_role_name: fast join-picker reads for one session and one role.
create index idx_session_seats_session_role_name
  on session_seats(session_id, role, display_name);

-- idx_session_seats_session_name_unique: forces unambiguous display names within one session.
create unique index idx_session_seats_session_name_unique
  on session_seats(session_id, display_name);

-- session_servers: current temporary server assigned to a session.
create table session_servers (
  id text primary key,                  -- Control-plane id for the provisioned server instance.
  session_id text not null unique references sessions(id) on delete cascade,
                                        -- One active temporary server per session in v1.
  base_url text not null,               -- Public session-runtime base URL/hostname served directly by the disposable backend. Used by browser bootstrap/session traffic and runtime operations, not as the human-shared control-plane join link.
  region text,                          -- Placement/debug metadata only.
  state text not null check (state in ('creating', 'ready', 'stopping', 'stopped', 'failed')),
                                        -- creating=provisioning/bootstrap; ready=joinable runtime; stopping=intentional teardown requested; stopped=intentional teardown complete; failed=runtime not trustworthy.
  synced_roster_version integer,        -- Last roster_version confirmed on that server for this hosted run; null before first sync.
  created_at text not null,             -- Provisioning audit trail.
  updated_at text not null              -- Tracks state changes and sync progress.
);
```

## session-server schema [done]

Keep the session-server schema focused on 3 things only:

- auth + roster snapshot for the hosted session
- seat ownership for join/rejoin/takeover
- append-only recording/upload manifests

Do **not** add a separate `recordings` table in v1. One hosted session has at most one recording run. If a browser reconnect splits an active source instance, represent that with a new `recording_tracks` row and a bumped `segment_index` for that same `source_instance_id`. If a participant intentionally starts a fresh screen-share episode or extra camera, represent that with a new `source_instance_id` and a new `recording_tracks` row with `segment_index = 0`.

For v1, the shared recording epoch is simply the moment `session_snapshot.recording_state` first moves to `recording`. `recording_tracks` stores capture offsets relative to that shared zero point. Do **not** use server receive time as sync metadata.

```sql
-- session_snapshot: auth + high-level recording state for the one session hosted by this temporary server.
create table session_snapshot (
  session_id text primary key,          -- The single control-plane session this server is hosting.
  host_join_key_hash blob not null,     -- Hash of the shared host join secret copied from the control plane.
  guest_join_key_hash blob not null,    -- Hash of the shared guest join secret copied from the control plane.
  roster_version integer not null,      -- Version of the auth/roster snapshot currently loaded here.
  recording_state text not null check (recording_state in ('waiting', 'recording', 'draining', 'stopped', 'failed')),
                                        -- waiting=room exists, no recording run yet; recording=capture phase active; draining=stop accepted and backlog still finishing; stopped=final salvage manifest is available; failed=session-level salvage is no longer trustworthy enough to continue.
  recording_health text not null check (recording_health in ('healthy', 'degraded', 'failed')),
                                        -- healthy=no known terminal loss; degraded=partial/damaged but salvageable; failed=session-level terminal failure.
  recording_epoch_id text,              -- Stable opaque id for the one v1 recording run. Null before recording starts.
  recording_epoch_started_at text,      -- Audit timestamp for the accepted waiting->recording transition. Null before recording starts.
  updated_at text not null              -- When this server last applied a control-plane snapshot or changed recording state.
);

-- participant_seats: local roster snapshot so join/rejoin does not depend on the control plane.
create table participant_seats (
  id text primary key,                  -- Same id as session_seats.id from the control plane. Main runtime identity key.
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
                                        -- unclaimed=nobody owns it; active=one browser owns it; disconnected=last owner timed out/gone and the seat is recoverable.
  current_connection_id text,           -- Runtime connection handle so replacement joins can evict the old connection cleanly.
  last_seen_at text,                    -- Heartbeat/disconnect time for UX and cleanup.
  claim_version integer not null default 0,
                                        -- Bump on each new claim-secret issuance so stale browsers cannot silently retake the seat.
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
  source text not null check (source in ('mic', 'camera', 'screen', 'system_audio')),
                                        -- Stable v1 capture source type for this seat.
  source_instance_id text not null,
                                        -- Stable source instance id under one seat. Multiple camera instances are allowed; each new screen-share start gets a fresh source instance id.
  capture_group_id text,
                                        -- Optional grouping id for one user capture action that yielded paired sources, e.g. one screen share plus its best-effort system audio.
  kind text not null check (kind in ('audio', 'video')),
                                        -- Browser-local media kind. Must match the chosen source.
  segment_index integer not null check (segment_index >= 0),
                                        -- 0-based segment number per seat + source_instance_id. Bump when reconnect/restart creates a new segment for the same source instance.
  mime_type text not null,              -- Browser-reported container/codec string, e.g. audio/webm or video/webm.
  capture_start_offset_us integer not null check (capture_start_offset_us >= 0),
                                        -- Browser-reported segment start offset from the session recording epoch, measured from a local monotonic clock mapping.
  capture_end_offset_us integer check (capture_end_offset_us is null or capture_end_offset_us >= capture_start_offset_us),
                                        -- Browser-reported segment end offset from the same recording epoch. Null until finish is accepted.
  clock_sync_uncertainty_us integer not null check (clock_sync_uncertainty_us >= 0),
                                        -- Best-effort bound on the browser's mapping from local monotonic time to the shared recording epoch.
  state text not null check (state in ('recording', 'uploading', 'complete', 'abandoned', 'failed')),
                                        -- recording=chunks still expected; uploading=local capture stopped and backlog is draining; complete=all expected chunks stored; abandoned=seat disappeared before upload completion; failed=terminal server-side error.
  expected_chunk_count integer check (expected_chunk_count >= 0),
                                        -- Null while the recorder is still running; set once the browser knows the final chunk count.
  created_at text not null,             -- When the server created this track segment.
  updated_at text not null,             -- Tracks chunk progress and finalization.
  check (
    (source = 'mic' and kind = 'audio') or
    (source = 'camera' and kind = 'video') or
    (source = 'screen' and kind = 'video') or
    (source = 'system_audio' and kind = 'audio')
  )
);

-- idx_recording_tracks_session_seat_source_instance_segment_unique: prevents duplicate segments for one seat and source instance.
create unique index idx_recording_tracks_session_seat_source_instance_segment_unique
  on recording_tracks(session_id, participant_seat_id, source_instance_id, segment_index);

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

`session_snapshot.recording_state` is the recording phase. `session_snapshot.recording_health` is the artifact trust level. Keep them separate per `docs/session-lifecycle.md`.

Invariants:

- `waiting` implies `recording_health = 'healthy'`
- `failed` implies `recording_health = 'failed'`
- `stopped` may end as `healthy` or `degraded`

`seat_claims` is ephemeral session-server state. Do not sync it back to the control plane.

`recording_tracks` and `track_chunks` are session-local durability only. In v1, the control plane can fetch summaries or manifests from the session server when it needs to show download readiness; it does not need its own copy of per-chunk state.

The downloadable artifact is the session folder on disk plus manifests derived from `session_snapshot`, `participant_seats`, `recording_tracks`, and `track_chunks`. Do not add a separate artifact table until we hit a real need.

## implementation notes for `recording_tracks` and `track_chunks`

Treat these as the implementation contract for v1.

### `recording_tracks`

One row means one seat's one logical source-instance segment:

- one `participant_seat_id`
- one `source` (`mic`, `camera`, `screen`, or `system_audio`)
- one `source_instance_id`
- optional one `capture_group_id` for paired `screen` + `system_audio` instances from the same user action
- one `kind` (`audio` or `video`)
- one `segment_index`
- one capture offset range relative to the shared session recording epoch

Create a `recording_tracks` row when the browser starts a new local recorder for that seat + `source_instance_id`.

Typical cases:

- a participant browser starts local recorders after the session enters `recording` → create a baseline row for `mic`, one row for each started camera source instance, and later optional `screen` + `system_audio` rows as that seat starts screen share
- participant intentionally starts a second camera while still recording the first one → create a second `camera` row with a different `source_instance_id`
- participant stops screen share and starts it again later → finish the old screen/source-audio rows cleanly, then create fresh `screen` and optional `system_audio` rows with new `source_instance_id` values and `segment_index = 0`
- browser reloads or reconnects and starts a fresh recorder for one still-active source instance → create a new row with the next `segment_index` for that same `source_instance_id`
- upload stalls or temporary server disconnects while the same local recorder keeps running → keep the existing row; do not create a new segment

Update `recording_tracks` only on lifecycle changes:

- create with `capture_start_offset_us`, `clock_sync_uncertainty_us`, and `state = 'recording'`
- when local capture stops, set `expected_chunk_count` and `capture_end_offset_us`
- if chunks are still draining, move to `state = 'uploading'`
- when all expected chunks are durably present, move to `state = 'complete'`
- if the segment will never finish cleanly after disconnect/restart, move to `state = 'abandoned'`
- if the server hits a terminal durability/storage reconciliation error, move to `state = 'failed'`

A track-level `failed` must mark the hosted run at least `recording_health = 'degraded'`. It does **not** require `recording_state = 'failed'` unless the broader session-level salvage set becomes untrustworthy.

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
- `recording_tracks` accurately describes source-instance lifecycle and segment splits
- `track_chunks` accurately lists the committed chunks

Do **not** require server-side stitching, muxing, or transcoding in the recording-critical path. If we later add export steps that concatenate chunks or mux audio + video into nicer deliverables, that is post-process convenience work, not the definition of a successful recording.
