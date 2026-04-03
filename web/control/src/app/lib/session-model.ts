import { HOST_SEAT_ID } from "./session-fixtures";
import type { ControlSession, Seat } from "./types";

export function patchSessionSeat(
  session: ControlSession,
  seatId: string,
  patch: Partial<Seat>,
): ControlSession {
  const hostCount = session.seats.filter((seat) => seat.role === "host").length;

  return {
    ...session,
    seats: session.seats.map((seat) => {
      if (seat.id !== seatId) {
        return seat;
      }

      const nextSeat = {
        ...seat,
        ...patch,
      };

      if (
        (seat.id === HOST_SEAT_ID && patch.role !== undefined && patch.role !== seat.role) ||
        (seat.role === "host" && nextSeat.role === "guest" && hostCount === 1)
      ) {
        nextSeat.role = seat.role;
      }

      return nextSeat;
    }),
  };
}

export function removeSessionSeat(session: ControlSession, seatId: string): ControlSession {
  if (session.seats.length === 1 || seatId === HOST_SEAT_ID) {
    return session;
  }

  const seat = session.seats.find((currentSeat) => currentSeat.id === seatId);

  if (seat === undefined) {
    return session;
  }

  const hostCount = session.seats.filter((currentSeat) => currentSeat.role === "host").length;

  if (seat.role === "host" && hostCount === 1) {
    return session;
  }

  return {
    ...session,
    seats: session.seats.filter((currentSeat) => currentSeat.id !== seatId),
  };
}

export function joinOperatorRoom(session: ControlSession): ControlSession {
  return updateHostSeat(session, {
    joined: true,
    ownershipStatus: "clear",
  });
}

export function leaveOperatorRoom(session: ControlSession): ControlSession {
  return updateHostSeat(session, {
    joined: false,
    ownershipStatus: session.status === "active" ? "rejoin_available" : "clear",
  });
}

export function normalizeControlSession(session: ControlSession): ControlSession {
  return {
    ...session,
    seats: session.seats.map((seat) => normalizeSeat(session, seat)),
  };
}

export function updateHostSeat(session: ControlSession, patch: Partial<Seat>): ControlSession {
  return {
    ...session,
    seats: session.seats.map((seat) => {
      if (seat.id !== HOST_SEAT_ID) {
        return seat;
      }

      return {
        ...seat,
        ...patch,
      };
    }),
  };
}

export function getHostSeat(session: ControlSession): Seat {
  const hostSeat = session.seats.find((seat) => seat.id === HOST_SEAT_ID);

  if (hostSeat === undefined) {
    throw new Error("Host seat is required for the control shell.");
  }

  return hostSeat;
}

function normalizeSeat(session: ControlSession, seat: Seat): Seat {
  const joined = seat.joined;
  const interrupted = !joined && seat.ownershipStatus === "rejoin_available";

  return {
    ...seat,
    liveCallStatus: joined ? "connected" : "disconnected",
    localCaptureStatus: joined
      ? phaseJoinedCaptureStatus(session.recordingPhase)
      : interrupted
        ? phaseInterruptionCaptureStatus(session.recordingPhase)
        : "not_recording",
    ownershipStatus:
      joined && seat.ownershipStatus === "rejoin_available" ? "clear" : seat.ownershipStatus,
    uploadStatus: joined
      ? phaseJoinedUploadStatus(session.recordingPhase)
      : interrupted
        ? phaseBacklogStatus(session.recordingPhase)
        : "synced",
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
