# v1 recording control protocol

Related docs:

- `docs/README.md`
- `docs/session-lifecycle.md`
- `docs/seat-claim-protocol.md`
- `docs/identity.md`
- `docs/recording-upload-protocol.md`
- `docs/capture-profile.md`
- `docs/testing.md`

## recommendation

Use one small control contract for recording state and timing:

1. read session snapshot
2. host starts recording
3. browsers clock-sync to the recording epoch
4. host stops recording

Keep real-time delivery optional. The hard contract is request/response JSON. Browsers may learn state changes by polling `GET /api/v1/session`; push or data-channel updates are implementation details.

## scope

This doc defines the browser ↔ session-server contract for:

- session recording phase visibility
- session recording health visibility
- host recording start/stop control
- the shared recording epoch id
- browser clock sync used by `docs/recording-upload-protocol.md`

It does **not** define:

- join and seat-claim semantics
- upload/chunk ingest semantics
- lifecycle escalation rules beyond this protocol surface
- post-process export jobs

## auth

All endpoints are same-origin session-server endpoints.

Authentication uses the active claimed-seat cookie from `docs/seat-claim-protocol.md`.
Role meaning comes from `docs/identity.md`.

Protocol-specific rules:

- requests without a valid claimed seat fail with `401`
- any claimed seat may read session state and call clock sync
- only a claimed `host` seat may start or stop recording
- a LiveKit room connection alone is **not** sufficient

## recording epoch

A recording run has one stable shared id: `recording_epoch_id`.

For v1, one hosted session has at most one recording run.

Rules:

- when recording starts, the server mints one opaque `recording_epoch_id`
- the shared recording zero point is the moment the server accepts the `waiting -> recording` transition
- once minted, `recording_epoch_id` stays stable through `recording`, `draining`, `stopped`, and `failed`
- before recording starts, `recording_epoch_id` is `null`
- browsers must discard any cached local epoch mapping if the observed `recording_epoch_id` changes

`recording_epoch_started_at` is an audit timestamp, not the sync source of truth. Cross-participant alignment uses browser monotonic clocks plus the clock-sync exchange below.

## endpoints

### 1. get session snapshot

`GET /api/v1/session`

Returns the current session recording snapshot for the currently claimed seat.

`recording_state` is the recording phase. `recording_health` is the current trust level of the salvage set.

### success response

```json
{
  "session_id": "sess_01hr...",
  "participant_seat_id": "seat_01hr...",
  "role": "guest",
  "recording_state": "waiting",
  "recording_health": "healthy",
  "recording_epoch_id": null,
  "recording_epoch_started_at": null
}
```

or

```json
{
  "session_id": "sess_01hr...",
  "participant_seat_id": "seat_01hr...",
  "role": "host",
  "recording_state": "recording",
  "recording_health": "healthy",
  "recording_epoch_id": "re_01hr...",
  "recording_epoch_started_at": "2026-03-17T18:02:14.123456Z"
}
```

### response rules

- `role` reflects the claimed seat role, not a client-provided hint
- `recording_state` and `recording_health` use the state model from `docs/session-lifecycle.md`
- `recording_epoch_id` and `recording_epoch_started_at` are both `null` before recording starts
- once recording starts, both remain set for the rest of the hosted run

### 2. start recording

`POST /api/v1/session-recording/start`

Transitions the hosted session into `recording`.

### request body

No body.

### request rules

- caller must own a claimed `host` seat
- allowed only when `session_snapshot.recording_state = 'waiting'`

### successful behavior

On first success, the server must:

- transition `session_snapshot.recording_state` from `waiting` to `recording`
- keep `session_snapshot.recording_health = 'healthy'`
- mint `recording_epoch_id`
- set `recording_epoch_started_at`
- start serving clock-sync responses for that epoch immediately

### idempotency rules

If the session is already in `recording`, return success with the current recording snapshot.

If the session is already in `draining`, `stopped`, or `failed`, return `409`. v1 does not support a second recording run for the same hosted session.

### success response

- `201 Created` on first transition into `recording`
- `200 OK` on idempotent replay while still in `recording`

```json
{
  "session_id": "sess_01hr...",
  "recording_state": "recording",
  "recording_health": "healthy",
  "recording_epoch_id": "re_01hr...",
  "recording_epoch_started_at": "2026-03-17T18:02:14.123456Z"
}
```

### 3. clock sync

`POST /api/v1/session-recording/clock-sync`

Returns the current recording epoch timing needed to map browser `performance.now()` onto the shared session recording timeline.

### request body

No body.

### request rules

- caller must own any claimed seat for this session
- allowed only when `recording_epoch_id` exists
- allowed when `recording_state` is `recording` or `draining`
- degraded runs still allow clock sync for salvageable ongoing capture

