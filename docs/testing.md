# testing plan

## recommendation

Build and keep one scriptable **dev-machine multi-participant harness** as the default feedback loop for session-critical work.

For this product, unit tests are necessary but insufficient. The recording path is only credible if we can repeatedly prove, on a normal developer machine, that:

- multiple browsers can join the same real session
- the live call stays up
- each participant records locally
- chunks upload in the background
- reconnects and upload interruptions do not silently corrupt the final result

## first harness

The first harness should run the **real local stack**, not mocks:

- control plane web app + API
- browser session app
- temporary session API / upload service
- LiveKit
- SQLite
- local disk storage

It should drive **3 browser participants** through one session:

- 1 host
- 2 guests

Use Playwright to launch the browsers with deterministic fake media devices so the run is repeatable and works headless on a dev machine.

The harness should perform this flow:

1. start the local stack
2. create a session, participant records, and join URLs/tokens through the control plane
3. launch host and guest browsers
4. verify all participants join the same live session
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
- structured control-plane, app, and server logs with session and participant IDs
- session manifest showing expected participants, tracks, chunk counts, and final status
- per-track upload manifest showing append order and any resume/retry events
- artifact listing for the final downloadable session folder

A run is not complete if the only proof is "the UI looked right".

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
- all expected local tracks were created
- each track uploaded more than one chunk
- session manifest marks all expected tracks complete
- final artifact layout matches the manifest

### 2. guest reconnect during recording

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
- pre-disconnect chunks remain present
- post-reconnect chunks append cleanly
- final manifest shows one coherent track timeline or an explicit, non-silent split that tooling can understand

### 3. upload stall and resume

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
- manifest makes the interruption explicit
- final uploaded chunk set is complete or the missing range is explicit and detectable

## implementation order

Build this in small increments:

1. **harness foundation**: one command starts the local stack, launches browsers, and emits summary JSON
2. **happy path**: get one stable green end-to-end run
3. **reconnect**: add deterministic disconnect/rejoin control
4. **upload stall/resume**: add deterministic upload failure injection
5. **network impairments**: add packet loss, latency, and bandwidth shaping once the basic harness is trustworthy

The first useful milestone is not a huge matrix. It is one reliable happy-path run plus one reliable failure-mode run.

## defaults

- run on the developer machine, not a remote VM
- prefer headless execution with fake media
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
