export type JoinRole = "host" | "guest";

export type PickerState = "available" | "you" | "in_use" | "rejoin_available";

export type RecordingPhase = "waiting" | "recording" | "draining" | "stopped" | "failed";

export type RecordingHealth = "healthy" | "degraded" | "failed";

export type ClaimState = "unclaimed" | "active" | "disconnected";

export type LiveCallStatus = "connected" | "reconnecting" | "disconnected";

export type LocalCaptureStatus = "not_recording" | "recording" | "issue";

export type UploadStatus = "synced" | "uploading" | "catching_up" | "failed";

export type OwnershipStatus = "clear" | "rejoin_available" | "takeover_required";

export type JoinDemoPreset = "fresh" | "owned" | "recover" | "takeover";

export type RoomDemoPreset = "steady" | "reconnecting" | "catching_up" | "local_issue";

export interface SessionSeat {
  id: string;
  label: string;
  displayName: string;
  role: JoinRole;
  claimState: ClaimState;
  pickerState: PickerState;
  joined: boolean;
  liveCallStatus: LiveCallStatus;
  localCaptureStatus: LocalCaptureStatus;
  uploadStatus: UploadStatus;
  ownershipStatus: OwnershipStatus;
  micMuted: boolean;
  cameraEnabled: boolean;
  screenShareActive: boolean;
  selectedMic: string;
  selectedCamera: string;
}

export interface SessionShell {
  id: string;
  title: string;
  role: JoinRole;
  recordingPhase: RecordingPhase;
  recordingHealth: RecordingHealth;
  seats: SessionSeat[];
  ownedSeatId: string | null;
  selectedSeatId: string | null;
  joinedSeatId: string | null;
  previewMic: string;
  previewCamera: string;
}
