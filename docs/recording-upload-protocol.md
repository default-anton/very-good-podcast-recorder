# v1 recording/upload protocol

Related docs:

- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/testing.md`
- `docs/identity.md`
- `docs/seat-claim-protocol.md`
- `docs/session-lifecycle.md`
- `docs/recording-control-protocol.md`
- `docs/capture-profile.md`

## recommendation

Use a small, explicit 3-step protocol:

1. start track
2. upload chunk
3. finish track

Keep the contract boring and text-first. Do **not** infer track lifecycle from random chunk uploads.

For v1, the browser uploads **one or more logical source-instance tracks per participant seat**:

- `mic` → `audio`
- `camera` → `video`
- `screen` → `video`
- `system_audio` → `audio`

Use this model throughout the protocol:

- `source` = coarse capture type
- `source_instance_id` = one logical capture device or one screen-share episode under one seat
- `capture_group_id` = optional grouping id for one user share action that yielded paired `screen` + `system_audio` instances
- `segment_index` = restart counter for one uninterrupted recorder lineage within the same `source_instance_id`

`mic` is the baseline source. One camera source is the baseline video source, but a seat may publish and record more camera source instances at the same time. `screen` is optional per seat and may start, stop, and start again during the same recording run. `system_audio` is optional and best-effort; if the browser/platform does not expose it, that share episode simply has no `system_audio` source instance.

The v1 capture profile is locked in `docs/capture-profile.md`: target **1080p30 video** with **720p30 fallback**, plus **48 kHz Opus audio** in browser-native WebM.

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

It starts once the browser already owns a seat claim and the session server has entered the recording run (`recording_state = 'recording'`). After that, localized failures may degrade the run without immediately stopping unaffected uploads.

## auth

All recording/upload endpoints are same-origin session-server endpoints.

Authentication uses the active seat claim from the join/rejoin flow defined in `docs/seat-claim-protocol.md`:

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

The browser must also choose and persist `source_instance_id` and `segment_index` with these rules:

- one logical mic capture lineage for a seat gets one `source_instance_id`
- each camera source instance gets its own `source_instance_id`
- each new screen-share start gets a fresh `screen` `source_instance_id`
- each paired `system_audio` capture from that same share action gets its own `system_audio` `source_instance_id`
- if one user share action produced both `screen` and `system_audio`, both rows also share one `capture_group_id`
- the first segment for any fresh `source_instance_id` is `segment_index = 0`
- each fresh recorder restart for that same `source_instance_id` increments `segment_index` by `1`

If a reconnect/reload starts a new recorder for the same still-active source instance, it must use a new `recording_track_id` and the next `segment_index` for that same `source_instance_id`.

If the participant intentionally starts a new source instance instead — for example, a second camera or a later screen-share episode — the browser must mint a fresh `source_instance_id` and start again at `segment_index = 0`.

If upload requests fail, the network drops, or the browser temporarily loses server connectivity **but the same local recorder keeps running**, the browser must keep the existing `recording_track_id`, `source_instance_id`, and `segment_index` for that unfinished segment and resume uploads when possible. Upload continuity is not a new segment boundary.

## capture timing model

The shared sync anchor is the **session recording epoch**.

For v1, that epoch is the moment the session transitions into `recording`. The browser learns `recording_epoch_id` and obtains its local epoch mapping through `docs/recording-control-protocol.md`.

Rules:

- the browser measures capture timing with a **monotonic local clock**, i.e. `performance.now()`
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

Per-chunk timing is intentionally out of the critical path for v1. If we later need finer export alignment, we can derive it from container timestamps or add explicit chunk timing in a future version.

### timing rationale

Clock sync anchors **capture**, not upload transport. If the same local recorder keeps running, later chunk retries are still part of the same continuous segment, so they keep the same `recording_track_id`, `source_instance_id`, `segment_index`, and clock-sync estimate. Only a fresh local recorder start creates a new segment boundary and requires a fresh clock sync.

## endpoints

### 1. start track

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
- `source` must be one of `mic`, `camera`, `screen`, `system_audio`
- `source_instance_id` must be a client-generated opaque id for one logical source instance under the claimed seat
- `capture_group_id` is optional; when present, it groups paired `screen` + `system_audio` source instances created by the same user share action
- `kind` must be `audio` or `video`
- `source` + `kind` must be one of: `mic+audio`, `camera+video`, `screen+video`, `system_audio+audio`
- `segment_index` must be `>= 0`
- `mime_type` must be the browser recorder mime type for the segment
- `capture_start_offset_us` must be `>= 0`
- `clock_sync_uncertainty_us` must be `>= 0`
- `capture_start_offset_us` must be derived from the browser's monotonic clock mapped onto the current session recording epoch
- `capture_start_offset_us` must come from clock sync completed for this segment before the local recorder starts
- allowed only when `session_snapshot.recording_state = 'recording'`
- `recording_health` may be `healthy` or `degraded`; degraded runs still allow new segment starts while the phase remains `recording`

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
- `recording_health` may be `healthy` or `degraded`; degraded runs still accept unaffected track uploads
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
- `capture_end_offset_us` must be derived from the same uninterrupted local segment timeline as `capture_start_offset_us`
- `capture_end_offset_us` must be mapped onto the current session recording epoch with that segment's chosen clock-sync estimate
- allowed when track state is `recording` or `uploading`
- allowed when session state is `recording` or `draining`
- `recording_health` may be `healthy` or `degraded`; degraded runs still allow unaffected tracks to finish cleanly

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

A track-level `failed` does **not** automatically hard-stop the whole hosted recording run. It must at least move the session to `recording_health = 'degraded'`, and it moves the full session to `recording_state = 'failed'` only when the broader salvage set is no longer trustworthy per `docs/session-lifecycle.md`.

Bad client requests are **not** `failed`. For example, a bad digest header should reject that request without terminally poisoning the track.

## session-level rules

`session_snapshot.recording_state` gates the protocol phase:

- `waiting` → reject `start`, `chunk`, `finish`
- `recording` → allow `start`, `chunk`, `finish`
- `draining` → reject `start`; allow `chunk`, `finish` for already-started tracks only
- `stopped` → reject `start`, `chunk`, `finish`
- `failed` → reject `start`, `chunk`, `finish`

`session_snapshot.recording_health` tells the host whether the salvage set is still clean:

- `healthy` → normal run
- `degraded` → keep salvaging unaffected work, but never present the result as clean
- `failed` → session-level terminal failure; no new work should be accepted because `recording_state` must also be `failed`

State gates apply to **new** mutations.

Exact idempotent replays of already-committed `start`, `chunk`, or `finish` operations must still return success even if the session or track has already moved to a later state.

Session transition rules are finalized in `docs/session-lifecycle.md`.

For this protocol, enforce:

1. host starts recording → `recording + healthy`
2. host stops recording → `draining`, preserving the current health
3. if one started track reaches `failed` but the rest of the session is still salvageable, move the session to `recording_health = 'degraded'` and keep accepting unaffected work under the current phase rules
4. move the session to `recording_state = 'failed'` only when the broader salvage set is no longer trustworthy enough to continue safely
5. `draining -> stopped` when all started tracks are terminal and the server can still expose a truthful final salvage manifest; final health may be `healthy` or `degraded`

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
2. browser starts local `mic` and baseline `camera` recorders
3. browser `POST /api/v1/recording-tracks/start` for `mic` `source_instance_id = src_mic_...`, segment `0`
4. browser `POST /api/v1/recording-tracks/start` for the baseline `camera` `source_instance_id = src_cam_primary_...`, segment `0`
5. if the participant enables extra cameras, browser starts one recorder per extra camera source instance and calls `start` for each one
6. if the participant starts screen share, browser starts a fresh `screen` source instance and, when available, a paired `system_audio` source instance with the same `capture_group_id`
7. browser uploads chunks with `PUT /api/v1/recording-tracks/{recording_track_id}/chunks/{chunk_index}` as they are produced
8. host stops recording; session moves to `draining`
9. browser calls `finish` for every started source-instance track with final `expected_chunk_count` and `capture_end_offset_us`
10. remaining backlog uploads continue during `draining`
11. each track becomes `complete` when all expected chunks are present
12. session becomes `stopped + healthy` when all started tracks are terminal and the final salvage set is clean

## repeated-screen-share example

If one participant starts, stops, and later restarts screen share during the same recording run:

- the first share creates `screen` `source_instance_id = src_screen_a` and, when available, paired `system_audio` `source_instance_id = src_system_audio_a`, both with `capture_group_id = cg_a`
- when the participant stops sharing, the browser calls `finish` for those active source-instance tracks
- those finished tracks may move to `uploading` and then `complete`; this is a normal lifecycle, not `abandoned`
- when the participant starts sharing again later, the browser creates fresh `source_instance_id` values, for example `src_screen_b` and optional `src_system_audio_b`, plus a fresh `capture_group_id = cg_b`
- the new share episode starts at `segment_index = 0` again because it is a new source instance, not a reconnect split
- the final manifest shows two explicit screen source instances for that seat

## multi-camera example

If one host records a webcam and an overhead camera at the same time:

- both tracks use `source = 'camera'`
- each camera gets its own `source_instance_id`, for example `src_cam_webcam` and `src_cam_overhead`
- both camera source instances may be active concurrently under the same `participant_seat_id`
- if one camera stops while the other keeps running, finish only the stopped camera's active track; do not affect the other camera source instance
- if one camera recorder reconnects/restarts, bump `segment_index` only for that same camera `source_instance_id`

## capture-restart example

If one browser reloads during recording and one local recorder restarts:

- any unfinished `mic`, `camera`, `screen`, or `system_audio` segment `0` may later become `abandoned`
- rejoined browser reruns clock sync for the current `recording_epoch_id`
- rejoined browser creates fresh track rows with `segment_index = 1` for whichever `source_instance_id` values are still active and resume
- uploads continue into the new segment rows
- each segment keeps its own capture offset range relative to the same session recording epoch
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
