import {
  CAMERA_OPTIONS,
  createBaseSession,
  MIC_OPTIONS,
  type SessionBootstrapSeed,
} from "./session-fixtures";
import { normalizeSessionState } from "./session-model";
import type { JoinDemoPreset, RoomDemoPreset, SessionShell } from "./types";

export function buildSessionForJoinPreset(
  bootstrap: SessionBootstrapSeed,
  preset: JoinDemoPreset,
  previewMic = MIC_OPTIONS[0],
  previewCamera = CAMERA_OPTIONS[0],
): SessionShell {
  const session = createBaseSession(bootstrap, previewMic, previewCamera);
  const roleSeats = session.seats.filter((seat) => seat.role === session.role);

  if (roleSeats.length === 0) {
    throw new Error("Session shell requires at least one seat for the active role.");
  }

  const [firstSeat, secondSeat, thirdSeat] = roleSeats;

  if (preset === "owned") {
    return normalizeSessionState({
      ...session,
      ownedSeatId: firstSeat.id,
      selectedSeatId: firstSeat.id,
      seats: session.seats.map((seat) => {
        if (seat.id === firstSeat.id) {
          return {
            ...seat,
            claimState: "active",
            joined: false,
          };
        }

        if (seat.id === secondSeat?.id) {
          return {
            ...seat,
            claimState: "active",
            joined: true,
          };
        }

        if (seat.id === thirdSeat?.id) {
          return {
            ...seat,
            claimState: "disconnected",
            joined: false,
          };
        }

        return seat;
      }),
    });
  }

  if (preset === "recover") {
    return normalizeSessionState({
      ...session,
      seats: session.seats.map((seat) => {
        if (seat.id === firstSeat.id) {
          return {
            ...seat,
            claimState: "disconnected",
            joined: false,
          };
        }

        if (seat.id === secondSeat?.id) {
          return {
            ...seat,
            claimState: "unclaimed",
            joined: false,
          };
        }

        if (seat.id === thirdSeat?.id) {
          return {
            ...seat,
            claimState: "active",
            joined: true,
          };
        }

        return seat;
      }),
    });
  }

  if (preset === "takeover") {
    return normalizeSessionState({
      ...session,
      seats: session.seats.map((seat) => {
        if (seat.id === firstSeat.id) {
          return {
            ...seat,
            claimState: "active",
            joined: true,
            ownershipStatus: "takeover_required",
          };
        }

        if (seat.id === secondSeat?.id) {
          return {
            ...seat,
            claimState: "unclaimed",
            joined: false,
          };
        }

        if (seat.id === thirdSeat?.id) {
          return {
            ...seat,
            claimState: "disconnected",
            joined: false,
          };
        }

        return seat;
      }),
    });
  }

  return normalizeSessionState({
    ...session,
    seats: session.seats.map((seat) => {
      if (seat.id === firstSeat.id) {
        return {
          ...seat,
          claimState: "unclaimed",
          joined: false,
        };
      }

      if (seat.id === secondSeat?.id) {
        return {
          ...seat,
          claimState: "active",
          joined: true,
        };
      }

      if (seat.id === thirdSeat?.id) {
        return {
          ...seat,
          claimState: "disconnected",
          joined: false,
        };
      }

      return seat;
    }),
  });
}

export function presentSessionShell(session: SessionShell, roomPreset: RoomDemoPreset) {
  const normalized = normalizeSessionState(session);

  if (roomPreset === "steady" || normalized.joinedSeatId === null) {
    return normalized;
  }

  return applyRoomDemoPreset(normalized, roomPreset);
}

function applyRoomDemoPreset(session: SessionShell, preset: RoomDemoPreset): SessionShell {
  const demoSeatId = session.role === "host" ? findRemoteDemoSeatId(session) : session.joinedSeatId;

  if (demoSeatId === null) {
    return session;
  }

  if (preset === "reconnecting") {
    return {
      ...session,
      recordingHealth: session.recordingPhase === "failed" ? "failed" : "degraded",
      seats: session.seats.map((seat) => {
        if (seat.id !== demoSeatId) {
          return seat;
        }

        return {
          ...seat,
          liveCallStatus: "reconnecting",
          uploadStatus: "catching_up",
        };
      }),
    };
  }

  if (preset === "catching_up") {
    return {
      ...session,
      recordingHealth: session.recordingPhase === "failed" ? "failed" : "degraded",
      seats: session.seats.map((seat) => {
        if (seat.id !== demoSeatId) {
          return seat;
        }

        return {
          ...seat,
          uploadStatus: "catching_up",
        };
      }),
    };
  }

  return {
    ...session,
    recordingHealth: "failed",
    seats: session.seats.map((seat) => {
      if (seat.id !== demoSeatId) {
        return seat;
      }

      return {
        ...seat,
        localCaptureStatus: "issue",
        uploadStatus: "failed",
      };
    }),
  };
}

function findRemoteDemoSeatId(session: SessionShell) {
  const remoteSeat = session.seats.find(
    (seat) => seat.id !== session.joinedSeatId && seat.role === "guest",
  );

  return remoteSeat?.id ?? session.joinedSeatId;
}
