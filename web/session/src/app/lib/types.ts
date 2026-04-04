import type { JoinLinkRole } from "../../../../shared/joinLinks";
import type {
  LiveCallStatus,
  LocalCaptureStatus,
  RecordingHealth,
  RecordingPhase,
  SeatOwnershipStatus,
  UploadStatus,
} from "../../../../shared/sessionContract";

export type JoinRole = JoinLinkRole;

export type { LiveCallStatus, LocalCaptureStatus, RecordingHealth, RecordingPhase, UploadStatus };

export type PickerState = "available" | "you" | "in_use" | "rejoin_available";

export type ClaimState = "unclaimed" | "active" | "disconnected";

export type OwnershipStatus = SeatOwnershipStatus;

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
