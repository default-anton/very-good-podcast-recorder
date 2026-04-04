# v1 recording/upload protocol

Related docs:

- `docs/README.md`
- `docs/capture-profile.md`
- `docs/artifact-manifest.md`
- `docs/session-lifecycle.md`
- `docs/seat-claim-protocol.md`
- `docs/recording-control-protocol.md`
- `docs/database-schema.md`
- `docs/testing.md`

## recommendation

Use a small, explicit 3-step protocol:

1. start track
2. upload chunk
3. finish track

Keep the contract boring and text-first. Do **not** infer track lifecycle from random chunk uploads.

The source model and capture profile are owned by `docs/capture-profile.md`.
This doc owns the upload wire contract, idempotency rules, and server-side track/chunk transitions.

The canonical recording artifact is:

- raw chunk files on disk plus `session.json` / `track.json` per `docs/artifact-manifest.md`
- `recording_tracks`
- `track_chunks`

Do **not** require stitching, muxing, or transcoding for recording success.

## scope

This doc defines the browser ↔ session-server contract for local recording upload.

It does **not** define:

- host start/stop recording UI
- LiveKit/media room behavior
- capture-profile targets or source taxonomy
- post-process export jobs

It starts once the browser already owns a seat claim and the session server has entered the recording run (`recording_state = 'recording'`). After that, localized failures may degrade the run without immediately stopping unaffected uploads.

## auth

All recording/upload endpoints are same-origin session-server endpoints.

Authentication uses the active seat claim from `docs/seat-claim-protocol.md`.

Rules:

- join links alone are **not** sufficient to upload tracks
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

The browser must also choose and persist `source_instance_id`, `capture_group_id`, and `segment_index` using the source model from `docs/capture-profile.md`.

Protocol-specific rules:

- a fresh recorder restart for the same logical source instance keeps the same `source_instance_id` and increments `segment_index`
- an intentionally new source instance mints a fresh `source_instance_id` and starts again at `segment_index = 0`
- upload continuity is **not** a new segment boundary
- if the same local recorder keeps running, keep the existing `recording_track_id`, `source_instance_id`, and `segment_index` even when uploads stall or resume later

## capture timing model

The shared sync anchor is the **session recording epoch** from `docs/recording-control-protocol.md`.

Rules:

- the browser measures capture timing with a monotonic local clock, i.e. `performance.now()`
- the browser maps that local monotonic clock onto the session recording epoch using a clock-sync estimate from the session server
- the browser sends **segment-level capture offsets** relative to the session recording epoch
- one clock-sync estimate anchors one uninterrupted local track segment
- the server stores those offsets as recording metadata
- server receive time and upload order are **not** sync metadata
- wall-clock timestamps like `Date.now()` are **not** the source of truth for cross-participant alignment

For v1, the contract stores timing at the **track segment** level:

- `capture_start_offset_us`
- `capture_end_offset_us`
- `clock_sync_uncertainty_us`

Per-chunk timing is intentionally out of the critical path for v1.

## endpoints

### 1. start track [done]

`POST /api/v1/recording-tracks/start`

Creates or replays one logical track segment for the currently claimed seat.

### request body

```json
{
  "recording_track_id": "trk_01hr...",
  "recording_epoch_id": "re_01hr...",
  "source": "mic",
  "source_instance_id": "src_mic_01hr...",
  "capture_group_id": null,
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
- `source`, `source_instance_id`, `capture_group_id`, and `segment_index` must follow `docs/capture-profile.md`
- `source_instance_id` must be a path-safe opaque token because it becomes part of the artifact path; do not use `/`, `\\`, `.` or `..` as path segments
- `kind` must be `audio` or `video`
- `source` + `kind` must be one of: `mic+audio`, `camera+video`, `screen+video`, `system_audio+audio`
- `segment_index` must be `>= 0`
- `mime_type` must be the browser recorder mime type for the segment
- `capture_start_offset_us` must be `>= 0`
- `clock_sync_uncertainty_us` must be `>= 0`
- `capture_start_offset_us` must come from clock sync completed for this segment before the local recorder starts
- allowed only when `session_snapshot.recording_state = 'recording'`
- degraded runs still allow new segment starts while the phase remains `recording`

### idempotency rules

The server must treat `recording_track_id` as the idempotency key.

If the same seat replays the same `recording_track_id` with the exact same fields, return the existing track row.

If `recording_track_id` already exists with different fields, return `409`.

If another row already exists for the same `(participant_seat_id, source_instance_id, segment_index)` with a different `recording_track_id`, return `409`.

### successful behavior

On first success, the server creates `recording_tracks` with:

- `id = recording_track_id`
- derived `participant_seat_id`
- derived `session_id`
- `source`
- `source_instance_id`
- optional `capture_group_id`
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
  "source": "mic",
  "source_instance_id": "src_mic_01hr...",
  "capture_group_id": null,
  "kind": "audio",
  "segment_index": 0,
  "mime_type": "audio/webm",
  "capture_start_offset_us": 1250000,
  "capture_end_offset_us": null,
  "clock_sync_uncertainty_us": 8000,
  "state": "recording"
}
```

