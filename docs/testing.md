# testing plan

Related docs:

- `docs/README.md`
- `docs/local-stack.md`
- `docs/artifact-manifest.md`

## recommendation

Build and keep one scriptable **dev-machine multi-participant harness** as the default feedback loop for session-critical work.

For this product, unit tests are necessary but insufficient. The recording path is only credible if we can repeatedly prove, on a normal developer machine, that:

- multiple browsers can join the same real session
- the live call stays up
- each participant records locally
- chunks upload in the background
- reconnects, takeovers, and upload interruptions do not silently corrupt the final result
- terminal failures stay explicit and inspectable

## first harness

The first harness should run the **real local stack** from `docs/local-stack.md`, not mocks:

- control plane web app + API
- browser session app
- temporary session API / upload service
- self-hosted LiveKit
- SQLite
- local disk storage

It should drive **3 browser participants** through one session:

- 1 host
- 2 guests

Use Playwright to launch the browsers with deterministic fake media devices, a deterministic fake display-capture source, and a deterministic way to create extra camera source instances so the run is repeatable and works headless on a dev machine.

The harness should perform this flow:

1. start the local stack
2. create a session, participant records, and join URLs through the control plane
3. launch host and guest browsers
4. verify all participants join the same LiveKit room with the expected seat identities
5. host starts recording
6. hold the session long enough to produce multiple chunks per participant
7. inject one failure for the scenario under test
8. host stops recording
9. wait for upload drain / resume completion
10. verify manifests, chunk counts, and downloadable session artifacts
11. emit a machine-readable summary and preserve logs on failure

## required signals

Every run should produce text-first artifacts that an agent can inspect without video review:

- harness summary JSON with pass/fail plus per-participant status
- structured control-plane, app, session-server, and LiveKit-related logs with session and participant IDs
- explicit mapping of seat ID → LiveKit participant identity in the summary or logs
- `session.json` showing `recording_epoch_id`, expected participants, expected baseline sources per seat, started source instances per seat, per-track `source_instance_id` / optional `capture_group_id`, capture offset ranges, chunk counts, final `recording_state`, and final `recording_health`
- `track.json` per track segment showing final chunk order, `artifact_status`, and explicit salvage metadata; resume/retry detail may live here or in structured logs
- artifact listing for the final downloadable session folder

A run is not complete if the only proof is "the UI looked right".

For v1, treat raw chunk files plus manifests as the canonical proof that recording worked. Do **not** make the happy path depend on server-side stitching, muxing, or transcoding.

## must-pass first scenarios

Start with these scenarios in order. Do not skip to broader coverage before the earlier ones are reliable.

### 1. happy path

Goal: prove the baseline system works end to end.

Flow:

- host and 2 guests join
- host starts recording
- session runs for 20 to 30 seconds
- host stops recording
- uploads finish

Pass criteria:

- all 3 participants joined the live session
- each participant joined with the expected seat ID / LiveKit identity mapping
- all expected baseline local source instances were created
- each baseline track uploaded more than one chunk
- session manifest marks all expected baseline source instances complete
- final session result is `stopped + healthy`
- segment capture offsets are present and plausible for all tracks
- final artifact layout matches the manifest

### 2. repeated screen-share path

Goal: prove one seat can add and remove optional recording sources without breaking the base model.

Flow:

- start from the happy path
- one participant starts screen share during recording
- if the browser/platform exposes system audio, enable it too
- run long enough to produce multiple chunks for that share episode
- the participant stops screen share while the hosted recording run stays active
- later in the same session, the participant starts screen share again
- run long enough to produce multiple chunks for the later share episode too
- host stops recording
- uploads finish

Pass criteria:

- the screen-sharing participant keeps the same seat ID / LiveKit participant identity throughout
- the live room shows additional published media without creating a second participant identity
- the session manifest shows at least 2 distinct `screen` `source_instance_id` values for that seat
- if system audio was available for a share episode, the manifest shows a paired `system_audio` source instance with the same `capture_group_id`; if unavailable, that absence is explicit and non-failing
- stopping the first share finishes its track cleanly; it does not become `abandoned` just because the user stopped sharing normally
- every started extra source uploads more than one chunk
- final artifact layout groups chunks/manifests by seat, source, source instance, and segment cleanly

### 3. multi-camera path

Goal: prove one seat can publish and record more than one camera source instance at the same time.

Flow:

- start from the happy path
- one participant, preferably the host, starts recording with a primary camera
- during recording, that same seat enables a second camera source instance
- run long enough to produce multiple chunks for both camera source instances
- optionally stop one camera while the other keeps running
- host stops recording
- uploads finish

Pass criteria:

- the multi-camera participant keeps one seat ID / LiveKit participant identity
- the live room shows multiple published camera tracks under that same participant identity
- the session manifest shows at least 2 distinct `camera` `source_instance_id` values for that seat
- each started camera source instance uploads more than one chunk
- stopping one camera does not interrupt the other camera source instance
- final artifact layout groups chunks/manifests by seat, source, source instance, and segment cleanly

