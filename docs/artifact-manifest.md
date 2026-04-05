# v1 artifact manifest

Related docs:

- `docs/README.md`
- `docs/capture-profile.md`
- `docs/recording-control-protocol.md`
- `docs/recording-upload-protocol.md`
- `docs/session-lifecycle.md`
- `docs/testing.md`

## recommendation

Use exactly 2 JSON manifests:

1. `session.json` at the session artifact root
2. `track.json` in each track-segment directory

Keep paths, filenames, and IDs stable.
Do **not** add a third manifest type for v1.
Structured logs can carry extra debugging detail.
Treat `session.json` and `seats/**` as a managed artifact namespace: SQLite is the durable source of truth for which manifests and chunk files belong there, and startup rebuilds should prune stale files that are no longer referenced by SQLite.

## scope

This doc defines:

- session artifact directory layout
- `session.json` required fields
- `track.json` required fields
- `artifact_status` values
- file naming rules

It does **not** define:

- upload endpoints or retry protocol details
- session or track lifecycle state machines
- stitched exports, muxed outputs, or post-processing jobs

## directory layout [done]

```text
sessions/<session_id>/
  session.json
  seats/
    <participant_seat_id>/
      <source>/
        <source_instance_id>/
          segment-0000/
            track.json
            chunk-000000.webm
            chunk-000001.webm
          segment-0001/
            track.json
            chunk-000000.webm
```

Rules:

- `<source>` is one of `mic`, `camera`, `screen`, `system_audio`
- one segment directory maps to one `recording_track_id`
- `segment-0000` matches `segment_index = 0`
- all paths stored in manifests are relative paths

## `session.json` [done]

Purpose: session-level summary and index.

Required top-level fields:

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | integer | `1` for this doc |
| `session_id` | string | session artifact root ID |
| `recording_epoch_id` | string | shared recording epoch |
| `recording_state` | string | final hosted recording phase |
| `recording_health` | string | final hosted recording health |
| `started_at` | string \| null | RFC 3339 UTC |
| `stopped_at` | string \| null | RFC 3339 UTC |
| `seats` | array | one row per participant seat |

Required `seats[]` fields:

| Field | Type | Notes |
| --- | --- | --- |
| `participant_seat_id` | string | durable seat ID |
| `role` | string | host or guest role label |
| `expected_baseline_sources` | array | v1 baseline expectations for that seat |
| `tracks` | array | one summary row per recorded segment |

Required `tracks[]` summary fields:

| Field | Type | Notes |
| --- | --- | --- |
| `recording_track_id` | string | track-segment ID |
| `source` | string | `mic`, `camera`, `screen`, `system_audio` |
| `source_instance_id` | string | logical source instance |
| `capture_group_id` | string \| null | shared screen/system-audio pair ID |
| `kind` | string | `audio` or `video` |
| `segment_index` | integer | 0-based |
| `artifact_status` | string | see status table below |
| `chunk_count` | integer | durable chunk count |
| `bytes` | integer | total durable bytes |
| `capture_start_offset_us` | integer | relative to `recording_epoch_id` |
| `capture_end_offset_us` | integer \| null | relative to `recording_epoch_id` |
| `path` | string | segment directory relative to session root |

Example:

```json
{
  "schema_version": 1,
  "session_id": "sess_01hr...",
  "recording_epoch_id": "re_01hr...",
  "recording_state": "stopped",
  "recording_health": "healthy",
  "started_at": "2026-03-21T18:00:00Z",
  "stopped_at": "2026-03-21T18:23:14Z",
  "seats": [
    {
      "participant_seat_id": "seat_01hr...",
      "role": "host",
      "expected_baseline_sources": ["mic", "camera"],
      "tracks": [
        {
          "recording_track_id": "trk_01hr...",
          "source": "mic",
          "source_instance_id": "src_mic_01hr...",
          "capture_group_id": null,
          "kind": "audio",
          "segment_index": 0,
          "artifact_status": "complete",
          "chunk_count": 12,
          "bytes": 1839201,
          "capture_start_offset_us": 0,
          "capture_end_offset_us": 23123000,
          "path": "seats/seat_01hr.../mic/src_mic_01hr.../segment-0000"
        }
      ]
    }
  ]
}
```

## `track.json` [done]