### 2. upload chunk [done]

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
- degraded runs still accept unaffected track uploads
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

### 3. finish track [done]

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
- `capture_end_offset_us` must be derived from the same uninterrupted local segment timeline as `capture_start_offset_us`
- `capture_end_offset_us` must be mapped onto the current session recording epoch with that segment's chosen clock-sync estimate
- allowed when track state is `recording` or `uploading`
- allowed when session state is `recording` or `draining`
- degraded runs still allow unaffected tracks to finish cleanly

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

A track-level `failed` does **not** automatically hard-stop the whole hosted recording run. Session-level escalation rules live in `docs/session-lifecycle.md`.

Bad client requests are **not** `failed`. For example, a bad digest header should reject that request without terminally poisoning the track.

## lifecycle ownership

`docs/session-lifecycle.md` is the source of truth for:

- session `recording_state` gates
- session `recording_health` meaning
- when degraded work may continue
- when the hosted run becomes `stopped` or `failed`

This protocol enforces those gates but does not redefine them.

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
2. browser starts whichever local sources are active per `docs/capture-profile.md`
3. browser calls `start` once per new source-instance segment
4. browser uploads chunks with `PUT /api/v1/recording-tracks/{recording_track_id}/chunks/{chunk_index}` as they are produced
5. host stops recording; session moves to `draining`
6. browser calls `finish` for every started source-instance track with final `expected_chunk_count` and `capture_end_offset_us`
7. remaining backlog uploads continue during `draining`
8. each track becomes `complete` when all expected chunks are present
9. session becomes `stopped + healthy` when all started tracks are terminal and the final salvage set is clean

## repeated-screen-share example

If one participant starts, stops, and later restarts screen share during the same recording run:

- the first share creates one `screen` source instance and, when available, one paired `system_audio` source instance with the same `capture_group_id`
- when the participant stops sharing, the browser calls `finish` for those active source-instance tracks
- those finished tracks may move to `uploading` and then `complete`; this is a normal lifecycle, not `abandoned`
- when the participant starts sharing again later, the browser creates fresh source-instance ids and a fresh `capture_group_id`
- the new share episode starts at `segment_index = 0` again because it is a new source instance, not a reconnect split

## multi-camera example

If one seat records multiple cameras at the same time:

- all tracks use `source = 'camera'`
- each camera gets its own `source_instance_id`
- camera source instances may be active concurrently under the same `participant_seat_id`
- if one camera stops while another keeps running, finish only the stopped camera's active track
- if one camera recorder reconnects/restarts, bump `segment_index` only for that same camera `source_instance_id`

## capture-restart example

If one browser reloads during recording and one local recorder restarts:

- any unfinished segment `0` may later become `abandoned`
- the rejoined browser reruns clock sync for the current `recording_epoch_id`
- the rejoined browser creates fresh track rows with `segment_index = 1` for whichever source instances are still active
- uploads continue into the new segment rows
- the final manifest shows an explicit split, not a silent overwrite

## upload-resume example

If one browser loses server connectivity during recording but its local recorder keeps running:

- no new segment is created
- browser keeps the same `recording_track_id`, `source_instance_id`, and `segment_index`
- browser does **not** rerun clock sync just for upload resume
- already-recorded local chunks upload after connectivity returns
- final manifest still shows one continuous segment for that recorder

## degraded-session example

If one participant source track hits a terminal storage failure during recording:

- that track moves to `failed`
- the hosted recording health moves to `degraded`
- unaffected tracks keep uploading under the normal phase rules
- host may still stop recording normally
- the final session may end as `stopped + degraded` if the server can still produce a truthful salvage manifest

## session-failed example

If the session server can no longer trust the broader salvage set:

- hosted recording moves to `failed + failed`
- new `start`, `chunk`, and `finish` mutations are rejected
- exact idempotent replays of already-committed operations still succeed
- already committed chunks should remain preserved if storage is still readable

## non-goals for v1

- direct browser upload to object storage
- server-side mux/transcode as part of recording success
- more than one active `mic` source instance per seat in v1
- more than one active screen-share episode per seat at the same time in v1
- freeform client mutation of server-owned terminal states
- per-chunk capture timing in the upload contract
