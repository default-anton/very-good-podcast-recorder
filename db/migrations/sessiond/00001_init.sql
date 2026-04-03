-- +goose Up
create table session_snapshot (
  session_id text primary key,
  host_join_key_hash blob not null,
  guest_join_key_hash blob not null,
  roster_version integer not null,
  recording_state text not null check (recording_state in ('waiting', 'recording', 'draining', 'stopped', 'failed')),
  recording_health text not null check (recording_health in ('healthy', 'degraded', 'failed')),
  recording_epoch_id text,
  recording_epoch_started_at text,
  updated_at text not null
);

create table participant_seats (
  id text primary key,
  session_id text not null references session_snapshot(session_id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  display_name text not null,
  last_synced_at text not null
);

create index idx_participant_seats_session_role_name
  on participant_seats(session_id, role, display_name);

create table seat_claims (
  participant_seat_id text primary key references participant_seats(id) on delete cascade,
  claim_secret_hash blob,
  state text not null check (state in ('unclaimed', 'active', 'disconnected')),
  current_connection_id text,
  last_seen_at text,
  claim_version integer not null default 0,
  updated_at text not null
);

create index idx_seat_claims_state_last_seen
  on seat_claims(state, last_seen_at);

create table recording_tracks (
  id text primary key,
  participant_seat_id text not null references participant_seats(id) on delete cascade,
  session_id text not null references session_snapshot(session_id) on delete cascade,
  source text not null check (source in ('mic', 'camera', 'screen', 'system_audio')),
  source_instance_id text not null,
  capture_group_id text,
  kind text not null check (kind in ('audio', 'video')),
  segment_index integer not null check (segment_index >= 0),
  mime_type text not null,
  capture_start_offset_us integer not null check (capture_start_offset_us >= 0),
  capture_end_offset_us integer check (capture_end_offset_us is null or capture_end_offset_us >= capture_start_offset_us),
  clock_sync_uncertainty_us integer not null check (clock_sync_uncertainty_us >= 0),
  state text not null check (state in ('recording', 'uploading', 'complete', 'abandoned', 'failed')),
  expected_chunk_count integer check (expected_chunk_count >= 0),
  created_at text not null,
  updated_at text not null,
  check (
    (source = 'mic' and kind = 'audio') or
    (source = 'camera' and kind = 'video') or
    (source = 'screen' and kind = 'video') or
    (source = 'system_audio' and kind = 'audio')
  )
);

create unique index idx_recording_tracks_session_seat_source_instance_segment_unique
  on recording_tracks(session_id, participant_seat_id, source_instance_id, segment_index);

create index idx_recording_tracks_session_state
  on recording_tracks(session_id, state);

create table track_chunks (
  id text primary key,
  recording_track_id text not null references recording_tracks(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  storage_path text not null,
  byte_size integer not null check (byte_size >= 0),
  sha256_hex text not null,
  created_at text not null
);

create unique index idx_track_chunks_track_chunk_unique
  on track_chunks(recording_track_id, chunk_index);

create index idx_track_chunks_track_created_at
  on track_chunks(recording_track_id, created_at);

-- +goose Down
drop index if exists idx_track_chunks_track_created_at;
drop index if exists idx_track_chunks_track_chunk_unique;
drop table if exists track_chunks;
drop index if exists idx_recording_tracks_session_state;
drop index if exists idx_recording_tracks_session_seat_source_instance_segment_unique;
drop table if exists recording_tracks;
drop index if exists idx_seat_claims_state_last_seen;
drop table if exists seat_claims;
drop index if exists idx_participant_seats_session_role_name;
drop table if exists participant_seats;
drop table if exists session_snapshot;
