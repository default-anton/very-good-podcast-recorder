import type { ControlSession, Seat } from "./types";
import { createSessionLinks } from "./session-links";

export const DEFAULT_CONTROL_APP_ORIGIN = "http://127.0.0.1:5173";
export const DEFAULT_SESSION_ID = "amber-session-01";
export const HOST_SEAT_ID = "seat-host-01";
export const MIC_OPTIONS = ["Studio USB", "Boom Mic", "USB Backup"];
export const CAMERA_OPTIONS = ["Desk Cam", "Mirrorless HDMI", "Laptop Camera"];

export function createInitialSession(
  sessionId = DEFAULT_SESSION_ID,
  origin = getDefaultControlAppOrigin(),
): ControlSession {
  return {
    id: sessionId,
    links: createSessionLinks(origin, sessionId),
    nextSeatNumber: 4,
    recordingHealth: "healthy",
    recordingPhase: "waiting",
    seats: [
      {
        cameraEnabled: true,
        displayName: "Anton Host",
        id: HOST_SEAT_ID,
        joined: true,
        label: "Channel 01",
        liveCallStatus: "connected",
        localCaptureStatus: "not_recording",
        micMuted: false,
        ownershipStatus: "clear",
        role: "host",
        screenShareActive: false,
        selectedCamera: CAMERA_OPTIONS[0],
        selectedMic: MIC_OPTIONS[0],
        uploadStatus: "synced",
      },
      {
        cameraEnabled: true,
        displayName: "Mara Chen",
        id: "seat-guest-02",
        joined: true,
        label: "Channel 02",
        liveCallStatus: "connected",
        localCaptureStatus: "not_recording",
        micMuted: false,
        ownershipStatus: "clear",
        role: "guest",
        screenShareActive: false,
        selectedCamera: CAMERA_OPTIONS[1],
        selectedMic: MIC_OPTIONS[1],
        uploadStatus: "synced",
      },
      {
        cameraEnabled: true,
        displayName: "Jules Narrow-Layout-Name Test",
        id: "seat-guest-03",
        joined: false,
        label: "Channel 03",
        liveCallStatus: "disconnected",
        localCaptureStatus: "not_recording",
        micMuted: false,
        ownershipStatus: "clear",
        role: "guest",
        screenShareActive: false,
        selectedCamera: CAMERA_OPTIONS[2],
        selectedMic: MIC_OPTIONS[2],
        uploadStatus: "synced",
      },
    ],
    status: "ready",
    title: "Late Night Tape Check",
  };
}

export function createGuestSeat(index: number): Seat {
  const label = `Channel ${String(index).padStart(2, "0")}`;
  const deviceIndex = (index - 1) % MIC_OPTIONS.length;

  return {
    cameraEnabled: true,
    displayName: `Guest ${index}`,
    id: `seat-guest-${String(index).padStart(2, "0")}`,
    joined: false,
    label,
    liveCallStatus: "disconnected",
    localCaptureStatus: "not_recording",
    micMuted: false,
    ownershipStatus: "clear",
    role: "guest",
    screenShareActive: false,
    selectedCamera: CAMERA_OPTIONS[deviceIndex],
    selectedMic: MIC_OPTIONS[deviceIndex],
    uploadStatus: "synced",
  };
}

function getDefaultControlAppOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return DEFAULT_CONTROL_APP_ORIGIN;
}
