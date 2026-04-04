import type {
  LocalCaptureStatus,
  RecordingPhase,
  SessionSeat,
  SessionShell,
  UploadStatus,
} from "./types";

export function normalizeSessionState(session: SessionShell): SessionShell {
  return {
    ...session,
    seats: session.seats.map((seat) => normalizeSeat(session, seat)),
  };
}

export function claimSeat(session: SessionShell, seatId: string): SessionShell {
  return {
    ...session,
    ownedSeatId: seatId,
    selectedSeatId: seatId,
    seats: session.seats.map((seat) => {
      if (seat.role !== session.role) {
        return seat;
      }

      if (seat.id === seatId) {
        return {
          ...seat,
          claimState: "active",
          joined: false,
          ownershipStatus: "clear",
          screenShareActive: false,
        };
      }

      if (seat.id !== session.ownedSeatId) {
        return seat;
      }

      return {
        ...seat,
        claimState: seat.claimState === "disconnected" ? "disconnected" : "unclaimed",
        joined: false,
        ownershipStatus: "clear",
        screenShareActive: false,
      };
    }),
  };
}

export function updateLocalSeat(session: SessionShell, patch: Partial<SessionSeat>): SessionShell {
  const joinedSeatId = session.joinedSeatId;

  if (joinedSeatId === null) {
    return session;
  }

  return {
    ...session,
    previewCamera: patch.selectedCamera ?? session.previewCamera,
    previewMic: patch.selectedMic ?? session.previewMic,
    seats: session.seats.map((seat) => {
      if (seat.id !== joinedSeatId) {
        return seat;
      }

      return {
        ...seat,
        ...patch,
      };
    }),
  };
}

export function getLocalSeat(session: SessionShell) {
  if (session.joinedSeatId === null) {
    return null;
  }

  return session.seats.find((seat) => seat.id === session.joinedSeatId) ?? null;
}

export function shouldModelDisconnect(recordingPhase: RecordingPhase) {
  return (
    recordingPhase === "recording" || recordingPhase === "draining" || recordingPhase === "failed"
  );
}

function normalizeSeat(session: SessionShell, seat: SessionSeat): SessionSeat {
  const joined = seat.claimState === "active" && (seat.id === session.joinedSeatId || seat.joined);
  const ownedByCurrentBrowser = seat.id === session.ownedSeatId;
  const baseOwnershipStatus =
    seat.ownershipStatus === "takeover_required" ? "takeover_required" : "clear";
  const ownershipStatus =
    joined || seat.claimState !== "disconnected" ? baseOwnershipStatus : "rejoin_available";

  return {
    ...seat,
    joined,
    liveCallStatus: joined ? "connected" : "disconnected",
    localCaptureStatus: joined
      ? phaseJoinedCaptureStatus(session.recordingPhase)
      : seat.claimState === "disconnected"
        ? phaseInterruptedCaptureStatus(session.recordingPhase)
        : "not_recording",
    ownershipStatus,
    pickerState: ownedByCurrentBrowser
      ? "you"
      : ownershipStatus === "takeover_required" || seat.claimState === "active"
        ? "in_use"
        : seat.claimState === "disconnected"
          ? "rejoin_available"
          : "available",
    uploadStatus: joined
      ? phaseJoinedUploadStatus(session.recordingPhase)
      : seat.claimState === "disconnected"
        ? phaseBacklogStatus(session.recordingPhase)
        : "synced",
  };
}

function phaseJoinedCaptureStatus(recordingPhase: RecordingPhase): LocalCaptureStatus {
  if (recordingPhase === "recording") {
    return "recording";
  }

  if (recordingPhase === "failed") {
    return "issue";
  }

  return "not_recording";
}

function phaseInterruptedCaptureStatus(recordingPhase: RecordingPhase): LocalCaptureStatus {
  return recordingPhase === "recording" || recordingPhase === "failed" ? "issue" : "not_recording";
}

function phaseJoinedUploadStatus(recordingPhase: RecordingPhase): UploadStatus {
  if (recordingPhase === "recording") {
    return "uploading";
  }

  if (recordingPhase === "draining") {
    return "catching_up";
  }

  if (recordingPhase === "failed") {
    return "failed";
  }

  return "synced";
}

function phaseBacklogStatus(recordingPhase: RecordingPhase): UploadStatus {
  if (recordingPhase === "failed") {
    return "failed";
  }

  return recordingPhase === "recording" || recordingPhase === "draining" ? "catching_up" : "synced";
}
