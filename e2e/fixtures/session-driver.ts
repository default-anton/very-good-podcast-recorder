import { createHash } from "node:crypto";

import type { JoinLinkRole } from "../../web/shared/joinLinks";
import { createLocalRuntimeTopology } from "../../web/shared/localRuntime";
import type { ControlSessionResponse } from "../../web/shared/sessionContract";
import {
  createHarnessPaths,
  findHarnessSeat,
  joinKeyForRole,
  loadHarnessBootstrapConfig,
  type HarnessBootstrapConfig,
  type HarnessPaths,
} from "./harness-runtime";

export {
  createHarnessPaths,
  findHarnessSeat,
  joinKeyForRole,
  loadHarnessBootstrapConfig,
} from "./harness-runtime";
export type { HarnessBootstrapConfig, HarnessBootstrapSeat, HarnessPaths } from "./harness-runtime";

export interface SeatPickerSeat {
  display_name: string;
  participant_seat_id: string;
  picker_state: string;
}

export interface SeatPickerResponse {
  owned_seat_id: string | null;
  role: JoinLinkRole;
  seats: SeatPickerSeat[];
  session_id: string;
}

export interface LiveKitClaim {
  participant_identity: string;
  room: string;
  token: string;
}

export interface SeatClaimResponse {
  claim_state: string;
  claim_version: number;
  livekit: LiveKitClaim;
  participant_seat_id: string;
  role: JoinLinkRole;
  session_id: string;
}

export interface HarnessSeatClaim extends SeatClaimResponse {
  cookie: string;
}

export interface SessionSnapshot {
  participant_seat_id: string;
  recording_epoch_id: string | null;
  recording_epoch_started_at: string | null;
  recording_health: string;
  recording_state: string;
  role: JoinLinkRole;
  session_id: string;
}

export interface RecordingSnapshot {
  recording_epoch_id: string | null;
  recording_epoch_started_at: string | null;
  recording_health: string;
  recording_state: string;
  session_id: string;
}

export interface ClockSyncResponse {
  recording_epoch_elapsed_us: number;
  recording_epoch_id: string;
  recording_epoch_started_at: string;
  recording_health: string;
  recording_state: string;
  server_processing_time_us: number;
}

export interface StartTrackRequest {
  capture_end_offset_us?: number;
  capture_group_id?: string | null;
  capture_start_offset_us: number;
  clock_sync_uncertainty_us: number;
  kind: string;
  mime_type: string;
  recording_epoch_id: string;
  recording_track_id: string;
  segment_index: number;
  source: string;
  source_instance_id: string;
}

export interface RecordingTrackResponse {
  capture_end_offset_us: number | null;
  capture_group_id: string | null;
  capture_start_offset_us: number;
  clock_sync_uncertainty_us: number;
  kind: string;
  mime_type: string;
  participant_seat_id: string;
  recording_epoch_id: string;
  recording_track_id: string;
  segment_index: number;
  session_id: string;
  source: string;
  source_instance_id: string;
  state: string;
}

export interface FinishTrackRequest {
  capture_end_offset_us: number;
  expected_chunk_count: number;
}

export interface FinishTrackResponse {
  capture_end_offset_us: number;
  capture_start_offset_us: number;
  expected_chunk_count: number;
  received_chunk_count: number;
  recording_epoch_id: string;
  recording_track_id: string;
  state: string;
}

export interface UploadChunkResponse {
  byte_size: number;
  chunk_index: number;
  recording_track_id: string;
  sha256_hex: string;
  status: string;
}

export interface UploadChunkInput {
  chunkBytes: Uint8Array;
  chunkIndex: number;
  contentType: string;
  recordingTrackId: string;
}

export interface CreateHarnessSessionDriverOptions {
  controlApiOrigin?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  sessiondBaseUrl?: string;
}

export class HarnessRequestError extends Error {
  readonly responseBody: string;
  readonly status: number;
  readonly url: string;

