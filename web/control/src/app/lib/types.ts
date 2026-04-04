export type {
  ControlSession,
  ControlSeat as Seat,
  LiveCallStatus,
  LocalCaptureStatus,
  RecordingHealth,
  RecordingPhase,
  SeatOwnershipStatus,
  SeatRole,
  SessionLinks,
  SessionStatus,
  UploadStatus,
} from "../../../../shared/sessionContract";

export type DemoPreset = "healthy" | "reconnect" | "catchup" | "issue" | "rejoin" | "takeover";
