# v1 capture profile

Related docs:

- `README.md`
- `docs/architecture.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/testing.md`
- `docs/remaining-specs.md`

## recommendation

Lock v1 to one boring, shippable capture profile:

- **one local mic track per participant**
- **one local camera track per participant**
- **browser-native WebM recording**
- **Chromium-first support**
- **1080p30 target video**, with **720p30 fallback**
- **48 kHz Opus audio**, **mono preferred**

Do **not** target 2K, 4K, 60 fps, HDR, or studio-grade browser audio controls in v1.

Reliability beats headline specs. A stable 1080p local track is better than flaky 4K.

## what we record

For each participant seat, v1 records exactly 2 local tracks:

- `audio` = microphone
- `video` = camera

These are the canonical recording artifacts.

The live room media exists for conversation and monitoring. It is **not** the source of truth for final recording quality.

v1 does **not** require:

- screen share recording
- server-side mixed program recording
- server-side composited video
- server-side mux/transcode as part of recording success

## v1 capture profile

### video

- **target resolution:** `1920x1080`
- **target frame rate:** `30 fps`
- **fallback resolution:** `1280x720`
- **fallback frame rate:** `30 fps`
- **container:** browser-native `video/webm`

Rules:

- Request 1080p30 first.
- If the browser, device, or encoder cannot sustain it, fall back to 720p30.
- Do not fail recording just because 1080p is unavailable.
- Do not advertise or optimize for capture above 1080p in v1.

### audio

- **target codec/container:** browser-native `audio/webm` with Opus
- **target sample rate:** `48 kHz`
- **channel policy:** `mono` preferred for speech; accept browser-provided stereo if the platform does not honor mono cleanly

Rules:

- Prioritize stable speech capture over bitrate tweaking.
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

- browser-reported `mime_type`
- actual video width
- actual video height
- actual video frame rate when observable
- actual audio sample rate when observable
- actual audio channel count when observable

The exact manifest/schema can land with the artifact manifest spec. The product decision is locked now: target 1080p30 video and 48 kHz Opus audio, while preserving the actual negotiated result.

## non-goals for v1

- 2K or 4K local recording
- 60 fps recording
- HDR capture
- browser-independent codec guarantees beyond WebM-based recording
- sample-accurate promises from browser capture settings alone
- broad support beyond modern Chromium-based browsers before the baseline is stable
