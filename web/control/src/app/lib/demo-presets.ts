import { HOST_SEAT_ID } from "./session-fixtures";
import type { ControlSession, DemoPreset, RecordingHealth, Seat } from "./types";

export function presentSession({
  demoPreset,
  session,
}: {
  demoPreset: DemoPreset;
  session: ControlSession;
}): ControlSession {
  if (
    demoPreset === "healthy" ||
    session.status === "ended" ||
    session.recordingPhase === "failed" ||
    session.recordingHealth === "failed"
  ) {
    return session;
  }

  return {
    ...session,
    recordingHealth: demoHealth(demoPreset),
    seats: session.seats.map((seat) => applySeatDemoPreset(session, seat, demoPreset)),
  };
}

function applySeatDemoPreset(session: ControlSession, seat: Seat, preset: DemoPreset): Seat {
  if (seat.id === HOST_SEAT_ID || preset === "healthy" || seat.id !== "seat-guest-03") {
    return seat;
  }

  if (preset === "reconnect") {
    return {
      ...seat,
      joined: true,
      liveCallStatus: "reconnecting",
      localCaptureStatus: phaseJoinedCaptureStatus(session.recordingPhase),
      ownershipStatus: "clear",
      uploadStatus: phaseBacklogStatus(session.recordingPhase),
    };
  }

  if (preset === "catchup") {
    return {
      ...seat,
      joined: true,
      liveCallStatus: "connected",
      localCaptureStatus: phaseJoinedCaptureStatus(session.recordingPhase),
      ownershipStatus: "clear",
      uploadStatus: phaseBacklogStatus(session.recordingPhase),
    };
  }

  if (preset === "rejoin") {
    return {
      ...seat,
      joined: false,
      liveCallStatus: "disconnected",
      localCaptureStatus: phaseInterruptionCaptureStatus(session.recordingPhase),
      ownershipStatus: "rejoin_available",
      uploadStatus: phaseBacklogStatus(session.recordingPhase),
    };
  }

  if (preset === "takeover") {
    return {
      ...seat,
      joined: true,
      liveCallStatus: "connected",
      localCaptureStatus: phaseJoinedCaptureStatus(session.recordingPhase),
      ownershipStatus: "takeover_required",
      uploadStatus: phaseJoinedUploadStatus(session.recordingPhase),
    };
  }

  return {
    ...seat,
    joined: true,
    liveCallStatus: "connected",
    localCaptureStatus: "issue",
    ownershipStatus: "clear",
    uploadStatus: "failed",
  };
}

function phaseJoinedCaptureStatus(recordingPhase: ControlSession["recordingPhase"]) {
  return recordingPhase === "recording" ? "recording" : "not_recording";
}

function phaseInterruptionCaptureStatus(recordingPhase: ControlSession["recordingPhase"]) {
  return recordingPhase === "recording" ? "issue" : "not_recording";
}

function phaseJoinedUploadStatus(recordingPhase: ControlSession["recordingPhase"]) {
  if (recordingPhase === "recording") {
    return "uploading";
  }

  if (recordingPhase === "draining") {
    return "catching_up";
  }

  return "synced";
}

function phaseBacklogStatus(recordingPhase: ControlSession["recordingPhase"]) {
  return recordingPhase === "recording" || recordingPhase === "draining" ? "catching_up" : "synced";
}

function demoHealth(preset: DemoPreset): RecordingHealth {
  if (preset === "healthy" || preset === "takeover") {
    return "healthy";
  }

  if (preset === "issue") {
    return "failed";
  }

  return "degraded";
}
