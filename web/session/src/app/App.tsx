import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { buildDemoJoinKey, buildJoinHref } from "../../../shared/joinLinks";

import { Card, CardBody, CardHeader } from "./components/ui";
import {
  CAMERA_OPTIONS,
  createInitialAppState,
  DEFAULT_SESSION_ID,
  isJoinRole,
  MIC_OPTIONS,
  presentSession,
  sessionAppReducer,
  type SessionAppAction,
  type SessionAppState,
} from "./lib/sessionState";
import type { JoinDemoPreset, JoinRole, RoomDemoPreset, SessionShell } from "./lib/types";
import { JoinPage } from "./routes/JoinPage";
import { RoomPage } from "./routes/RoomPage";

interface SessionAppContextValue {
  applyJoinPreset: (preset: JoinDemoPreset) => void;
  applyRoomPreset: (preset: RoomDemoPreset) => void;
  cameraOptions: string[];
  chooseSeat: (seatId: string) => void;
  clearSeatSelection: () => void;
  confirmTakeover: () => void;
  dismissTakeover: () => void;
  failRecording: () => void;
  finishDrain: () => void;
  joinPreset: JoinDemoPreset;
  joinRoom: () => void;
  leaveRoom: () => void;
  micOptions: string[];
  roomPreset: RoomDemoPreset;
  selectLocalCamera: (value: string) => void;
  selectLocalMic: (value: string) => void;
  selectPreviewCamera: (value: string) => void;
  selectPreviewMic: (value: string) => void;
  session: SessionShell;
  startRecording: () => void;
  stopRecording: () => void;
  takeoverSeatId: string | null;
  toggleLocalCamera: () => void;
  toggleLocalMic: () => void;
  toggleLocalScreenShare: () => void;
}

const SessionAppContext = createContext<SessionAppContextValue | null>(null);

export function App() {
  return (
    <Routes>
      <Route
        element={
          <Navigate
            replace
            to={buildJoinHref(
              DEFAULT_SESSION_ID,
              "guest",
              buildDemoJoinKey(DEFAULT_SESSION_ID, "guest"),
            )}
          />
        }
        path="/"
      />
      <Route element={<SessionScopedApp />} path="/join/:sessionId/:role/*" />
    </Routes>
  );
}

export function useSessionApp() {
  const value = useContext(SessionAppContext);

  if (value === null) {
    throw new Error("useSessionApp must be used inside the session app provider.");
  }

  return value;
}

function SessionScopedApp() {
  const { role, sessionId } = useParams();
  const scopedSessionId = sessionId ?? DEFAULT_SESSION_ID;

  if (!isJoinRole(role)) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <p className="section-label">Role link validation</p>
            <h2 className="mt-3 text-xl font-semibold text-text">This role link is not valid</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-text">
              The session shell only accepts <span className="font-mono">host</span> and{" "}
              <span className="font-mono">guest</span> role links.
            </p>
            <p className="fine-print">
              Requested role: <span className="font-mono text-text">{role ?? "missing"}</span>
            </p>
          </CardBody>
        </Card>
      </AppShell>
    );
  }

  return (
    <SessionScopedAppInner
      key={`${role}:${scopedSessionId}`}
      role={role}
      sessionId={scopedSessionId}
    />
  );
}

function SessionScopedAppInner({ role, sessionId }: { role: JoinRole; sessionId: string }) {
  const [state, dispatch] = useReducer(
    sessionAppReducer,
    { role, sessionId },
    createInitialAppState,
  );
  const session = useMemo(() => presentSession(state), [state]);
  const contextValue = useSessionAppContextValue(state, session, dispatch);

  return (
    <SessionAppContext.Provider value={contextValue}>
      <AppShell>
        <Routes>
          <Route element={<JoinPage />} index />
          <Route element={<RoomPage />} path="room" />
        </Routes>
      </AppShell>
    </SessionAppContext.Provider>
  );
}

function useSessionAppContextValue(
  state: SessionAppState,
  session: SessionShell,
  dispatch: Dispatch<SessionAppAction>,
): SessionAppContextValue {
  return useMemo(
    () => ({
      applyJoinPreset: (preset) => {
        dispatch({ preset, type: "apply-join-preset" });
      },
      applyRoomPreset: (preset) => {
        dispatch({ preset, type: "apply-room-preset" });
      },
      cameraOptions: CAMERA_OPTIONS,
      chooseSeat: (seatId) => {
        dispatch({ seatId, type: "choose-seat" });
      },
      clearSeatSelection: () => {
        dispatch({ type: "clear-seat-selection" });
      },
      confirmTakeover: () => {
        dispatch({ type: "confirm-takeover" });
      },
      dismissTakeover: () => {
        dispatch({ type: "dismiss-takeover" });
      },
      failRecording: () => {
        dispatch({ type: "fail-recording" });
      },
      finishDrain: () => {
        dispatch({ type: "finish-drain" });
      },
      joinPreset: state.joinPreset,
      joinRoom: () => {
        dispatch({ type: "join-room" });
      },
      leaveRoom: () => {
        dispatch({ type: "leave-room" });
      },
      micOptions: MIC_OPTIONS,
      roomPreset: state.roomPreset,
      selectLocalCamera: (value) => {
        dispatch({ type: "select-local-camera", value });
      },
      selectLocalMic: (value) => {
        dispatch({ type: "select-local-mic", value });
      },
      selectPreviewCamera: (value) => {
        dispatch({ type: "select-preview-camera", value });
      },
      selectPreviewMic: (value) => {
        dispatch({ type: "select-preview-mic", value });
      },
      session,
      startRecording: () => {
        dispatch({ type: "start-recording" });
      },
      stopRecording: () => {
        dispatch({ type: "stop-recording" });
      },
      takeoverSeatId: state.takeoverSeatId,
      toggleLocalCamera: () => {
        dispatch({ type: "toggle-local-camera" });
      },
      toggleLocalMic: () => {
        dispatch({ type: "toggle-local-mic" });
      },
      toggleLocalScreenShare: () => {
        dispatch({ type: "toggle-local-screen-share" });
      },
    }),
    [dispatch, session, state.joinPreset, state.roomPreset, state.takeoverSeatId],
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="panel-surface flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Very Good Podcast Recorder</p>
            <h1 className="mt-3 text-2xl font-semibold text-text">Studio utility session shell</h1>
            <p className="fine-print mt-2 max-w-3xl">
              This slice restores the guest-side browser app: role-link validation, seat claiming,
              device preview, and a responsive room shell with local-state-only signals.
            </p>
          </div>
          <div className="rounded-md border border-line bg-panel-raised px-4 py-3">
            <p className="section-label">Shell status</p>
            <p className="mt-2 font-mono text-sm text-text">session / demo-local / no backend</p>
          </div>
        </header>

        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