Purpose: one track-segment manifest with chunk listing and salvage metadata.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | integer | `1` for this doc |
| `session_id` | string | owning session |
| `recording_epoch_id` | string | shared recording epoch |
| `participant_seat_id` | string | owning seat |
| `recording_track_id` | string | track-segment ID |
| `source` | string | `mic`, `camera`, `screen`, `system_audio` |
| `source_instance_id` | string | logical source instance |
| `capture_group_id` | string \| null | optional pair ID |
| `kind` | string | `audio` or `video` |
| `segment_index` | integer | 0-based |
| `artifact_status` | string | see status table below |
| `mime_type` | string | actual recorder MIME type |
| `capture_start_offset_us` | integer | relative to `recording_epoch_id` |
| `capture_end_offset_us` | integer \| null | relative to `recording_epoch_id` |
| `clock_sync_uncertainty_us` | integer | segment-level clock-sync uncertainty |
| `actual_capture_settings` | object | actual negotiated result |
| `chunks` | array | durable chunk listing in append order |
| `salvage` | object | explicit missing/error metadata |

Required `actual_capture_settings` fields:

| Field | Type | Notes |
| --- | --- | --- |
| `audio_sample_rate_hz` | integer \| null | when observable |
| `audio_channel_count` | integer \| null | when observable |
| `video_width` | integer \| null | when observable |
| `video_height` | integer \| null | when observable |
| `video_frame_rate` | number \| null | when observable |

Required `chunks[]` fields:

| Field | Type | Notes |
| --- | --- | --- |
| `chunk_index` | integer | 0-based append order |
| `file` | string | filename relative to the segment directory |
| `bytes` | integer | durable file size |
| `sha256` | string | lowercase hex digest |

Required `salvage` fields:

| Field | Type | Notes |
| --- | --- | --- |
| `missing_chunk_ranges` | array | explicit missing ranges, else `[]` |
| `error_code` | string \| null | stable machine code |
| `error_message` | string \| null | operator-readable summary |

Example:

```json
{
  "schema_version": 1,
  "session_id": "sess_01hr...",
  "recording_epoch_id": "re_01hr...",
  "participant_seat_id": "seat_01hr...",
  "recording_track_id": "trk_01hr...",
  "source": "mic",
  "source_instance_id": "src_mic_01hr...",
  "capture_group_id": null,
  "kind": "audio",
  "segment_index": 0,
  "artifact_status": "complete",
  "mime_type": "audio/webm;codecs=opus",
  "capture_start_offset_us": 0,
  "capture_end_offset_us": 23123000,
  "clock_sync_uncertainty_us": 8000,
  "actual_capture_settings": {
    "audio_sample_rate_hz": 48000,
    "audio_channel_count": 1,
    "video_width": null,
    "video_height": null,
    "video_frame_rate": null
  },
  "chunks": [
    {
      "chunk_index": 0,
      "file": "chunk-000000.webm",
      "bytes": 151203,
      "sha256": "..."
    },
    {
      "chunk_index": 1,
      "file": "chunk-000001.webm",
      "bytes": 149882,
      "sha256": "..."
    }
  ],
  "salvage": {
    "missing_chunk_ranges": [],
    "error_code": null,
    "error_message": null
  }
}
```

## `artifact_status` [done]

Keep artifact status separate from upload/session lifecycle state.

| Value | Meaning |
| --- | --- |
| `complete` | segment finished and all durable chunks are present |
| `partial` | some durable media exists, but the set is incomplete or has explicit gaps |
| `missing` | the segment has no durable media bytes |
| `failed` | a terminal artifact/manifest failure happened; salvage may still exist |

## file rules [done]

- filenames are fixed: `session.json`, `track.json`, `segment-0000`, `chunk-000000.webm`
- use zero-padded numeric indexes for segment and chunk directories/files
- IDs that become artifact path components must be path-safe opaque tokens; do not use `/`, `\\`, `.` or `..` as path segments
- store capture offsets as integer microseconds
- store wall-clock timestamps as RFC 3339 UTC strings
- store only actual capture settings, not requested constraints
- do not put display names, timestamps, or random labels in artifact paths

## non-goals

Do **not** add v1 fields for:

- stitched exports
- waveforms or thumbnails
- per-chunk timing metadata
- transcoding outputs
- browser-specific debug blobs when structured logs already cover them
