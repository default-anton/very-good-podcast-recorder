import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { buildDemoJoinKey, buildJoinUrl } from "../../../shared/joinLinks";
import type { ControlSession, DemoPreset, RecordingHealth, Seat, SessionStatus } from "./lib/types";
import { SessionRoomPage } from "./routes/SessionRoomPage";
import { SessionSetupPage } from "./routes/SessionSetupPage";

const DEFAULT_SESSION_ID = "amber-session-01";
const HOST_SEAT_ID = "seat-host-01";
const MIC_OPTIONS = ["Studio USB", "Boom Mic", "USB Backup"];
const CAMERA_OPTIONS = ["Desk Cam", "Mirrorless HDMI", "Laptop Camera"];

interface ControlAppContextValue {
  activateSession: () => void;
  addSeat: () => void;
  applyDemoPreset: (preset: DemoPreset) => void;
  cameraOptions: string[];
  endHostedRun: () => void;
  failRecording: () => void;
  finishDrain: () => void;
  joinOperatorRoom: () => void;
  leaveOperatorRoom: () => void;
  micOptions: string[];
  operatorSeatId: string;
  removeSeat: (seatId: string) => void;
  selectHostCamera: (value: string) => void;
  selectHostMic: (value: string) => void;
  session: ControlSession;
  setSessionStatus: (status: Extract<SessionStatus, "draft" | "ready">) => void;
  setTitle: (title: string) => void;
  startRecording: () => void;
  stopRecording: () => void;
  toggleHostCamera: () => void;
  toggleHostMic: () => void;
  toggleHostScreenShare: () => void;
  updateSeat: (seatId: string, patch: Partial<Pick<Seat, "displayName" | "role">>) => void;
}

interface ControlAppState {
  demoPreset: DemoPreset;
  session: ControlSession;
}

type Action =
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

const ControlAppContext = createContext<ControlAppContextValue | null>(null);

export function App() {
  return (
    <Routes>
      <Route element={<Navigate replace to={`/sessions/${DEFAULT_SESSION_ID}`} />} path="/" />
      <Route element={<SessionScopedApp />} path="/sessions/:sessionId/*" />
    </Routes>
  );
}

export function useControlApp() {
  const value = useContext(ControlAppContext);

  if (value === null) {
    throw new Error("useControlApp must be used inside the control app provider.");
  }

  return value;
}

function SessionScopedApp() {
  const { sessionId } = useParams();
  const scopedSessionId = sessionId ?? DEFAULT_SESSION_ID;

  return <SessionScopedAppInner key={scopedSessionId} sessionId={scopedSessionId} />;
}

function SessionScopedAppInner({ sessionId }: { sessionId: string }) {
  const [state, dispatch] = useReducer(controlAppReducer, sessionId, createInitialAppState);
  const session = useMemo(() => presentSession(state), [state]);

  const contextValue = useMemo<ControlAppContextValue>(
    () => ({
      activateSession: () => {
        dispatch({ type: "activate-session" });
      },
      addSeat: () => {
        dispatch({ type: "add-seat" });
      },
      applyDemoPreset: (preset) => {
        dispatch({ preset, type: "apply-demo-preset" });
      },
      cameraOptions: CAMERA_OPTIONS,
      endHostedRun: () => {
        dispatch({ type: "end-hosted-run" });
      },
      failRecording: () => {
        dispatch({ type: "fail-recording" });
      },
      finishDrain: () => {
        dispatch({ type: "finish-drain" });
      },
      joinOperatorRoom: () => {
        dispatch({ type: "join-operator-room" });
      },
      leaveOperatorRoom: () => {
        dispatch({ type: "leave-operator-room" });
      },
      micOptions: MIC_OPTIONS,
      operatorSeatId: HOST_SEAT_ID,
      removeSeat: (seatId) => {
        dispatch({ seatId, type: "remove-seat" });
      },
      selectHostCamera: (value) => {
        dispatch({ type: "select-host-camera", value });
      },
      selectHostMic: (value) => {
        dispatch({ type: "select-host-mic", value });
      },
      session,
      setSessionStatus: (status) => {
        dispatch({ status, type: "set-session-status" });
      },
      setTitle: (title) => {
        dispatch({ title, type: "set-title" });
      },
      startRecording: () => {
        dispatch({ type: "start-recording" });
      },
      stopRecording: () => {
        dispatch({ type: "stop-recording" });
      },
      toggleHostCamera: () => {
        dispatch({ type: "toggle-host-camera" });
      },
      toggleHostMic: () => {
        dispatch({ type: "toggle-host-mic" });
      },
      toggleHostScreenShare: () => {
        dispatch({ type: "toggle-host-screen-share" });
      },
      updateSeat: (seatId, patch) => {
        dispatch({ patch, seatId, type: "update-seat" });
      },
    }),
    [session],
  );

  return (
    <ControlAppContext.Provider value={contextValue}>
      <AppShell>
        <Routes>
          <Route element={<SessionSetupPage />} index />
          <Route element={<SessionRoomPage />} path="room" />
        </Routes>
      </AppShell>
    </ControlAppContext.Provider>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="panel-surface flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Very Good Podcast Recorder</p>
            <h1 className="mt-3 text-2xl font-semibold text-text">Studio utility control shell</h1>
            <p className="fine-print mt-2 max-w-3xl">
              This is the first restored frontend slice: responsive host setup and host room shells
              with local state only.
            </p>
          </div>
          <div className="rounded-md border border-line bg-panel-raised px-4 py-3">
            <p className="section-label">Shell status</p>
            <p className="mt-2 font-mono text-sm text-text">control / demo-local / no backend</p>
          </div>
        </header>

        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}

function controlAppReducer(state: ControlAppState, action: Action): ControlAppState {
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
      return updateBaseSession(state, removeSeat(state.session, action.seatId));
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
      return updateBaseSession(state, updateSeat(state.session, action.seatId, action.patch));
    default:
      return state;
  }
}

