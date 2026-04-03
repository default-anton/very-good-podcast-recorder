import type { DemoPreset, Seat, SessionStatus } from "./types";
import { createGuestSeat, createInitialSession } from "./session-fixtures";
import {
  getHostSeat,
  joinOperatorRoom,
  leaveOperatorRoom,
  normalizeControlSession,
  patchSessionSeat,
  removeSessionSeat,
  updateHostSeat,
} from "./session-model";

export interface ControlAppState {
  demoPreset: DemoPreset;
  session: ReturnType<typeof createInitialSession>;
}

export type ControlAppAction =
  | { type: "activate-session" }
  | { type: "add-seat" }
  | { preset: DemoPreset; type: "apply-demo-preset" }
  | { type: "end-hosted-run" }
  | { type: "fail-recording" }
  | { type: "finish-drain" }
  | { type: "join-operator-room" }
  | { type: "leave-operator-room" }
  | { seatId: string; type: "remove-seat" }
  | { value: string; type: "select-host-camera" }
  | { value: string; type: "select-host-mic" }
  | { status: Extract<SessionStatus, "draft" | "ready">; type: "set-session-status" }
  | { title: string; type: "set-title" }
  | { type: "start-recording" }
  | { type: "stop-recording" }
  | { type: "toggle-host-camera" }
  | { type: "toggle-host-mic" }
  | { type: "toggle-host-screen-share" }
  | {
      patch: Partial<Pick<Seat, "displayName" | "role">>;
      seatId: string;
      type: "update-seat";
    };

export function createInitialAppState(sessionId: string): ControlAppState;
export function createInitialAppState(): ControlAppState;
export function createInitialAppState(sessionId?: string): ControlAppState {
  return {
    demoPreset: "healthy",
    session: normalizeControlSession(createInitialSession(sessionId)),
  };
}

export function controlAppReducer(
  state: ControlAppState,
  action: ControlAppAction,
): ControlAppState {
  switch (action.type) {
    case "activate-session":
      if (state.session.status === "active" || state.session.status === "ended") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        recordingHealth: "healthy",
        recordingPhase: "waiting",
        status: "active",
      });
    case "add-seat":
      return updateBaseSession(state, {
        ...state.session,
        nextSeatNumber: state.session.nextSeatNumber + 1,
        seats: [...state.session.seats, createGuestSeat(state.session.nextSeatNumber)],
      });
    case "apply-demo-preset":
      return {
        ...state,
        demoPreset: action.preset,
      };
    case "end-hosted-run":
      if (state.session.status !== "active") {
        return state;
      }

      if (state.session.recordingPhase !== "stopped" && state.session.recordingPhase !== "failed") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        status: "ended",
      });
    case "fail-recording":
      if (state.session.status !== "active") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        recordingHealth: "failed",
        recordingPhase: "failed",
      });
    case "finish-drain":
      if (state.session.recordingPhase !== "draining") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        recordingPhase: "stopped",
      });
    case "join-operator-room":
      return updateBaseSession(state, joinOperatorRoom(state.session));
    case "leave-operator-room":
      return updateBaseSession(state, leaveOperatorRoom(state.session));
    case "remove-seat":
      return updateBaseSession(state, removeSessionSeat(state.session, action.seatId));
    case "select-host-camera":
      return updateBaseSession(
        state,
        updateHostSeat(state.session, { selectedCamera: action.value }),
      );
    case "select-host-mic":
      return updateBaseSession(state, updateHostSeat(state.session, { selectedMic: action.value }));
    case "set-session-status":
      if (state.session.status === "active" || state.session.status === "ended") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        status: action.status,
      });
    case "set-title":
      if (state.session.status === "active" || state.session.status === "ended") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        title: action.title,
      });
    case "start-recording":
      if (state.session.status !== "active") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        recordingHealth: "healthy",
        recordingPhase: "recording",
        status: "active",
      });
    case "stop-recording":
      if (state.session.status !== "active" || state.session.recordingPhase !== "recording") {
        return state;
      }

      return updateBaseSession(state, {
        ...state.session,
        recordingPhase: "draining",
        status: "active",
      });
    case "toggle-host-camera": {
      const hostSeat = getHostSeat(state.session);

      return updateBaseSession(
        state,
        updateHostSeat(state.session, { cameraEnabled: !hostSeat.cameraEnabled }),
      );
    }
    case "toggle-host-mic": {
      const hostSeat = getHostSeat(state.session);

      return updateBaseSession(
        state,
        updateHostSeat(state.session, { micMuted: !hostSeat.micMuted }),
      );
    }
    case "toggle-host-screen-share": {
      const hostSeat = getHostSeat(state.session);

      return updateBaseSession(
        state,
        updateHostSeat(state.session, { screenShareActive: !hostSeat.screenShareActive }),
      );
    }
    case "update-seat":
      return updateBaseSession(state, patchSessionSeat(state.session, action.seatId, action.patch));
    default:
      return state;
  }
}

function updateBaseSession(
  state: ControlAppState,
  session: ReturnType<typeof createInitialSession>,
) {
  return {
    ...state,
    session: normalizeControlSession(session),
  };
}
