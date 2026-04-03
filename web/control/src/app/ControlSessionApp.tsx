import { Route, Routes, useParams } from "react-router-dom";

import { AppShell } from "./AppShell";
import { ControlAppProvider } from "./ControlAppProvider";
import { DEFAULT_SESSION_ID } from "./lib/state";
import { SessionRoomPage } from "./routes/SessionRoomPage";
import { SessionSetupPage } from "./routes/SessionSetupPage";

export function ControlSessionApp() {
  const { sessionId } = useParams();
  const scopedSessionId = sessionId ?? DEFAULT_SESSION_ID;

  return (
    <ControlAppProvider key={scopedSessionId} sessionId={scopedSessionId}>
      <AppShell>
        <Routes>
          <Route element={<SessionSetupPage />} index />
          <Route element={<SessionRoomPage />} path="room" />
        </Routes>
      </AppShell>
    </ControlAppProvider>
  );
}