### 4. guest reconnect during recording

Goal: prove live call, local capture, and upload recover independently.

Flow:

- start from the happy path
- during recording, force one guest browser to disconnect or reload
- let the guest rejoin the same session
- continue recording long enough to produce post-reconnect chunks
- stop recording and finish uploads

Pass criteria:

- other participants stay in the call
- the rejoined guest returns without creating an ambiguous duplicate identity
- the rejoined guest keeps the same seat ID / LiveKit participant identity
- pre-disconnect chunks remain present
- post-reconnect chunks append cleanly
- final manifest shows one coherent track timeline or an explicit, non-silent split that tooling can understand
- segment capture offsets stay monotonic and line up on the shared session recording timeline

### 5. upload stall and resume

Goal: prove a broken upload path does not kill the session or silently drop recorded media.

Flow:

- start from the happy path
- during recording, block or delay upload requests for one guest
- keep the live session running
- restore uploads
- wait for backlog drain
- stop recording

Pass criteria:

- live session stays healthy while uploads are stalled
- stalled participant continues producing local chunks
- uploads retry or resume without restarting from zero
- if the local recorder never restarted, the stalled participant keeps the same segment identity and does not need a fresh clock sync
- manifest makes the interruption explicit
- final uploaded chunk set is complete or the missing range is explicit and detectable

### 6. active seat takeover during recording

Goal: prove one-seat-one-browser ownership holds under explicit takeover.

Flow:

- start from the happy path
- while one guest is active, launch a second browser on the same role link
- explicitly take over that same guest seat
- continue recording long enough to produce post-takeover chunks
- stop recording and finish uploads

Pass criteria:

- the old and new browser are never both accepted as active owners for the same seat
- the new browser keeps the same seat ID / LiveKit participant identity
- the old browser starts failing claim-authenticated requests promptly
- pre-takeover chunks remain present
- post-takeover chunks are appended as a new explicit segment or otherwise remain non-silent in the manifest
- any unfinished pre-takeover segment becomes `abandoned`, not silently overwritten

### 7. localized track failure with continued salvage

Goal: prove one failed track does not hard-stop unaffected recording and upload work.

Flow:

- start from the happy path
- after at least one track has accepted work, inject a terminal storage commit or manifest failure for exactly one track
- keep the session running long enough for unaffected tracks to continue producing chunks
- host stops recording
- wait for unaffected backlog drain
- inspect final session and track states plus preserved artifacts

Pass criteria:

- the affected track moves to `failed`
- the hosted recording run stays active long enough to keep accepting unaffected work under the normal phase rules
- final session result is `stopped + degraded`
- unaffected tracks continue uploading and can still finish cleanly
- already committed chunks remain present on disk
- final salvage manifest makes the failed track and any missing ranges explicit

### 8. terminal session-level recording failure

Goal: prove truly unrecoverable server-side recording failure is explicit and inspectable.

Flow:

- start from the happy path
- after at least one track has accepted work, inject a session-level failure that makes the broader salvage set untrustworthy
- let the system attempt its normal cleanup path
- inspect final session and track states plus preserved artifacts

Pass criteria:

- the hosted recording result moves to `failed + failed`
- new recording/upload mutations are rejected after failure, except exact idempotent replays
- already committed chunks remain present on disk when storage is still readable
- failure manifest or equivalent summary makes the terminal failure explicit

## implementation order

Build this in small increments:

1. **harness foundation**: one command starts the local stack, launches browsers, and emits summary JSON
2. **happy path**: get one stable green end-to-end run
3. **repeated screen-share path**: add deterministic display capture and optional system-audio assertions across multiple share episodes
4. **multi-camera path**: add deterministic extra-camera assertions under one seat identity
5. **reconnect**: add deterministic disconnect/rejoin control
6. **upload stall/resume**: add deterministic upload failure injection
7. **seat takeover**: add deterministic second-browser takeover control and stale-claim assertions
8. **localized track failure**: add deterministic one-track failure injection and degraded-salvage assertions
9. **terminal failure**: add deterministic session-level failure injection and artifact assertions
10. **network impairments**: add packet loss, latency, and bandwidth shaping once the basic harness is trustworthy

The first useful slice is not a huge matrix. It is one reliable happy-path run plus one reliable failure-mode run.

## defaults

- run on the developer machine, not a remote VM
- prefer headless execution with fake media, deterministic display capture, and deterministic extra-camera sources
- keep scenario inputs deterministic
- prefer one-command execution
- fail with actionable output and preserved artifacts
- extend the existing harness for new failure modes instead of building parallel ad hoc tests

## non-goals for the first slice

- cross-browser coverage beyond one modern Chromium-based browser
- visual assertions for layout polish
- server-side transcoding or final media quality analysis
- large-scale load testing
- perfect network simulation before the basic local harness exists

## done means

For join/session/recording/upload/reconnect work, "done" means:

- relevant unit tests pass
- the local multi-participant harness covers the changed path
- at least one reality-like end-to-end scenario passes locally
- if the change touches failure handling, a failure-mode scenario also passes locally
