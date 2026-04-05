import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildHarnessSummaryPath,
  createHarnessSummary,
  writeHarnessSummary,
} from "../fixtures/summary";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("harness summary", () => {
  it("loads manifests, inventories artifacts, and writes machine-readable summary json", async () => {
    const cwd = await createTempRepo();
    const sessionRoot = path.join(cwd, ".vgpr/local/artifacts/amber-session-01");

    await writeFile(
      path.join(sessionRoot, "session.json"),
      `${JSON.stringify(sessionManifest())}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/track.json"),
      `${JSON.stringify(trackManifest())}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000000.webm"),
      "chunk-zero",
      "utf8",
    );

    const summary = await createHarnessSummary({
      checks: [
        {
          code: "seat_identity_map_present",
          message: "Seat identity mapping was captured.",
          status: "passed",
        },
      ],
      cwd,
      finishedAt: "2026-04-04T12:00:02.000Z",
      scenarioName: "happy-path",
      scenarioStatus: "passed",
      seatIdentityMap: [
        {
          livekit_participant_identity: "seat-host-01",
          participant_seat_id: "seat-host-01",
          role: "host",
          room: "amber-session-01",
        },
      ],
      sessionId: "amber-session-01",
      startedAt: "2026-04-04T12:00:00.000Z",
    });
    const summaryPath = await writeHarnessSummary(
      summary,
      buildHarnessSummaryPath("happy-path", cwd),
    );
    const persisted = JSON.parse(await readFile(summaryPath, "utf8")) as typeof summary;

    expect(summary.validation.passed).toBe(true);
    expect(summary.artifact_listing).toEqual([
      "seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000000.webm",
      "seats/seat-host-01/mic/src-mic-01/segment-0000/track.json",
      "session.json",
    ]);
    expect(summary.session.track_manifests).toHaveLength(1);
    expect(summary.session.track_manifests[0]).toMatchObject({
      chunk_files: ["seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000000.webm"],
      session_track_summary: {
        bytes: 10,
        chunk_count: 1,
        recording_track_id: "trk-host-mic-01",
      },
      track_manifest_path: "seats/seat-host-01/mic/src-mic-01/segment-0000/track.json",
    });
    expect(summary.validation.checks).toContainEqual({
      code: "artifact_tree_matches_manifest",
      message: "Artifact listing matches the exact session.json + track.json file set.",
      status: "passed",
    });
    expect(summary.validation.checks).toContainEqual({
      code: "track_summary_matches_track_manifest_trk-host-mic-01",
      message: "Track trk-host-mic-01 summary matches session.json and track.json.",
      status: "passed",
    });
    expect(summary.scenario.duration_ms).toBe(2000);
    expect(persisted.validation.passed).toBe(true);
  });

  it("fails validation when a track manifest references a missing chunk file", async () => {
    const cwd = await createTempRepo();
    const sessionRoot = path.join(cwd, ".vgpr/local/artifacts/amber-session-01");
    const brokenTrack = trackManifest();

    brokenTrack.chunks.push({
      bytes: 7,
      chunk_index: 1,
      file: "chunk-000001.webm",
      sha256: "b".repeat(64),
    });

    await writeFile(
      path.join(sessionRoot, "session.json"),
      `${JSON.stringify(sessionManifest())}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/track.json"),
      `${JSON.stringify(brokenTrack)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000000.webm"),
      "chunk-zero",
      "utf8",
    );

    const summary = await createHarnessSummary({
      cwd,
      finishedAt: "2026-04-04T12:00:03.000Z",
      scenarioName: "happy-path",
      scenarioStatus: "failed",
      sessionId: "amber-session-01",
      startedAt: "2026-04-04T12:00:00.000Z",
    });

    expect(summary.validation.passed).toBe(false);
    expect(summary.validation.checks).toContainEqual({
      code: "track_files_present_trk-host-mic-01",
      details: {
        missing_files: ["seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000001.webm"],
      },
      message: "Track trk-host-mic-01 is missing one or more chunk files.",
      status: "failed",
    });
    expect(summary.validation.checks).toContainEqual({
      code: "artifact_tree_matches_manifest",
      details: {
        missing_files: ["seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000001.webm"],
        unexpected_files: [],
      },
      message: "Artifact listing does not match the exact session.json + track.json file set.",
      status: "failed",
    });
  });

  it("fails validation when session.json drifts from track.json or orphan files remain on disk", async () => {
    const cwd = await createTempRepo();
    const sessionRoot = path.join(cwd, ".vgpr/local/artifacts/amber-session-01");
    const staleSession = sessionManifest();

    staleSession.seats[0].tracks[0].bytes = 99;
    staleSession.seats[0].tracks[0].chunk_count = 3;

    await writeFile(
      path.join(sessionRoot, "session.json"),
      `${JSON.stringify(staleSession)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/track.json"),
      `${JSON.stringify(trackManifest())}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-000000.webm"),
      "chunk-zero",
      "utf8",
    );
    await writeFile(
      path.join(sessionRoot, "seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-999999.webm"),
      "orphan-chunk",
      "utf8",
    );

    const summary = await createHarnessSummary({
      cwd,
      finishedAt: "2026-04-04T12:00:03.000Z",
      scenarioName: "happy-path",
      scenarioStatus: "failed",
      sessionId: "amber-session-01",
      startedAt: "2026-04-04T12:00:00.000Z",
    });

    expect(summary.validation.passed).toBe(false);
    expect(summary.validation.checks).toContainEqual({
      code: "track_summary_matches_track_manifest_trk-host-mic-01",
      details: {
        mismatches: {
          bytes: {
            session_manifest: 99,
            track_manifest: 10,
          },
          chunk_count: {
            session_manifest: 3,
            track_manifest: 1,
          },
        },
      },
      message: "Track trk-host-mic-01 summary does not match session.json and track.json.",
      status: "failed",
    });
    expect(summary.validation.checks).toContainEqual({
      code: "artifact_tree_matches_manifest",
      details: {
        missing_files: [],
        unexpected_files: ["seats/seat-host-01/mic/src-mic-01/segment-0000/chunk-999999.webm"],
      },
      message: "Artifact listing does not match the exact session.json + track.json file set.",
      status: "failed",
    });
  });
});

async function createTempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "vgpr-harness-summary-"));

  tempDirs.push(cwd);
  await mkdir(
    path.join(
      cwd,
      ".vgpr/local/artifacts/amber-session-01/seats/seat-host-01/mic/src-mic-01/segment-0000",
    ),
    {
      recursive: true,
    },
  );

  return cwd;
}

