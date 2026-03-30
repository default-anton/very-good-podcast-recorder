import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { createControlSessionPath, ensureControlSession } from "./lib/api";
import { controlQueryKeys } from "./lib/query";
import {
  CAMERA_OPTIONS,
  controlAppReducer,
  createInitialAppState,
  DEFAULT_SESSION_ID,
  HOST_SEAT_ID,
  MIC_OPTIONS,
  presentSession,
} from "./lib/state";
import type { ControlSession, DemoPreset, Seat, SessionLinks, SessionStatus } from "./lib/types";
import { SessionRoomPage } from "./routes/SessionRoomPage";
import { SessionSetupPage } from "./routes/SessionSetupPage";

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
  roleLinks: SessionLinks | null;
  roleLinksStatus: "error" | "loading" | "ready";
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

const ControlAppContext = createContext<ControlAppContextValue | null>(null);

export function App() {
  return (
    <Routes>
      <Route
        element={<Navigate replace to={createControlSessionPath(DEFAULT_SESSION_ID)} />}
        path="/"
      />
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
  const sessionContractQuery = useQuery({
    queryFn: () => ensureControlSession(sessionId),
    queryKey: controlQueryKeys.session(sessionId),
  });
  const roleLinks = sessionContractQuery.data?.session.links ?? null;
  const roleLinksStatus = sessionContractQuery.isError
    ? "error"
    : sessionContractQuery.isSuccess
      ? "ready"
      : "loading";

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
      roleLinks,
      roleLinksStatus,
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
    [roleLinks, roleLinksStatus, session],
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
              This slice keeps the responsive host shells local-first while the embedded
              control-plane API contract comes online underneath them.
            </p>
          </div>
          <div className="rounded-md border border-line bg-panel-raised px-4 py-3">
            <p className="section-label">Shell status</p>
            <p className="mt-2 font-mono text-sm text-text">
              control / demo-local-ui / local-api-ready
            </p>
          </div>
        </header>

        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
