# v1 recording/upload protocol

Related docs:

- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/testing.md`
- `docs/identity.md`
- `docs/recording-control-protocol.md`

## recommendation

Use a small, explicit 3-step protocol:

1. start track
2. upload chunk
3. finish track

Keep the contract boring and text-first. Do **not** infer track lifecycle from random chunk uploads.

For v1, the browser uploads **2 logical tracks per participant**:

- `audio`
- `video`

Each logical track uploads as many browser-native chunks, usually WebM-based. The canonical recording artifact is:

- raw chunk files on disk
- `recording_tracks`
- `track_chunks`

Do **not** require stitching, muxing, or transcoding for recording success.

## scope

This doc defines the browser ↔ session-server contract for local recording upload.

It does **not** define:

- host start/stop recording UI
- LiveKit/media room behavior
- post-process export jobs

It starts once the browser already owns a seat claim and the session server is in `session_snapshot.recording_state = 'recording'`.

## auth

All recording/upload endpoints are same-origin session-server endpoints.

Authentication uses the active seat claim from join/rejoin flow:

- browser joins and claims a seat
- session server sets the secure claim cookie
- recording/upload requests use that same claim automatically
- the server derives `participant_seat_id` from the claim

Rules:

- host/guest join links alone are **not** sufficient to upload tracks
- upload requests without an active claimed seat fail with `401`
- a browser may upload only for its own claimed seat

## api versioning

All endpoint examples in this doc use `/api/v1/...`.

Incompatible wire changes must ship under a new versioned path, for example `/api/v2/...`.

Do **not** hide breaking changes behind optional fields or state-dependent behavior.

## client obligations

Before starting a new recorder segment, the browser must generate and persist a new opaque `recording_track_id`.

That id must survive:

- request retry
- page refresh recovery
- upload resume for the same unfinished segment

The browser also chooses `segment_index` per seat + kind:

- first audio segment = `0`
- first video segment = `0`
- each fresh recorder restart for that seat + kind increments by `1`

If a reconnect/reload starts a new recorder, it must use a new `recording_track_id` and the next `segment_index`.

## capture timing model

The shared sync anchor is the **session recording epoch**.

For v1, that epoch is the moment the session transitions into `recording`. The browser learns `recording_epoch_id` and obtains its local epoch mapping through `docs/recording-control-protocol.md`.

Rules:

- the browser measures capture timing with a **monotonic local clock**, i.e. `performance.now()`
- the browser maps that local monotonic clock onto the session recording epoch using a clock-sync estimate from the session server
- the browser sends **segment-level capture offsets** relative to the session recording epoch
- the server stores those offsets as recording metadata
- server receive time and upload order are **not** sync metadata
- wall-clock timestamps like `Date.now()` are **not** the source of truth for cross-participant alignment

For v1, the contract stores timing at the **track segment** level:

- `capture_start_offset_us`
- `capture_end_offset_us`
- `clock_sync_uncertainty_us`

Per-chunk timing is intentionally out of the critical path for v1. If we later need finer export alignment, we can derive it from container timestamps or add explicit chunk timing in a future version.

## endpoints

### 1. start track

`POST /api/v1/recording-tracks/start`

Creates or replays one logical track segment for the currently claimed seat.

### request body

```json
{
  "recording_track_id": "trk_01hr...",
  "recording_epoch_id": "re_01hr...",
  "kind": "audio",
  "segment_index": 0,
  "mime_type": "audio/webm",
  "capture_start_offset_us": 1250000,
  "clock_sync_uncertainty_us": 8000
}
```

### request rules

- `recording_track_id` is client-generated and unique for this segment
- `recording_epoch_id` must equal the current session `recording_epoch_id`
- `kind` must be `audio` or `video`
- `segment_index` must be `>= 0`
- `mime_type` must be the browser recorder mime type for the segment
- `capture_start_offset_us` must be `>= 0`
- `clock_sync_uncertainty_us` must be `>= 0`
- `capture_start_offset_us` must be derived from the browser's monotonic clock mapped onto the current session recording epoch
- allowed only when `session_snapshot.recording_state = 'recording'`

### idempotency rules

The server must treat `recording_track_id` as the idempotency key.

If the same seat replays the same `recording_track_id` with the exact same fields, return the existing track row.

If `recording_track_id` already exists with different fields, return `409`.

If another row already exists for the same `(participant_seat_id, kind, segment_index)` with a different `recording_track_id`, return `409`.

### successful behavior

On first success, the server creates `recording_tracks` with:

- `id = recording_track_id`
- derived `participant_seat_id`
- derived `session_id`
- `kind`
- `segment_index`
- `mime_type`
- `capture_start_offset_us`
- `capture_end_offset_us = null`
- `clock_sync_uncertainty_us`
- `state = 'recording'`
- `expected_chunk_count = null`

The server must also validate that the request `recording_epoch_id` matches the current session `recording_epoch_id`. The success response echoes that current epoch id.

### success response

- `201 Created` on first create
- `200 OK` on idempotent replay

```json
{
  "recording_track_id": "trk_01hr...",
  "recording_epoch_id": "re_01hr...",
  "participant_seat_id": "seat_01hr...",
  "session_id": "sess_01hr...",
  "kind": "audio",
  "segment_index": 0,
  "mime_type": "audio/webm",
  "capture_start_offset_us": 1250000,
  "capture_end_offset_us": null,
  "clock_sync_uncertainty_us": 8000,
  "state": "recording"
}
```

### 2. upload chunk

`PUT /api/v1/recording-tracks/{recording_track_id}/chunks/{chunk_index}`

Uploads one durable chunk for a started track.

### request headers

- `Content-Type`: must match the track's `mime_type`
- `Content-Length`: required
- `X-Chunk-Sha256`: required lowercase hex SHA-256 of the request body

### request body

Raw chunk bytes.

### request rules

- `chunk_index` is 0-based and must be `>= 0`
- track must exist and belong to the currently claimed seat
- allowed when track state is `recording` or `uploading`
- allowed when session state is `recording` or `draining`
- if `finish` was already accepted, `chunk_index` must be `< expected_chunk_count`
- chunk order may arrive out of order; completeness is determined by indices, not arrival time

### durable commit rules

The server must not insert a `track_chunks` row until it has:

1. received the full request body
2. computed the actual byte size and SHA-256 digest
3. verified them against `Content-Length` and `X-Chunk-Sha256`
4. committed the bytes to the final `storage_path`

If byte size or digest verification fails:

- reject the request
- do **not** insert a `track_chunks` row
- do **not** move the track to `failed` just because one client request was bad

Then insert `track_chunks` with:

- `recording_track_id`
- `chunk_index`
- `storage_path`
- `byte_size`
- `sha256_hex`

### idempotency rules

The unique key is `(recording_track_id, chunk_index)`.

If the same chunk is replayed and the stored row matches both:

- `byte_size`
- `sha256_hex`

return success without creating a second row.

If the same `(recording_track_id, chunk_index)` is replayed with different bytes, return `409`.

### success response

- `201 Created` on first durable commit
- `200 OK` on idempotent replay

```json
{
  "recording_track_id": "trk_01hr...",
  "chunk_index": 3,
  "byte_size": 524288,
  "sha256_hex": "4a1f...",
  "status": "stored"
}
```

or

```json
{
  "recording_track_id": "trk_01hr...",
  "chunk_index": 3,
  "byte_size": 524288,
  "sha256_hex": "4a1f...",
  "status": "duplicate"
}
```

### 3. finish track

`POST /api/v1/recording-tracks/{recording_track_id}/finish`

Declares that the browser will send no more chunks for this track segment.

### request body

```json
{
  "expected_chunk_count": 12,
  "capture_end_offset_us": 27234567
}
```

### request rules

- track must exist and belong to the currently claimed seat
- `expected_chunk_count` must be `>= 0`
- `capture_end_offset_us` must be `>= capture_start_offset_us`
- `capture_end_offset_us` must be derived from the browser's monotonic clock mapped onto the current session recording epoch
- allowed when track state is `recording` or `uploading`
- allowed when session state is `recording` or `draining`

### idempotency rules

If `finish` is replayed with the same `expected_chunk_count` and the same `capture_end_offset_us`, return success.

If `finish` is replayed with a different `expected_chunk_count` or a different `capture_end_offset_us`, return `409`.

### state transition rules

On `finish`:

- if any existing `track_chunks.chunk_index >= expected_chunk_count`, return `409`
- set `recording_tracks.expected_chunk_count`
- set `recording_tracks.capture_end_offset_us`
- if all chunk indices `0..expected_chunk_count-1` are already present, set `state = 'complete'`
- otherwise set `state = 'uploading'`

A track is `complete` only when both are true:

- `finish` was accepted
- all expected chunk indices exist in `track_chunks`

### background completion rule

After `finish`, every later successful chunk upload for that track must re-check completion.

When the final missing chunk arrives, move `recording_tracks.state` from `uploading` to `complete`.

### success response

```json
{
  "recording_track_id": "trk_01hr...",
  "recording_epoch_id": "re_01hr...",
  "capture_start_offset_us": 1250000,
  "capture_end_offset_us": 27234567,
  "expected_chunk_count": 12,
  "received_chunk_count": 10,
  "state": "uploading"
}
```

or

```json
{
  "recording_track_id": "trk_01hr...",
  "recording_epoch_id": "re_01hr...",
  "capture_start_offset_us": 1250000,
  "capture_end_offset_us": 27234567,
  "expected_chunk_count": 12,
  "received_chunk_count": 12,
  "state": "complete"
}
```

## server-owned transitions

The browser does not directly set `abandoned` or `failed`.

The server owns those transitions.

### `abandoned`

Move a track to `abandoned` when:

- the track was started
- `finish` was never accepted
- the recording session ends or cleanup decides that no more chunks will arrive

Typical causes:

- browser crash
- recorder restart that produced a newer segment
- seat takeover where the old unfinished segment cannot complete cleanly

### `failed`

Move a track to `failed` only when the server hits a terminal durability or reconciliation problem after accepting work, for example:

- final storage commit failed
- manifest/database write failed after durable file write and the server cannot safely reconcile it
- on-disk bytes and manifest state diverged and cleanup cannot prove a safe recovery path

`failed` means operator attention required. Do not silently downgrade it to `abandoned`.

Bad client requests are **not** `failed`. For example, a bad digest header should reject that request without terminally poisoning the track.

## session-level rules

`session_snapshot.recording_state` gates the protocol:

- `waiting` → reject `start`, `chunk`, `finish`
- `recording` → allow `start`, `chunk`, `finish`
- `draining` → reject `start`; allow `chunk`, `finish` for already-started tracks only
- `stopped` → reject `start`, `chunk`, `finish`
- `failed` → reject `start`, `chunk`, `finish`

State gates apply to **new** mutations.

Exact idempotent replays of already-committed `start`, `chunk`, or `finish` operations must still return success even if the session or track has already moved to a later state.

Recommended session transition:

1. host starts recording → `recording`
2. host stops recording → `draining`
3. all started tracks become terminal (`complete`, `abandoned`, or `failed`) → `stopped`, unless any are `failed`
4. if any terminal track is `failed`, session may stay `failed` instead of `stopped`

## error contract

Use small, explicit errors.

### status codes

- `400 Bad Request` → malformed JSON, bad enum, bad header, negative index, invalid SHA format, digest mismatch, declared length mismatch
- `401 Unauthorized` → no valid claimed seat
- `403 Forbidden` → claimed seat does not own the target track
- `404 Not Found` → target track does not exist
- `409 Conflict` → idempotency mismatch, stale or mismatched `recording_epoch_id`, duplicate segment tuple, duplicate chunk index with different bytes, invalid state transition
- `413 Payload Too Large` → chunk exceeds server limit
- `500 Internal Server Error` → unexpected server failure

### error body

```json
{
  "error": {
    "code": "chunk_conflict",
    "message": "chunk 3 for track trk_01hr... already exists with different content"
  }
}
```

Use actionable codes/messages. Never log or return raw claim secrets.

## canonical happy path

For one participant seat:

1. browser learns the current `recording_epoch_id` and completes clock sync through `docs/recording-control-protocol.md`
2. browser starts local audio recorder
3. browser `POST /api/v1/recording-tracks/start` for audio segment `0`
4. browser starts local video recorder
5. browser `POST /api/v1/recording-tracks/start` for video segment `0`
6. browser uploads chunks with `PUT /api/v1/recording-tracks/{recording_track_id}/chunks/{chunk_index}` as they are produced
7. host stops recording; session moves to `draining`
8. browser calls `finish` for audio and video with final `expected_chunk_count` and `capture_end_offset_us`
9. remaining backlog uploads continue during `draining`
10. each track becomes `complete` when all expected chunks are present
11. session becomes `stopped` when all tracks are terminal

## reconnect example

If one browser reloads during recording:

- unfinished audio/video segment `0` may later become `abandoned`
- rejoined browser reruns clock sync for the current `recording_epoch_id`
- rejoined browser creates fresh audio/video tracks with `segment_index = 1`
- uploads continue into the new segment rows
- each segment keeps its own capture offset range relative to the same session recording epoch
- the final manifest shows an explicit split, not a silent overwrite

## non-goals for v1

- direct browser upload to object storage
- server-side mux/transcode as part of recording success
- multiple active devices uploading for one seat at the same time
- freeform client mutation of server-owned terminal states
- per-chunk capture timing in the upload contract