function sessionManifest() {
  return {
    recording_epoch_id: "re-01",
    recording_health: "healthy",
    recording_state: "stopped",
    schema_version: 1,
    seats: [
      {
        expected_baseline_sources: ["mic"],
        participant_seat_id: "seat-host-01",
        role: "host",
        tracks: [
          {
            artifact_status: "complete",
            bytes: 10,
            capture_end_offset_us: 1000,
            capture_group_id: null,
            capture_start_offset_us: 0,
            chunk_count: 1,
            kind: "audio",
            path: "seats/seat-host-01/mic/src-mic-01/segment-0000",
            recording_track_id: "trk-host-mic-01",
            segment_index: 0,
            source: "mic",
            source_instance_id: "src-mic-01",
          },
        ],
      },
    ],
    session_id: "amber-session-01",
    started_at: "2026-04-04T12:00:00Z",
    stopped_at: "2026-04-04T12:00:02Z",
  };
}

function trackManifest() {
  return {
    actual_capture_settings: {
      audio_channel_count: 1,
      audio_sample_rate_hz: 48000,
      video_frame_rate: null,
      video_height: null,
      video_width: null,
    },
    artifact_status: "complete",
    capture_end_offset_us: 1000,
    capture_group_id: null,
    capture_start_offset_us: 0,
    chunks: [
      {
        bytes: 10,
        chunk_index: 0,
        file: "chunk-000000.webm",
        sha256: "a".repeat(64),
      },
    ],
    clock_sync_uncertainty_us: 500,
    kind: "audio",
    mime_type: "audio/webm",
    participant_seat_id: "seat-host-01",
    recording_epoch_id: "re-01",
    recording_track_id: "trk-host-mic-01",
    salvage: {
      error_code: null,
      error_message: null,
      missing_chunk_ranges: [],
    },
    schema_version: 1,
    segment_index: 0,
    session_id: "amber-session-01",
    source: "mic",
    source_instance_id: "src-mic-01",
  };
}