  constructor(message: string, url: string, status: number, responseBody: string) {
    super(message);
    this.name = "HarnessRequestError";
    this.responseBody = responseBody;
    this.status = status;
    this.url = url;
  }
}

export async function createLocalSessionDriver(options: CreateHarnessSessionDriverOptions = {}) {
  const bootstrap = await loadHarnessBootstrapConfig({ cwd: options.cwd, env: options.env });
  return new HarnessSessionDriver({
    bootstrap,
    controlApiOrigin: options.controlApiOrigin,
    cwd: options.cwd,
    sessiondBaseUrl: options.sessiondBaseUrl,
  });
}

export class HarnessSessionDriver {
  readonly bootstrap: HarnessBootstrapConfig;
  readonly controlApiOrigin: string;
  readonly paths: HarnessPaths;
  readonly sessiondBaseUrl: string;

  constructor(options: {
    bootstrap: HarnessBootstrapConfig;
    controlApiOrigin?: string;
    cwd?: string;
    sessiondBaseUrl?: string;
  }) {
    const topology = createLocalRuntimeTopology();

    this.bootstrap = options.bootstrap;
    this.controlApiOrigin = options.controlApiOrigin ?? topology.controlApiOrigin;
    this.paths = createHarnessPaths({ cwd: options.cwd, sessionId: options.bootstrap.sessionId });
    this.sessiondBaseUrl = options.sessiondBaseUrl ?? topology.sessiondBaseUrl;
  }

  async ensureControlSession(sessionId = this.bootstrap.sessionId) {
    const { body } = await this.requestJson<ControlSessionResponse>(
      `${this.controlApiOrigin}/api/v1/sessions/${encodeURIComponent(sessionId)}`,
      { method: "PUT" },
    );

    return body;
  }

  async pickSeats(role: JoinLinkRole, cookie?: string) {
    const { body } = await this.requestJson<SeatPickerResponse>(
      `${this.sessiondBaseUrl}/api/v1/join/seat-picker`,
      {
        cookie,
        json: {
          join_key: joinKeyForRole(this.bootstrap, role),
          role,
          session_id: this.bootstrap.sessionId,
        },
        method: "POST",
      },
    );

    return body;
  }

  async claimSeat(options: { cookie?: string; role: JoinLinkRole; seatId: string }) {
    const seat = findHarnessSeat(this.bootstrap, options.seatId);

    if (seat === null) {
      throw new Error(`Unknown harness seat ${options.seatId}.`);
    }
    if (seat.role !== options.role) {
      throw new Error(`Seat ${options.seatId} is ${seat.role}, not ${options.role}.`);
    }

    const response = await this.requestJson<SeatClaimResponse>(
      `${this.sessiondBaseUrl}/api/v1/seat-claims/claim`,
      {
        cookie: options.cookie,
        json: {
          join_key: joinKeyForRole(this.bootstrap, options.role),
          participant_seat_id: options.seatId,
          role: options.role,
          session_id: this.bootstrap.sessionId,
        },
        method: "POST",
      },
    );
    const cookie = parseSetCookie(response.response.headers.get("set-cookie"));

    if (cookie === null) {
      throw new Error(`Seat claim for ${options.seatId} did not return a claim cookie.`);
    }

    return { ...response.body, cookie } satisfies HarnessSeatClaim;
  }

  async reclaimSeat(role: JoinLinkRole, cookie: string) {
    const response = await this.requestJson<SeatClaimResponse>(
      `${this.sessiondBaseUrl}/api/v1/seat-claims/reclaim`,
      {
        cookie,
        json: {
          join_key: joinKeyForRole(this.bootstrap, role),
          role,
          session_id: this.bootstrap.sessionId,
        },
        method: "POST",
      },
    );
    const refreshedCookie = parseSetCookie(response.response.headers.get("set-cookie"));

    return {
      ...response.body,
      cookie: refreshedCookie ?? cookie,
    } satisfies HarnessSeatClaim;
  }