function createInitialAppState(sessionId = DEFAULT_SESSION_ID): ControlAppState {
  return {
    demoPreset: "healthy",
    session: normalizeSessionState(createInitialSession(sessionId)),
  };
}

function presentSession(state: ControlAppState) {
  if (
    state.demoPreset === "healthy" ||
    state.session.status === "ended" ||
    state.session.recordingPhase === "failed" ||
    state.session.recordingHealth === "failed"
  ) {
    return state.session;
  }

  return {
    ...state.session,
    recordingHealth: demoHealth(state.demoPreset),
    seats: state.session.seats.map((seat) =>
      applySeatDemoPreset(state.session, seat, state.demoPreset),
    ),
  };
}

function updateBaseSession(state: ControlAppState, session: ControlSession): ControlAppState {
  return {
    ...state,
    session: normalizeSessionState(session),
  };
}

function createInitialSession(sessionId = DEFAULT_SESSION_ID): ControlSession {
  return {
    id: sessionId,
    links: {
      guest: buildJoinUrl(
        "https://app.vgpr.dev",
        sessionId,
        "guest",
        buildDemoJoinKey(sessionId, "guest"),
      ),
      host: buildJoinUrl(
        "https://app.vgpr.dev",
        sessionId,
        "host",
        buildDemoJoinKey(sessionId, "host"),
      ),
    },
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

function createGuestSeat(index: number): Seat {
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

function updateSeat(
  session: ControlSession,
  seatId: string,
  patch: Partial<Pick<Seat, "displayName" | "role">>,
) {
  if (session.status === "active" || session.status === "ended") {
    return session;
  }

  const hostCount = session.seats.filter((seat) => seat.role === "host").length;

  return {
    ...session,
    seats: session.seats.map((seat) => {
      if (seat.id !== seatId) {
        return seat;
      }

      if (
        (patch.role === "guest" && seat.role === "host" && hostCount === 1) ||
        (seat.id === HOST_SEAT_ID && patch.role !== undefined && patch.role !== seat.role)
      ) {
        return {
          ...seat,
          displayName: patch.displayName ?? seat.displayName,
        };
      }

      return {
        ...seat,
        ...patch,
      };
    }),
  };
}

function removeSeat(session: ControlSession, seatId: string) {
  if (
    session.status === "active" ||
    session.status === "ended" ||
    session.seats.length === 1 ||
    seatId === HOST_SEAT_ID
  ) {
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

function joinOperatorRoom(session: ControlSession) {
  return updateHostSeat(session, {
    joined: true,
    ownershipStatus: "clear",
  });
}

function leaveOperatorRoom(session: ControlSession) {
  return updateHostSeat(session, {
    joined: false,
    ownershipStatus: session.status === "active" ? "rejoin_available" : "clear",
  });
}

function normalizeSessionState(session: ControlSession): ControlSession {
  return {
    ...session,
    seats: session.seats.map((seat) => normalizeSeat(session, seat)),
  };
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

function updateHostSeat(session: ControlSession, patch: Partial<Seat>) {
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

function getHostSeat(session: ControlSession) {
  const hostSeat = session.seats.find((seat) => seat.id === HOST_SEAT_ID);

  if (hostSeat === undefined) {
    throw new Error("Host seat is required for the control shell.");
  }

  return hostSeat;
}
