# v1 recording/upload protocol

Related docs:

- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/testing.md`
- `docs/identity.md`

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

## endpoints

### 1. start track

`POST /api/recording-tracks/start`

Creates or replays one logical track segment for the currently claimed seat.

### request body

```json
{
  "recording_track_id": "trk_01hr...",
  "kind": "audio",
  "segment_index": 0,
  "mime_type": "audio/webm"
}
```

### request rules

- `recording_track_id` is client-generated and unique for this segment
- `kind` must be `audio` or `video`
- `segment_index` must be `>= 0`
- `mime_type` must be the browser recorder mime type for the segment
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
- `state = 'recording'`
- `expected_chunk_count = null`

### success response

- `201 Created` on first create
- `200 OK` on idempotent replay

```json
{
  "recording_track_id": "trk_01hr...",
  "participant_seat_id": "seat_01hr...",
  "session_id": "sess_01hr...",
  "kind": "audio",
  "segment_index": 0,
  "mime_type": "audio/webm",
  "state": "recording"
}
```

### 2. upload chunk

`PUT /api/recording-tracks/{recording_track_id}/chunks/{chunk_index}`

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

`POST /api/recording-tracks/{recording_track_id}/finish`

Declares that the browser will send no more chunks for this track segment.

### request body

```json
{
  "expected_chunk_count": 12
}
```

### request rules

- track must exist and belong to the currently claimed seat
- `expected_chunk_count` must be `>= 0`
- allowed when track state is `recording` or `uploading`
- allowed when session state is `recording` or `draining`

### idempotency rules

If `finish` is replayed with the same `expected_chunk_count`, return success.

If `finish` is replayed with a different `expected_chunk_count`, return `409`.

### state transition rules

On `finish`:

- if any existing `track_chunks.chunk_index >= expected_chunk_count`, return `409`
- set `recording_tracks.expected_chunk_count`
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
  "expected_chunk_count": 12,
  "received_chunk_count": 10,
  "state": "uploading"
}
```

or

```json
{
  "recording_track_id": "trk_01hr...",
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

Move a track to `failed` when the server hits a terminal integrity or storage problem, for example:

- chunk digest mismatch after receive
- final storage commit failed
- manifest/database write failed after durable file write and the server cannot safely reconcile it

`failed` means operator attention required. Do not silently downgrade it to `abandoned`.

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

- `400 Bad Request` → malformed JSON, bad enum, bad header, negative index, invalid SHA format
- `401 Unauthorized` → no valid claimed seat
- `403 Forbidden` → claimed seat does not own the target track
- `404 Not Found` → target track does not exist
- `409 Conflict` → idempotency mismatch, duplicate segment tuple, duplicate chunk index with different bytes, invalid state transition
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

1. browser starts local audio recorder
2. browser `POST /api/recording-tracks/start` for audio segment `0`
3. browser starts local video recorder
4. browser `POST /api/recording-tracks/start` for video segment `0`
5. browser uploads chunks with `PUT /chunks/{chunk_index}` as they are produced
6. host stops recording; session moves to `draining`
7. browser calls `finish` for audio and video with final `expected_chunk_count`
8. remaining backlog uploads continue during `draining`
9. each track becomes `complete` when all expected chunks are present
10. session becomes `stopped` when all tracks are terminal

## reconnect example

If one browser reloads during recording:

- unfinished audio/video segment `0` may later become `abandoned`
- rejoined browser creates fresh audio/video tracks with `segment_index = 1`
- uploads continue into the new segment rows
- the final manifest shows an explicit split, not a silent overwrite

## non-goals for v1

- direct browser upload to object storage
- server-side mux/transcode as part of recording success
- multiple active devices uploading for one seat at the same time
- freeform client mutation of server-owned terminal states
