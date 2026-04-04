import type { SessionBootstrapResponse } from "../../../../shared/sessionContract";
import { buildSessionForJoinPreset, presentSessionShell } from "./demo-presets";
import { createBootstrapSeed, type SessionBootstrapSeed } from "./session-fixtures";
import {
  claimSeat,
  getLocalSeat,
  normalizeSessionState,
  shouldModelDisconnect,
  updateLocalSeat,
} from "./session-model";
import type { JoinDemoPreset, JoinRole, RoomDemoPreset, SessionShell } from "./types";

export interface SessionAppState {
  bootstrap: SessionBootstrapSeed;
  joinPreset: JoinDemoPreset;
  roomPreset: RoomDemoPreset;
  session: SessionShell;
  takeoverSeatId: string | null;
}

export type SessionAppAction =
  | { preset: JoinDemoPreset; type: "apply-join-preset" }
  | { preset: RoomDemoPreset; type: "apply-room-preset" }
  | { seatId: string; type: "choose-seat" }
  | { type: "clear-seat-selection" }
  | { type: "confirm-takeover" }
  | { type: "dismiss-takeover" }
  | { type: "fail-recording" }
  | { type: "finish-drain" }
  | { type: "join-room" }
  | { type: "leave-room" }
  | { value: string; type: "select-local-camera" }
  | { value: string; type: "select-local-mic" }
  | { value: string; type: "select-preview-camera" }
  | { value: string; type: "select-preview-mic" }
  | { type: "start-recording" }
  | { type: "stop-recording" }
  | { type: "toggle-local-camera" }
  | { type: "toggle-local-mic" }
  | { type: "toggle-local-screen-share" };

export function createInitialAppState({
  bootstrap: bootstrapResponse,
  role,
  sessionId,
}: {
  bootstrap?: SessionBootstrapResponse;
  role: JoinRole;
  sessionId: string;
}): SessionAppState {
  const bootstrap = createBootstrapSeed({ bootstrap: bootstrapResponse, role, sessionId });

  return {
    bootstrap,
    joinPreset: "fresh",
    roomPreset: "steady",
    session: buildSessionForJoinPreset(bootstrap, "fresh"),
    takeoverSeatId: null,
  };
}

export function presentSession(state: SessionAppState) {
  return presentSessionShell(state.session, state.roomPreset);
}

export function sessionAppReducer(
  state: SessionAppState,
  action: SessionAppAction,
): SessionAppState {
  switch (action.type) {
    case "apply-join-preset": {
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      const session = buildSessionForJoinPreset(
        state.bootstrap,
        action.preset,
        state.session.previewMic,
        state.session.previewCamera,
      );

      return {
        ...state,
        joinPreset: action.preset,
        roomPreset: "steady",
        session,
        takeoverSeatId: null,
      };
    }
    case "apply-room-preset":
      return {
        ...state,
        roomPreset: action.preset,
      };
    case "choose-seat": {
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      const seat = state.session.seats.find((currentSeat) => currentSeat.id === action.seatId);

      if (seat === undefined || seat.role !== state.session.role) {
        return state;
      }

      if (seat.pickerState === "in_use") {
        return {
          ...state,
          takeoverSeatId: seat.id,
        };
      }

      return updateSessionState(state, claimSeat(state.session, seat.id));
    }
    case "clear-seat-selection":
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        selectedSeatId: null,
      });
    case "confirm-takeover":
      if (state.session.joinedSeatId !== null || state.takeoverSeatId === null) {
        return state;
      }

      return {
        ...updateSessionState(state, claimSeat(state.session, state.takeoverSeatId)),
        takeoverSeatId: null,
      };
    case "dismiss-takeover":
      return {
        ...state,
        takeoverSeatId: null,
      };
    case "fail-recording":
      if (state.session.role !== "host" || state.session.joinedSeatId === null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingHealth: "failed",
        recordingPhase: "failed",
      });
    case "finish-drain":
      if (state.session.recordingPhase !== "draining") {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingPhase: "stopped",
      });
    case "join-room": {
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      const selectedSeatId = state.session.selectedSeatId;

      if (selectedSeatId === null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        joinedSeatId: selectedSeatId,
        ownedSeatId: selectedSeatId,
        seats: state.session.seats.map((seat) => {
          if (seat.id !== selectedSeatId) {
            return seat;
          }

          return {
            ...seat,
            claimState: "active",
            joined: true,
            ownershipStatus: "clear",
            selectedCamera: state.session.previewCamera,
            selectedMic: state.session.previewMic,
          };
        }),
      });
    }
    case "leave-room": {
      const joinedSeatId = state.session.joinedSeatId;

      if (joinedSeatId === null) {
        return state;
      }

      const disconnectOnLeave = shouldModelDisconnect(state.session.recordingPhase);

      return updateSessionState(state, {
        ...state.session,
        joinedSeatId: null,
        selectedSeatId: null,
        seats: state.session.seats.map((seat) => {
          if (seat.id !== joinedSeatId) {
            return seat;
          }

          return {
            ...seat,
            claimState: disconnectOnLeave ? "disconnected" : "active",
            joined: false,
            ownershipStatus: "clear",
            screenShareActive: false,
          };
        }),
      });
    }
    case "select-local-camera":
      return updateSessionState(
        state,
        updateLocalSeat(state.session, { selectedCamera: action.value }),
      );
    case "select-local-mic":
      return updateSessionState(
        state,
        updateLocalSeat(state.session, { selectedMic: action.value }),
      );
    case "select-preview-camera":
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        previewCamera: action.value,
      });
    case "select-preview-mic":
      if (state.session.joinedSeatId !== null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        previewMic: action.value,
      });
    case "start-recording":
      if (state.session.role !== "host" || state.session.joinedSeatId === null) {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingHealth: "healthy",
        recordingPhase: "recording",
      });
    case "stop-recording":
      if (state.session.role !== "host" || state.session.recordingPhase !== "recording") {
        return state;
      }

      return updateSessionState(state, {
        ...state.session,
        recordingPhase: "draining",
      });
    case "toggle-local-camera": {
      const localSeat = getLocalSeat(state.session);

      if (localSeat === null) {
        return state;
      }

      return updateSessionState(
        state,
        updateLocalSeat(state.session, { cameraEnabled: !localSeat.cameraEnabled }),
      );
    }
    case "toggle-local-mic": {
      const localSeat = getLocalSeat(state.session);

      if (localSeat === null) {
        return state;
      }

      return updateSessionState(
        state,
        updateLocalSeat(state.session, { micMuted: !localSeat.micMuted }),
      );
    }
    case "toggle-local-screen-share": {
      const localSeat = getLocalSeat(state.session);

      if (localSeat === null) {
        return state;
      }

      return updateSessionState(
        state,
        updateLocalSeat(state.session, { screenShareActive: !localSeat.screenShareActive }),
      );
    }
    default:
      return state;
  }
}

export function isJoinRole(value: string | undefined): value is JoinRole {
  return value === "host" || value === "guest";
}

function updateSessionState(state: SessionAppState, session: SessionShell): SessionAppState {
  return {
    ...state,
    session: normalizeSessionState(session),
  };
}
