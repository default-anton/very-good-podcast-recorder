import type { SessionBootstrapResponse } from "../../../../shared/sessionContract";
import type { JoinRole, OwnershipStatus, SessionSeat, SessionShell } from "./types";

export const DEFAULT_SESSION_ID = "amber-session-01";
export const MIC_OPTIONS = ["Studio USB", "Boom Mic", "USB Backup"];
export const CAMERA_OPTIONS = ["Desk Cam", "Mirrorless HDMI", "Laptop Camera"];

export interface SessionBootstrapSeed {
  role: JoinRole;
  seats: Array<{
    displayName: string;
    id: string;
    label: string;
    role: JoinRole;
  }>;
  sessionId: string;
  title: string;
}

export function createBootstrapSeed({
  bootstrap,
  role,
  sessionId,
}: {
  bootstrap?: SessionBootstrapResponse;
  role: JoinRole;
  sessionId: string;
}): SessionBootstrapSeed {
  if (bootstrap === undefined) {
    return createDemoBootstrapSeed(sessionId, role);
  }

  return {
    role: bootstrap.session.role,
    seats: bootstrap.seats.map((seat) => ({ ...seat })),
    sessionId: bootstrap.session.id,
    title: bootstrap.session.title,
  };
}

export function createBaseSession(
  bootstrap: SessionBootstrapSeed,
  previewMic: string,
  previewCamera: string,
): SessionShell {
  return {
    id: bootstrap.sessionId,
    joinedSeatId: null,
    ownedSeatId: null,
    previewCamera,
    previewMic,
    recordingHealth: "healthy",
    recordingPhase: "waiting",
    role: bootstrap.role,
    seats: createBootstrapSeats(bootstrap),
    selectedSeatId: null,
    title: bootstrap.title,
  };
}

function createDemoBootstrapSeed(sessionId: string, role: JoinRole): SessionBootstrapSeed {
  return {
    role,
    seats:
      role === "host"
        ? [
            createDemoBootstrapSeat("Anton Host", "seat-host-01", "Channel 01", "host"),
            createDemoBootstrapSeat("Producer Desk", "seat-host-02", "Channel 02", "host"),
            createDemoBootstrapSeat("Mara Chen", "seat-guest-03", "Channel 03", "guest"),
            createDemoBootstrapSeat(
              "Jules Narrow-Layout-Name Test",
              "seat-guest-04",
              "Channel 04",
              "guest",
            ),
          ]
        : [
            createDemoBootstrapSeat("Anton Host", "seat-host-01", "Channel 01", "host"),
            createDemoBootstrapSeat("Mara Chen", "seat-guest-02", "Channel 02", "guest"),
            createDemoBootstrapSeat(
              "Jules Narrow-Layout-Name Test",
              "seat-guest-03",
              "Channel 03",
              "guest",
            ),
            createDemoBootstrapSeat("Dana Recovery", "seat-guest-04", "Channel 04", "guest"),
          ],
    sessionId,
    title: "Late Night Tape Check",
  };
}

function createDemoBootstrapSeat(
  displayName: string,
  id: string,
  label: string,
  role: JoinRole,
): SessionBootstrapSeed["seats"][number] {
  return {
    displayName,
    id,
    label,
    role,
  };
}

function createBootstrapSeats(bootstrap: SessionBootstrapSeed): SessionSeat[] {
  const roleSeats = bootstrap.seats.filter((seat) => seat.role === bootstrap.role);

  if (roleSeats.length === 0) {
    throw new Error("Session shell requires at least one seat for the active role.");
  }

  const [availableSeat, activeSeat, disconnectedSeat] = roleSeats;

  return bootstrap.seats.map((seat, index) => {
    const deviceIndex = index % MIC_OPTIONS.length;
    const isDisconnectedSeat = seat.id === disconnectedSeat?.id;
    const isActiveRoleSeat = seat.id === activeSeat?.id;
    const isAvailableRoleSeat = seat.id === availableSeat.id;

    let claimState: SessionSeat["claimState"] = "unclaimed";
    let joined = false;

    if (seat.role !== bootstrap.role || isActiveRoleSeat) {
      claimState = "active";
      joined = true;
    } else if (isDisconnectedSeat) {
      claimState = "disconnected";
    } else if (isAvailableRoleSeat) {
      claimState = "unclaimed";
    }

    return createSeat({
      cameraEnabled: !isDisconnectedSeat,
      claimState,
      displayName: seat.displayName,
      id: seat.id,
      joined,
      label: seat.label,
      micMuted: isDisconnectedSeat,
      role: seat.role,
      selectedCamera: CAMERA_OPTIONS[deviceIndex],
      selectedMic: MIC_OPTIONS[deviceIndex],
    });
  });
}

function createSeat({
  cameraEnabled,
  claimState,
  displayName,
  id,
  joined,
  label,
  micMuted,
  ownershipStatus = "clear",
  role,
  selectedCamera,
  selectedMic,
}: {
  cameraEnabled: boolean;
  claimState: SessionSeat["claimState"];
  displayName: string;
  id: string;
  joined: boolean;
  label: string;
  micMuted: boolean;
  ownershipStatus?: OwnershipStatus;
  role: JoinRole;
  selectedCamera: string;
  selectedMic: string;
}): SessionSeat {
  return {
    cameraEnabled,
    claimState,
    displayName,
    id,
    joined,
    label,
    liveCallStatus: joined ? "connected" : "disconnected",
    localCaptureStatus: "not_recording",
    micMuted,
    ownershipStatus,
    pickerState: "available",
    role,
    screenShareActive: false,
    selectedCamera,
    selectedMic,
    uploadStatus: "synced",
  };
}
