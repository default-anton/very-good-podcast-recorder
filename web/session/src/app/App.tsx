import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { buildJoinHref } from "../../../shared/joinLinks";
import type { SessionBootstrapResponse } from "../../../shared/sessionContract";

import { Card, CardBody, CardHeader } from "./components/ui";
import { useQuery } from "@tanstack/react-query";

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
import { sessionBootstrapQueryOptions, sessionRoleLinksQueryOptions } from "./lib/query";
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
      <Route element={<DefaultGuestJoinRedirect />} path="/" />
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

function DefaultGuestJoinRedirect() {
  const roleLinksQuery = useQuery(sessionRoleLinksQueryOptions(DEFAULT_SESSION_ID));

  if (roleLinksQuery.isPending) {
    return (
      <SessionBootstrapStateCard
        body="Provisioning the default local guest link from the control-plane session contract."
        title="Preparing local role link"
        tone="info"
      />
    );
  }

  if (roleLinksQuery.isError) {
    return (
      <SessionBootstrapStateCard
        body="The local control plane did not return the default guest link. Start from the control shell or try again."
        detail={roleLinksQuery.error.message}
        title="Default guest link is unavailable"
      />
    );
  }

  return (
    <Navigate replace to={toSessionAppJoinHref(DEFAULT_SESSION_ID, roleLinksQuery.data.guest)} />
  );
}

function SessionScopedApp() {
  const location = useLocation();
  const { role, sessionId } = useParams();
  const scopedSessionId = sessionId ?? DEFAULT_SESSION_ID;
  const joinKey = useRememberedJoinKey(location.search);

  if (!isJoinRole(role)) {
    return (
      <SessionBootstrapStateCard
        body="The session shell only accepts host and guest role links."
        detail={`Requested role: ${role ?? "missing"}`}
        title="This role link is not valid"
      />
    );
  }

  if (joinKey === null) {
    return (
      <SessionBootstrapStateCard
        body="This join URL is missing its role-link key. Reopen the latest host-generated link and try again."
        title="This role link is incomplete"
      />
    );
  }

  return <ValidatedSessionScopedApp joinKey={joinKey} role={role} sessionId={scopedSessionId} />;
}

function ValidatedSessionScopedApp({
  joinKey,
  role,
  sessionId,
}: {
  joinKey: string;
  role: JoinRole;
  sessionId: string;
}) {
  const bootstrapQuery = useQuery(sessionBootstrapQueryOptions(sessionId, role, joinKey));

  if (bootstrapQuery.isPending) {
    return (
      <SessionBootstrapStateCard
        body="Checking this role link against the local control-plane bootstrap endpoint."
        title="Validating role link"
        tone="info"
      />
    );
  }

  if (bootstrapQuery.isError) {
    return (
      <SessionBootstrapStateCard
        body="The local control plane rejected this role link. Reopen the latest host-generated URL and try again."
        detail={bootstrapQuery.error.message}
        title="This role link is not valid"
      />
    );
  }

  return (
    <SessionScopedAppInner
      bootstrap={bootstrapQuery.data}
      key={`${role}:${sessionId}:${joinKey}`}
      role={role}
      sessionId={sessionId}
    />
  );
}

function SessionScopedAppInner({
  bootstrap,
  role,
  sessionId,
}: {
  bootstrap: SessionBootstrapResponse;
  role: JoinRole;
  sessionId: string;
}) {
  const [state, dispatch] = useReducer(
    sessionAppReducer,
    { bootstrap, role, sessionId },
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

function SessionBootstrapStateCard({
  body,
  detail,
  title,
  tone = "danger",
}: {
  body: string;
  detail?: string;
  title: string;
  tone?: "danger" | "info";
}) {
  return (
    <AppShell>
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <p className="section-label">Role link validation</p>
          <h2 className="mt-3 text-xl font-semibold text-text">{title}</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-text">{body}</p>
          {detail === undefined ? null : (
            <p className={tone === "danger" ? "fine-print text-danger" : "fine-print text-text"}>
              {detail}
            </p>
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}

function toSessionAppJoinHref(sessionId: string, roleLink: string) {
  const joinKey = new URL(roleLink).searchParams.get("k");

  if (joinKey === null || joinKey.length === 0) {
    throw new Error("Local role link is missing its join key.");
  }

  return buildJoinHref(sessionId, "guest", joinKey);
}

function useRememberedJoinKey(search: string) {
  const rememberedJoinKey = useRef<string | null>(null);
  const joinKey = new URLSearchParams(search).get("k");

  if (joinKey !== null && joinKey.length > 0) {
    rememberedJoinKey.current = joinKey;
  }

  return rememberedJoinKey.current;
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
            <p className="mt-2 font-mono text-sm text-text">session / bootstrap / local api</p>
          </div>
        </header>

        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
