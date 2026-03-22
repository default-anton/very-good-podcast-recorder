# v1 capture profile

Related docs:

- `README.md`
- `docs/architecture.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/artifact-manifest.md`
- `docs/testing.md`
- `docs/remaining-specs.md`

## recommendation

Lock v1 to one boring, shippable capture profile:

- **one local mic source instance per participant seat**
- **one or more local camera source instances per participant seat**
- **zero or more local screen-share source instances per participant seat during a recording run**
- **zero or one paired local system-audio source instance for each active screen-share source instance when the browser/platform exposes it**
- **browser-native WebM recording**
- **Chromium-first support**
- **1080p30 target video**, with **720p30 fallback**
- **48 kHz Opus audio**, **mono preferred**

Do **not** target 2K, 4K, 60 fps, HDR, or studio-grade browser audio controls in v1.

Reliability beats headline specs. A stable 1080p local track is better than flaky 4K.

## what we record

Use this model throughout v1:

- `source` = coarse capture type: `mic`, `camera`, `screen`, `system_audio`
- `source_instance` = one logical capture device or one screen-share episode under one seat
- `segment` = one uninterrupted recorder run for that source instance

For each participant seat, v1 records these source types:

- `mic` = microphone audio, usually one source instance per seat
- `camera` = one or more camera video source instances, for example a webcam plus an overhead camera
- `screen` = zero or more display-capture source instances over the lifetime of the recording run
- `system_audio` = optional display-capture system audio source instance paired with one `screen` source instance when available

`mic` is the baseline source. One camera source is the baseline video source, but a seat may add more camera source instances. `screen` is optional per seat and may start, stop, and start again during the same recording run. `system_audio` is optional and best-effort: if the browser, OS, or capture surface does not expose it, screen recording still succeeds without it.

These source-instance tracks are the canonical recording artifacts.

The live room media exists for conversation and monitoring. It is **not** the source of truth for final recording quality.

v1 still does **not** require:

- server-side mixed program recording
- server-side composited video
- server-side mux/transcode as part of recording success

## v1 capture profile

### camera video

- **target resolution:** `1920x1080`
- **target frame rate:** `30 fps`
- **fallback resolution:** `1280x720`
- **fallback frame rate:** `30 fps`
- **container:** browser-native `video/webm`

Rules:

- Request 1080p30 first for each camera source instance.
- If the browser, device, or encoder cannot sustain it, fall back to 720p30.
- Do not fail recording just because 1080p is unavailable.
- Different camera source instances on the same seat may negotiate different actual settings; preserve what each one actually produced.
- Do not advertise or optimize for capture above 1080p in v1.

### screen video

- **target frame rate:** `30 fps`
- **target resolution policy:** prefer `1920x1080`-class output when the browser lets us constrain it; otherwise accept the browser-provided display-capture resolution and record the actual result
- **container:** browser-native `video/webm`

Rules:

- Treat screen capture as a separate source from the camera.
- Do not fail the whole recording because one seat never starts screen share.
- Stopping screen share during recording is normal. Finish the current screen source instance cleanly instead of treating it as an error.
- Starting screen share again later in the same recording run creates a new screen source instance.
- If the browser reloads or reconnects while one screen-share episode is still active, keep the same source instance and create the next segment for it.
- If the browser only exposes a higher or lower display-capture resolution, keep recording and report the actual settings in metadata.
- Do not make v1 correctness depend on perfect DPI-accurate screen capture on every platform.

### audio

- **target codec/container:** browser-native `audio/webm` with Opus
- **target sample rate:** `48 kHz`
- **channel policy:** `mono` preferred for mic; accept browser-provided stereo if the platform does not honor mono cleanly

Rules:

- Prioritize stable speech capture over bitrate tweaking.
- Treat `mic` and `system_audio` as separate audio sources when both exist.
- `system_audio` is best-effort and depends on browser + OS + chosen display-capture surface.
- Pair each `system_audio` source instance with the `screen` source instance created by the same user share action.
- Do not fail screen recording just because system audio is unavailable.
- Do not depend on browser-specific "pro audio" knobs for v1 correctness.
- Do not require raw PCM, WAV, or lossless browser capture in v1.

## browser reality rules

Browsers give us partial control, not absolute control.

We can request capture settings, but the browser and device may ignore or downgrade them.

For v1:

- define a **target** profile
- define a **fallback** profile
- expose the **actual recorded settings** in final artifact metadata

At minimum, the final artifact metadata should include per track:

- browser-reported `source`
- browser-generated `source_instance_id`
- browser-reported `mime_type`
- optional `capture_group_id` for paired `screen` + `system_audio` instances from the same share action
- actual video width
- actual video height
- actual video frame rate when observable
- actual audio sample rate when observable
- actual audio channel count when observable

The exact manifest/schema is owned by `docs/artifact-manifest.md`. The product decision is locked now: support per-seat `mic`, one or more `camera` source instances, repeatable optional `screen` source instances, and optional best-effort paired `system_audio` source instances, while preserving the actual negotiated result for each recorded source instance.

## non-goals for v1

- 2K or 4K local recording
- 60 fps recording
- HDR capture
- browser-independent codec guarantees beyond WebM-based recording
- sample-accurate promises from browser capture settings alone
- broad support beyond modern Chromium-based browsers before the baseline is stable