### success response

```json
{
  "recording_epoch_id": "re_01hr...",
  "recording_state": "recording",
  "recording_health": "healthy",
  "recording_epoch_started_at": "2026-03-17T18:02:14.123456Z",
  "recording_epoch_elapsed_us": 582034,
  "server_processing_time_us": 900
}
```

### response rules

- `recording_epoch_elapsed_us` is the server's best current value for elapsed time since the shared recording zero point
- the server should compute `recording_epoch_elapsed_us` from a monotonic clock when possible
- `server_processing_time_us` is the time between request receipt and response send on the server, used only to bound uncertainty
- `recording_epoch_started_at` is for logs/audit/debug, not the browser's timing source of truth

### browser algorithm

The browser must measure local monotonic send/receive times around each clock-sync request.

Required v1 behavior:

- run clock sync before starting each new local recording segment
- use that segment's chosen clock-sync estimate to derive both `capture_start_offset_us` and `capture_end_offset_us`
- if the browser reloads, crashes, or otherwise starts a fresh recorder segment, run clock sync again for the current `recording_epoch_id`
- if upload requests stall or the network drops but the same local recorder segment keeps running, do **not** rerun clock sync just for upload resume

Recommended algorithm:

1. take 3 to 5 clock-sync samples
2. for each sample, record:
   - `t0_us` = local `performance.now()` immediately before request send
   - `t3_us` = local `performance.now()` immediately after response receive
3. compute:
   - `rtt_us = t3_us - t0_us`
   - `midpoint_us = t0_us + (rtt_us / 2)`
   - `estimated_local_recording_epoch_us = midpoint_us - recording_epoch_elapsed_us`
4. keep the sample with the lowest `rtt_us`
5. set `clock_sync_uncertainty_us` to at least `(rtt_us / 2) + server_processing_time_us`

This v1 contract does **not** require periodic background resync during one uninterrupted local segment. If later measurements show unacceptable long-run drift, we can extend the protocol with optional periodic sync without changing the segment model.

### 4. stop recording

`POST /api/v1/session-recording/stop`

Transitions the hosted session from `recording` to `draining`.

### request body

No body.

### request rules

- caller must own a claimed `host` seat
- allowed only when `session_snapshot.recording_state` is `recording`, `draining`, or `stopped`

### successful behavior

On first success while the session is `recording`, the server must transition `session_snapshot.recording_state` to `draining` and preserve the current `recording_health`.

### idempotency rules

If the session is already in `draining` or `stopped`, return success with the current recording snapshot.

If the session is still `waiting`, return `409`.

If the session is `failed`, return `409`.

### success response

- `200 OK`

```json
{
  "session_id": "sess_01hr...",
  "recording_state": "draining",
  "recording_health": "degraded",
  "recording_epoch_id": "re_01hr...",
  "recording_epoch_started_at": "2026-03-17T18:02:14.123456Z"
}
```

## lifecycle ownership

`docs/session-lifecycle.md` is the source of truth for:

- valid `recording_state` transitions
- valid `recording_health` transitions
- `degraded` versus `failed`
- when the hosted run becomes `stopped`

This protocol only defines how browsers observe or request those state changes.

## error contract

Use the same error shape as `docs/recording-upload-protocol.md`.

### status codes

- `401 Unauthorized` → no valid claimed seat
- `403 Forbidden` → claimed seat lacks the required role
- `409 Conflict` → invalid state transition, recording already finished, or recording not yet started
- `500 Internal Server Error` → unexpected server failure

### error body

```json
{
  "error": {
    "code": "recording_already_stopped",
    "message": "session sess_01hr... already finished its only v1 recording run"
  }
}
```

## canonical flow

1. browsers join and claim seats
2. browsers read `GET /api/v1/session` and see `recording_state = 'waiting'`
3. host calls `POST /api/v1/session-recording/start`
4. browsers observe `recording_state = 'recording'` via `GET /api/v1/session` or an equivalent real-time update
5. each browser runs 3 to 5 `POST /api/v1/session-recording/clock-sync` probes
6. each browser starts whatever local source instances are active per `docs/capture-profile.md`
7. browsers upload track segments using `docs/recording-upload-protocol.md`
8. host calls `POST /api/v1/session-recording/stop`
9. session remains `draining` until uploads reach terminal state
10. session becomes `stopped`; final `recording_health` tells the host whether the artifact set is clean (`healthy`) or salvage-only (`degraded`)

## non-goals for v1

- multiple recording runs per hosted session
- server push as the only source of truth for recording state
- sample-accurate cross-device sync guarantees from control-plane metadata alone
- per-chunk timing in the control protocol
