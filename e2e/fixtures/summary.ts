import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

import { createLocalRuntimeTopology } from "../../web/shared/localRuntime";
import { createHarnessPaths } from "./harness-runtime";

export interface SessionManifestTrackSummary {
  artifact_status: string;
  bytes: number;
  capture_end_offset_us: number | null;
  capture_group_id: string | null;
  capture_start_offset_us: number;
  chunk_count: number;
  kind: string;
  path: string;
  recording_track_id: string;
  segment_index: number;
  source: string;
  source_instance_id: string;
}

export interface SessionManifestSeat {
  expected_baseline_sources: string[];
  participant_seat_id: string;
  role: string;
  tracks: SessionManifestTrackSummary[];
}

export interface SessionManifest {
  recording_epoch_id: string;
  recording_health: string;
  recording_state: string;
  schema_version: number;
  seats: SessionManifestSeat[];
  session_id: string;
  started_at: string | null;
  stopped_at: string | null;
}

export interface TrackManifestChunk {
  bytes: number;
  chunk_index: number;
  file: string;
  sha256: string;
}

export interface TrackManifest {
  actual_capture_settings: Record<string, number | null>;
  artifact_status: string;
  capture_end_offset_us: number | null;
  capture_group_id: string | null;
  capture_start_offset_us: number;
  chunks: TrackManifestChunk[];
  clock_sync_uncertainty_us: number;
  kind: string;
  mime_type: string;
  participant_seat_id: string;
  recording_epoch_id: string;
  recording_track_id: string;
  salvage: {
    error_code: string | null;
    error_message: string | null;
    missing_chunk_ranges: Array<{
      end_chunk_index: number;
      start_chunk_index: number;
    }>;
  };
  schema_version: number;
  segment_index: number;
  session_id: string;
  source: string;
  source_instance_id: string;
}

export interface HarnessCheck {
  code: string;
  details?: unknown;
  message: string;
  status: "failed" | "passed";
}

export interface HarnessSeatIdentity {
  livekit_participant_identity: string | null;
  role: string;
  room: string | null;
  participant_seat_id: string;
}

export interface HarnessTrackArtifactSummary {
  chunk_files: string[];
  missing_files: string[];
  participant_seat_id: string;
  path: string;
  recording_track_id: string;
  session_track_summary: SessionManifestTrackSummary;
  track_manifest: TrackManifest | null;
  track_manifest_path: string;
}

export interface HarnessSummary {
  artifact_listing: string[];
  runtime: {
    artifact_root: string;
    control_api_origin: string;
    control_app_origin: string;
    livekit_url: string;
    logs_root: string;
    session_app_origin: string;
    session_artifact_root: string;
    sessiond_base_url: string;
  };
  scenario: {
    duration_ms: number;
    finished_at: string;
    name: string;
    started_at: string;
    status: "failed" | "passed";
  };
  schema_version: number;
  session: {
    seat_identity_map: HarnessSeatIdentity[];
    session_manifest: SessionManifest | null;
    session_manifest_path: string;
    session_id: string;
    track_manifests: HarnessTrackArtifactSummary[];
  };
  validation: {
    checks: HarnessCheck[];
    passed: boolean;
  };
}

export interface CreateHarnessSummaryInput {
  checks?: HarnessCheck[];
  cwd?: string;
  finishedAt: Date | string;
  scenarioName: string;
  scenarioStatus: "failed" | "passed";
  seatIdentityMap?: HarnessSeatIdentity[];
  sessionId: string;
  startedAt: Date | string;
}

export function buildHarnessSummaryPath(scenarioName: string, cwd = process.cwd()) {
  return path.join(
    path.resolve(cwd),
    ".vgpr/local/e2e",
    `${toFileNameFragment(scenarioName)}.json`,
  );
}

export async function createHarnessSummary(
  input: CreateHarnessSummaryInput,
): Promise<HarnessSummary> {
  const startedAt = new Date(input.startedAt);
  const finishedAt = new Date(input.finishedAt);
  const paths = createHarnessPaths({ cwd: input.cwd, sessionId: input.sessionId });
  const topology = createLocalRuntimeTopology();
  const sessionManifestPath = path.join(paths.sessionArtifactRoot, "session.json");
  const sessionManifest = await readJsonFile<SessionManifest>(sessionManifestPath, true);
  const artifactListing = await listRelativeFiles(paths.sessionArtifactRoot);
  const trackManifests =
    sessionManifest === null
      ? []
      : await Promise.all(
          sessionManifest.seats.flatMap((seat) =>
            seat.tracks.map((track) =>
              readTrackArtifactSummary(paths.sessionArtifactRoot, seat.participant_seat_id, track),
            ),
          ),
        );
  const checks = [
    ...buildManifestChecks(sessionManifest, trackManifests, artifactListing),
    ...(input.checks ?? []),
  ];

  return {
    artifact_listing: artifactListing,
    runtime: {
      artifact_root: paths.artifactRoot,
      control_api_origin: topology.controlApiOrigin,
      control_app_origin: topology.controlAppOrigin,
      livekit_url: topology.liveKitUrl,
      logs_root: paths.logsRoot,
      session_app_origin: topology.sessionAppOrigin,
      session_artifact_root: paths.sessionArtifactRoot,
      sessiond_base_url: topology.sessiondBaseUrl,
    },
    scenario: {
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      finished_at: finishedAt.toISOString(),
      name: input.scenarioName,
      started_at: startedAt.toISOString(),
      status: input.scenarioStatus,
    },
    schema_version: 1,
    session: {
      seat_identity_map: [...(input.seatIdentityMap ?? [])],
      session_id: input.sessionId,
      session_manifest: sessionManifest,
      session_manifest_path: sessionManifestPath,
      track_manifests: trackManifests,
    },
    validation: {
      checks,
      passed: checks.every((check) => check.status === "passed"),
    },
  };
}

