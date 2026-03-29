export type SessionStatus = "draft" | "ready" | "active" | "ended";

export type RecordingPhase = "waiting" | "recording" | "draining" | "stopped" | "failed";

export type RecordingHealth = "healthy" | "degraded" | "failed";

export type SeatRole = "host" | "guest";

export type LiveCallStatus = "connected" | "reconnecting" | "disconnected";

export type LocalCaptureStatus = "not_recording" | "recording" | "issue";

export type UploadStatus = "synced" | "uploading" | "catching_up" | "failed";

export type SeatOwnershipStatus = "clear" | "rejoin_available" | "takeover_required";

export type DemoPreset = "healthy" | "reconnect" | "catchup" | "issue" | "rejoin" | "takeover";

export interface Seat {
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

export interface SessionLinks {
  host: string;
  guest: string;
}

export interface ControlSession {
  id: string;
  title: string;
  status: SessionStatus;
  recordingPhase: RecordingPhase;
  recordingHealth: RecordingHealth;
  nextSeatNumber: number;
  links: SessionLinks;
  seats: Seat[];
}
