import type { JoinLinkRole } from "./joinLinks";
import { buildJoinUrl } from "./joinLinks";

export type SessionStatus = "draft" | "ready" | "active" | "ended";

export type RecordingPhase = "waiting" | "recording" | "draining" | "stopped" | "failed";

export type RecordingHealth = "healthy" | "degraded" | "failed";

export type SeatRole = JoinLinkRole;

export type LiveCallStatus = "connected" | "reconnecting" | "disconnected";

export type LocalCaptureStatus = "not_recording" | "recording" | "issue";

export type UploadStatus = "synced" | "uploading" | "catching_up" | "failed";

export type SeatOwnershipStatus = "clear" | "rejoin_available" | "takeover_required";

export type SessionRuntimeState = "creating" | "ready" | "stopping" | "stopped" | "failed";

export interface SessionJoinKeys {
  guest: string;
  host: string;
}

export interface SessionLinks {
  guest: string;
  host: string;
}

export interface ControlSeat {
  id: string;
  label: string;
  displayName: string;
  role: SeatRole;
  joined: boolean;
  liveCallStatus: LiveCallStatus;
  localCaptureStatus: LocalCaptureStatus;
  uploadStatus: UploadStatus;
  ownershipStatus: SeatOwnershipStatus;
  micMuted: boolean;
  cameraEnabled: boolean;
  screenShareActive: boolean;
  selectedMic: string;
  selectedCamera: string;
}

export interface ControlSession {
  id: string;
  title: string;
  status: SessionStatus;
  recordingPhase: RecordingPhase;
  recordingHealth: RecordingHealth;
  nextSeatNumber: number;
  links: SessionLinks;
  seats: ControlSeat[];
}

export interface SessionRuntimeDescriptor {
  baseUrl: string;
  liveKitUrl: string;
  roomName: string;
  state: SessionRuntimeState;
  turn: null;
}

export interface ControlSessionResponse {
  runtime: SessionRuntimeDescriptor;
  session: ControlSession;
}

export interface SessionBootstrapSeat {
  displayName: string;
  id: string;
  label: string;
  role: JoinLinkRole;
}

export interface SessionBootstrapResponse {
  runtime: SessionRuntimeDescriptor;
  seats: SessionBootstrapSeat[];
  session: {
    id: string;
    role: JoinLinkRole;
    status: SessionStatus;
    title: string;
  };
}

export interface UpdateControlSessionInput {
  recordingHealth?: ControlSession["recordingHealth"];
  recordingPhase?: ControlSession["recordingPhase"];
  status?: ControlSession["status"];
  title?: ControlSession["title"];
}

export interface UpdateControlSeatInput {
  cameraEnabled?: ControlSeat["cameraEnabled"];
  displayName?: ControlSeat["displayName"];
  joined?: ControlSeat["joined"];
  micMuted?: ControlSeat["micMuted"];
  ownershipStatus?: ControlSeat["ownershipStatus"];
  role?: ControlSeat["role"];
  screenShareActive?: ControlSeat["screenShareActive"];
  selectedCamera?: ControlSeat["selectedCamera"];
  selectedMic?: ControlSeat["selectedMic"];
}

export function createSessionApiPath(sessionId: string) {
  return `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
}

export function createSessionSeatsApiPath(sessionId: string) {
  return `${createSessionApiPath(sessionId)}/seats`;
}

export function createSessionSeatApiPath(sessionId: string, seatId: string) {
  return `${createSessionSeatsApiPath(sessionId)}/${encodeURIComponent(seatId)}`;
}

export function createBootstrapApiPath(sessionId: string, role: JoinLinkRole, joinKey: string) {
  const path = `${createSessionApiPath(sessionId)}/bootstrap/${role}`;
  const searchParams = new URLSearchParams({ k: joinKey });

  return `${path}?${searchParams.toString()}`;
}

export function createSessionLinks(
  origin: string,
  sessionId: string,
  joinKeys: SessionJoinKeys,
): SessionLinks {
  return {
    guest: buildJoinUrl(origin, sessionId, "guest", joinKeys.guest),
    host: buildJoinUrl(origin, sessionId, "host", joinKeys.host),
  };
}

export function withSessionLinks(
  session: ControlSession,
  origin: string,
  joinKeys: SessionJoinKeys,
): ControlSession {
  return {
    ...session,
    links: createSessionLinks(origin, session.id, joinKeys),
  };
}
