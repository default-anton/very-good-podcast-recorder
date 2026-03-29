# testing plan

Related docs:

- `docs/alpha-scope.md`
- `docs/README.md`
- `docs/local-stack.md`
- `docs/artifact-manifest.md`

## recommendation

Build and keep one scriptable **dev-machine multi-seat harness** as the default feedback loop for session-critical work.

For this product, unit tests are necessary but insufficient. The recording path is only credible if we can repeatedly prove, on a normal developer machine, that:

- multiple browsers can join the same real session
- the live call stays up
- each seat records locally
- chunks upload in the background
- reconnects and upload interruptions do not silently corrupt the final result
- the core alpha recording features work under automation

## alpha harness

The first harness should run the **real local stack** from `docs/local-stack.md`, not mocks:

- control plane web app + API
- browser session app
- session API / upload service
- self-hosted LiveKit
- SQLite
- local disk storage

It should drive **3 browser seats** through one session:

- 1 host seat
- 2 guest seats

Use Playwright to launch the browsers with deterministic fake media devices, deterministic display capture, and a deterministic way to create extra camera source instances so the run is repeatable and works headless on a dev machine.

The harness should perform this flow:

1. start the local stack
2. create a session, seats, and join URLs through the control plane
3. launch host and guest browsers
4. verify all seats join the same LiveKit room with the expected seat identities
5. host starts recording
6. hold the session long enough to produce multiple chunks per started source
7. inject the scenario-specific action or failure
8. host stops recording
9. wait for upload drain or resume completion
10. verify manifests, chunk counts, and downloadable session artifacts
11. emit a machine-readable summary and preserve logs on failure

## required signals

Every run should produce text-first artifacts that an agent can inspect without video review:

- harness summary JSON with pass/fail plus per-seat status
- structured control-plane, app, session-server, and LiveKit-related logs with session and seat IDs
- explicit mapping of seat ID → LiveKit participant identity in the summary or logs
- `session.json` showing `recording_epoch_id`, expected seats, expected baseline sources per seat, started source instances per seat, per-track `source_instance_id` / optional `capture_group_id`, capture offset ranges, chunk counts, final `recording_state`, and final `recording_health`
- `track.json` per track segment showing final chunk order, `artifact_status`, and explicit salvage metadata; resume/retry detail may live here or in structured logs
- artifact listing for the final downloadable session folder

A run is not complete if the only proof is "the UI looked right".

For alpha, treat raw chunk files plus manifests as the canonical proof that recording worked. Do **not** make the happy path depend on server-side stitching, muxing, or transcoding.

## must-pass scenarios for alpha

These are the required scenarios for the hosted alpha plan.

### 1. happy path

Goal: prove the baseline system works end to end.

Flow:

- host seat and 2 guest seats join
- host starts recording
- session runs for 20 to 30 seconds
- host stops recording
- uploads finish

Pass criteria:

- all 3 seats joined the live session
- each seat joined with the expected seat ID / LiveKit identity mapping
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
- one seat starts screen share during recording
- if the browser/platform exposes system audio, enable it too
- run long enough to produce multiple chunks for that share episode
- that seat stops screen share while the hosted recording run stays active
- later in the same session, that seat starts screen share again
- run long enough to produce multiple chunks for the later share episode too
- host stops recording
- uploads finish

Pass criteria:

- the screen-sharing seat keeps the same seat ID / LiveKit participant identity throughout
- the live room shows additional published media without creating a second identity
- the session manifest shows at least 2 distinct `screen` `source_instance_id` values for that seat
- if system audio was available for a share episode, the manifest shows a paired `system_audio` source instance with the same `capture_group_id`; if unavailable, that absence is explicit and non-failing
- stopping the first share finishes its track cleanly; it does not become `abandoned` just because the user stopped sharing normally
- every started extra source uploads more than one chunk
- final artifact layout groups chunks/manifests by seat, source, source instance, and segment cleanly

### 3. multi-camera path

Goal: prove one seat can publish and record more than one camera source instance at the same time.

Flow:

- start from the happy path
- one seat, preferably the host, starts recording with a primary camera
- during recording, that same seat enables a second camera source instance
- run long enough to produce multiple chunks for both camera source instances
- optionally stop one camera while the other keeps running
- host stops recording
- uploads finish

Pass criteria:

- the multi-camera seat keeps one seat ID / LiveKit participant identity
- the live room shows multiple published camera tracks under that same identity
- the session manifest shows at least 2 distinct `camera` `source_instance_id` values for that seat
- each started camera source instance uploads more than one chunk
- stopping one camera does not interrupt the other camera source instance
- final artifact layout groups chunks/manifests by seat, source, source instance, and segment cleanly

### 4. reconnect during recording

Goal: prove live call, local capture, and upload recover independently.

Flow:

- start from the happy path
- during recording, force one guest seat browser to disconnect or reload
- let that seat rejoin the same session
- continue recording long enough to produce post-reconnect chunks
- stop recording and finish uploads

Pass criteria:

- other seats stay in the call
- the rejoined seat returns without creating an ambiguous duplicate identity
- the rejoined seat keeps the same seat ID / LiveKit participant identity
- pre-disconnect chunks remain present
- post-reconnect chunks append cleanly
- final manifest shows one coherent track timeline or an explicit, non-silent split that tooling can understand
- segment capture offsets stay monotonic and line up on the shared session recording timeline

### 5. upload stall and resume

Goal: prove a broken upload path does not kill the session or silently drop recorded media.

Flow:

- start from the happy path
- during recording, block or delay upload requests for one guest seat
- keep the live session running
- restore uploads
- wait for backlog drain
- stop recording

Pass criteria:

- live session stays healthy while uploads are stalled
- the stalled seat continues producing local chunks
- uploads retry or resume without restarting from zero
- if the local recorder never restarted, the stalled seat keeps the same segment identity and does not need a fresh clock sync
- manifest makes the interruption explicit
- final uploaded chunk set is complete or the missing range is explicit and detectable

## interim frontend shell smoke [done]

Until the real multi-seat local stack exists, keep one fast Playwright smoke for each frontend root:

- `e2e/scenarios/control-shell.spec.ts`
- `e2e/scenarios/session-shell.spec.ts`

Rules:

- boot both Vite apps from `playwright.config.ts`; do **not** keep frontend coverage hard-wired to one app server
- assert one narrow and one wide viewport for the required setup/join/room shell controls
- assert no horizontal scroll for the core actions under those viewports
- treat these as fast shell proof only, not as a replacement for the real local-stack harness above

## later scenarios

These still matter, but they are **not** alpha must-pass before the first hosted cut ships:

- active seat takeover during recording
- localized track failure with continued salvage
- terminal session-level recording failure
- network impairments beyond the basic reconnect/upload-resume loop

Add them after the 5 alpha scenarios above are reliable.

## implementation order

Build this in small increments:

1. **harness foundation**: one command starts the local stack, launches browsers, and emits summary JSON
2. **happy path**
3. **repeated screen-share path**
4. **multi-camera path**
5. **reconnect**
6. **upload stall/resume**
7. later hardening scenarios

The first useful slice is not a huge matrix. It is one reliable happy-path run, then the 4 alpha-specific expansions above.

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
- the local multi-seat harness covers the changed path
- the narrowest relevant alpha scenario passes locally
- if the change touches one of the 5 alpha scenarios above, that scenario stays green