  async sessionSnapshot(claim: { cookie: string }) {
    const { body } = await this.requestJson<SessionSnapshot>(
      `${this.sessiondBaseUrl}/api/v1/session`,
      {
        cookie: claim.cookie,
        method: "GET",
      },
    );

    return body;
  }

  async startRecording(claim: { cookie: string }) {
    const { body } = await this.requestJson<RecordingSnapshot>(
      `${this.sessiondBaseUrl}/api/v1/session-recording/start`,
      {
        cookie: claim.cookie,
        method: "POST",
      },
    );

    return body;
  }

  async clockSync(claim: { cookie: string }) {
    const { body } = await this.requestJson<ClockSyncResponse>(
      `${this.sessiondBaseUrl}/api/v1/session-recording/clock-sync`,
      {
        cookie: claim.cookie,
        method: "POST",
      },
    );

    return body;
  }

  async stopRecording(claim: { cookie: string }) {
    const { body } = await this.requestJson<RecordingSnapshot>(
      `${this.sessiondBaseUrl}/api/v1/session-recording/stop`,
      {
        cookie: claim.cookie,
        method: "POST",
      },
    );

    return body;
  }

  async startTrack(claim: { cookie: string }, track: StartTrackRequest) {
    const { body } = await this.requestJson<RecordingTrackResponse>(
      `${this.sessiondBaseUrl}/api/v1/recording-tracks/start`,
      {
        cookie: claim.cookie,
        json: track,
        method: "POST",
      },
    );

    return body;
  }

  async uploadChunk(claim: { cookie: string }, input: UploadChunkInput) {
    const chunkBytes = Buffer.from(input.chunkBytes);
    const { body } = await this.requestJson<UploadChunkResponse>(
      `${this.sessiondBaseUrl}/api/v1/recording-tracks/${encodeURIComponent(input.recordingTrackId)}/chunks/${input.chunkIndex}`,
      {
        body: chunkBytes,
        cookie: claim.cookie,
        headers: {
          "Content-Length": String(chunkBytes.byteLength),
          "Content-Type": input.contentType,
          "X-Chunk-Sha256": sha256Hex(chunkBytes),
        },
        method: "PUT",
      },
    );

    return body;
  }

  async finishTrack(claim: { cookie: string }, recordingTrackId: string, body: FinishTrackRequest) {
    const { body: responseBody } = await this.requestJson<FinishTrackResponse>(
      `${this.sessiondBaseUrl}/api/v1/recording-tracks/${encodeURIComponent(recordingTrackId)}/finish`,
      {
        cookie: claim.cookie,
        json: body,
        method: "POST",
      },
    );

    return responseBody;
  }

  private async requestJson<T>(
    url: string,
    options: {
      body?: BodyInit;
      cookie?: string;
      headers?: Record<string, string>;
      json?: unknown;
      method: string;
    },
  ) {
    const headers = new Headers(options.headers);

    headers.set("Accept", "application/json");
    if (options.cookie !== undefined && options.cookie.length > 0) {
      headers.set("Cookie", `vgpr_claim=${options.cookie}`);
    }

    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      body,
      headers,
      method: options.method,
    });
    const responseBody = await response.text();

    if (!response.ok) {
      throw new HarnessRequestError(
        `${options.method} ${url} failed with ${response.status}.`,
        url,
        response.status,
        responseBody,
      );
    }

    return {
      body: JSON.parse(responseBody) as T,
      response,
    };
  }
}

function parseSetCookie(setCookie: string | null) {
  if (setCookie === null || setCookie.length === 0) {
    return null;
  }

  const cookie = setCookie.split(";", 1)[0] ?? "";
  const separatorIndex = cookie.indexOf("=");

  if (separatorIndex < 0) {
    return null;
  }

  return cookie.slice(separatorIndex + 1);
}

function sha256Hex(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