export async function writeHarnessSummary(summary: HarnessSummary, outputPath?: string) {
  const targetPath = outputPath ?? buildHarnessSummaryPath(summary.scenario.name);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return targetPath;
}

function buildManifestChecks(
  sessionManifest: SessionManifest | null,
  trackManifests: HarnessTrackArtifactSummary[],
  artifactListing: string[],
) {
  const checks: HarnessCheck[] = [];
  const expectedFiles = new Set<string>();
  const artifactFiles = new Set(artifactListing);

  checks.push(
    sessionManifest === null
      ? {
          code: "session_manifest_present",
          message: "session.json is missing from the session artifact root.",
          status: "failed",
        }
      : {
          code: "session_manifest_present",
          message: "session.json was loaded from the session artifact root.",
          status: "passed",
        },
  );

  if (sessionManifest !== null) {
    expectedFiles.add("session.json");
  }

  checks.push(
    artifactListing.includes("session.json")
      ? {
          code: "artifact_listing_includes_session_manifest",
          message: "artifact listing includes session.json.",
          status: "passed",
        }
      : {
          code: "artifact_listing_includes_session_manifest",
          message: "artifact listing is missing session.json.",
          status: "failed",
        },
  );

  for (const trackSummary of trackManifests) {
    const suffix = trackSummary.recording_track_id;

    expectedFiles.add(trackSummary.track_manifest_path);
    checks.push(
      trackSummary.track_manifest === null
        ? {
            code: `track_manifest_present_${suffix}`,
            message: `track.json is missing for ${suffix}.`,
            status: "failed",
          }
        : {
            code: `track_manifest_present_${suffix}`,
            message: `track.json is present for ${suffix}.`,
            status: "passed",
          },
    );

    const missingFiles = trackSummary.missing_files;
    checks.push(
      missingFiles.length === 0
        ? {
            code: `track_files_present_${suffix}`,
            message: `All chunk files referenced by ${suffix} are present on disk.`,
            status: "passed",
          }
        : {
            code: `track_files_present_${suffix}`,
            details: { missing_files: missingFiles },
            message: `Track ${suffix} is missing one or more chunk files.`,
            status: "failed",
          },
    );

    if (trackSummary.track_manifest === null || sessionManifest === null) {
      continue;
    }

    for (const chunkPath of trackSummary.chunk_files) {
      expectedFiles.add(chunkPath);
    }

    checks.push(buildTrackConsistencyCheck(sessionManifest, trackSummary));
  }

  const missingExpectedFiles = [...expectedFiles]
    .filter((relativePath) => !artifactFiles.has(relativePath))
    .sort();
  const unexpectedFiles = artifactListing.filter(
    (relativePath) => !expectedFiles.has(relativePath),
  );

  checks.push(
    missingExpectedFiles.length === 0 && unexpectedFiles.length === 0
      ? {
          code: "artifact_tree_matches_manifest",
          message: "Artifact listing matches the exact session.json + track.json file set.",
          status: "passed",
        }
      : {
          code: "artifact_tree_matches_manifest",
          details: {
            missing_files: missingExpectedFiles,
            unexpected_files: unexpectedFiles,
          },
          message: "Artifact listing does not match the exact session.json + track.json file set.",
          status: "failed",
        },
  );

  return checks;
}

