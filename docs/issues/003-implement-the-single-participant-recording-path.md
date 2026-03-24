# issue 003: implement the single-participant recording path

Related docs:

- `docs/capture-profile.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/artifact-manifest.md`
- `docs/session-lifecycle.md`
- `docs/testing.md`
- `docs/ux-contract.md`

## goal

Make one claimed host seat start and stop a recording run, record its local mic plus primary camera, and upload those chunks durably to `sessiond`.

## why now

This is the first slice that proves the product's actual value.
If we cannot reliably get one participant's local tracks onto disk with explicit manifests, the rest is noise.

This is the third slice from `docs/feedback-loop.md`.

## scope

- implement the recording control endpoints from `docs/recording-control-protocol.md`:
  - `GET /api/v1/session`
  - `POST /api/v1/session-recording/start`
  - `POST /api/v1/session-recording/clock-sync`
  - `POST /api/v1/session-recording/stop`
- mint and persist one `recording_epoch_id` per hosted run
- in the session app, start local recording for exactly these baseline sources:
  - one `mic` source instance
  - one `camera` source instance
- use browser-native WebM recording in rolling chunks
- implement the upload protocol from `docs/recording-upload-protocol.md` for:
  - `start track`
  - `upload chunk`
  - `finish track`
- durably store raw chunks plus `session.json` and `track.json` manifests under the local artifact root
- expose separate live, local-capture, and upload status signals in the minimal room UI
- add one deterministic recording scenario that exercises one joined host browser end to end
- include at least one idempotency check for replayed `start track` or `upload chunk`

## acceptance criteria

- a claimed host seat can start recording and stop recording from the session UI
- `GET /api/v1/session` returns the correct `recording_state`, `recording_health`, and `recording_epoch_id`
- the browser records more than one chunk for both the mic track and the camera track
- `sessiond` accepts the track lifecycle and writes durable chunk files to disk
- the final `session.json` and `track.json` manifests include:
  - `recording_epoch_id`
  - `participant_seat_id`
  - `source`
  - `source_instance_id`
  - `segment_index`
  - capture offsets
  - chunk counts
  - final health / state
- the happy-path run ends as `stopped + healthy`
- replaying the chosen idempotency case does not duplicate rows or corrupt artifact state
- the scenario emits a machine-readable summary and preserves logs on failure

## feedback loop

Use one deterministic, headless recording proof:

- `vgpr setup local`
- `pnpm exec playwright test e2e/scenarios/single-participant-recording.spec.ts`
- harness summary JSON
- `session.json` and `track.json` artifacts under `.vgpr/local/artifacts/`
- structured logs with `session_id`, `participant_seat_id`, `recording_epoch_id`, `recording_track_id`, and `chunk_index`

## out of scope

- guests recording at the same time
- screen share
- system audio
- multi-camera
- reconnect
- upload stall / resume
- download assembly or export integrations