function buildTrackConsistencyCheck(
  sessionManifest: SessionManifest,
  trackSummary: HarnessTrackArtifactSummary,
): HarnessCheck {
  const trackManifest = trackSummary.track_manifest;

  if (trackManifest === null) {
    return {
      code: `track_summary_matches_track_manifest_${trackSummary.recording_track_id}`,
      message: `Track ${trackSummary.recording_track_id} cannot be compared because track.json is missing.`,
      status: "failed",
    };
  }

  const sessionTrack = trackSummary.session_track_summary;
  const manifestBytes = trackManifest.chunks.reduce((total, chunk) => total + chunk.bytes, 0);
  const expectedTrackPath = buildTrackPath(trackManifest);
  const mismatches: Record<string, { session_manifest: unknown; track_manifest: unknown }> = {};

  addMismatch(mismatches, "session_id", sessionManifest.session_id, trackManifest.session_id);
  addMismatch(
    mismatches,
    "recording_epoch_id",
    sessionManifest.recording_epoch_id,
    trackManifest.recording_epoch_id,
  );
  addMismatch(
    mismatches,
    "participant_seat_id",
    trackSummary.participant_seat_id,
    trackManifest.participant_seat_id,
  );
  addMismatch(
    mismatches,
    "recording_track_id",
    sessionTrack.recording_track_id,
    trackManifest.recording_track_id,
  );
  addMismatch(mismatches, "source", sessionTrack.source, trackManifest.source);
  addMismatch(
    mismatches,
    "source_instance_id",
    sessionTrack.source_instance_id,
    trackManifest.source_instance_id,
  );
  addMismatch(
    mismatches,
    "capture_group_id",
    sessionTrack.capture_group_id,
    trackManifest.capture_group_id,
  );
  addMismatch(mismatches, "kind", sessionTrack.kind, trackManifest.kind);
  addMismatch(mismatches, "segment_index", sessionTrack.segment_index, trackManifest.segment_index);
  addMismatch(
    mismatches,
    "artifact_status",
    sessionTrack.artifact_status,
    trackManifest.artifact_status,
  );
  addMismatch(mismatches, "path", sessionTrack.path, expectedTrackPath);
  addMismatch(mismatches, "chunk_count", sessionTrack.chunk_count, trackManifest.chunks.length);
  addMismatch(mismatches, "bytes", sessionTrack.bytes, manifestBytes);
  addMismatch(
    mismatches,
    "capture_start_offset_us",
    sessionTrack.capture_start_offset_us,
    trackManifest.capture_start_offset_us,
  );
  addMismatch(
    mismatches,
    "capture_end_offset_us",
    sessionTrack.capture_end_offset_us,
    trackManifest.capture_end_offset_us,
  );

  return Object.keys(mismatches).length === 0
    ? {
        code: `track_summary_matches_track_manifest_${trackSummary.recording_track_id}`,
        message: `Track ${trackSummary.recording_track_id} summary matches session.json and track.json.`,
        status: "passed",
      }
    : {
        code: `track_summary_matches_track_manifest_${trackSummary.recording_track_id}`,
        details: { mismatches },
        message: `Track ${trackSummary.recording_track_id} summary does not match session.json and track.json.`,
        status: "failed",
      };
}

function addMismatch(
  mismatches: Record<string, { session_manifest: unknown; track_manifest: unknown }>,
  field: string,
  sessionValue: unknown,
  trackValue: unknown,
) {
  if (sessionValue === trackValue) {
    return;
  }

  mismatches[field] = {
    session_manifest: sessionValue,
    track_manifest: trackValue,
  };
}

async function readTrackArtifactSummary(
  sessionArtifactRoot: string,
  participantSeatId: string,
  track: SessionManifestTrackSummary,
): Promise<HarnessTrackArtifactSummary> {
  const trackManifestPath = path.join(sessionArtifactRoot, track.path, "track.json");
  const trackManifest = await readJsonFile<TrackManifest>(trackManifestPath, true);
  const missingFiles: string[] = [];
  const chunkFiles =
    trackManifest?.chunks.map((chunk) => path.posix.join(track.path, chunk.file)).sort() ?? [];

  for (const relativeChunkPath of chunkFiles) {
    const chunkPath = path.join(sessionArtifactRoot, relativeChunkPath);

    if (!(await fileExists(chunkPath))) {
      missingFiles.push(relativeChunkPath);
    }
  }

  return {
    chunk_files: chunkFiles,
    missing_files: missingFiles,
    participant_seat_id: participantSeatId,
    path: track.path,
    recording_track_id: track.recording_track_id,
    session_track_summary: track,
    track_manifest: trackManifest,
    track_manifest_path: toPosixRelativePath(sessionArtifactRoot, trackManifestPath),
  };
}

function buildTrackPath(trackManifest: TrackManifest) {
  return path.posix.join(
    "seats",
    trackManifest.participant_seat_id,
    trackManifest.source,
    trackManifest.source_instance_id,
    `segment-${String(trackManifest.segment_index).padStart(4, "0")}`,
  );
}

async function listRelativeFiles(root: string): Promise<string[]> {
  if (!(await fileExists(root))) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return (await listRelativeFiles(absolutePath)).map((relativePath) =>
          path.posix.join(entry.name, relativePath),
        );
      }
      if (!entry.isFile()) {
        return [];
      }

      return [entry.name];
    }),
  );

  return files.flat().sort();
}

async function readJsonFile<T>(filePath: string, optional = false) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (optional && isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function fileExists(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() || fileStat.isDirectory();
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

function toPosixRelativePath(root: string, filePath: string) {
  return path.relative(root, filePath).split(path.sep).join(path.posix.sep) || "track.json";
}

function toFileNameFragment(value: string) {
  return value.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "") || "summary";
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
