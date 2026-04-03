import { Navigate, Route, Routes } from "react-router-dom";

import { ControlSessionApp } from "./ControlSessionApp";
import { createControlSessionPath } from "./lib/api";
import { DEFAULT_SESSION_ID } from "./lib/state";

export function App() {
  return (
    <Routes>
      <Route
        element={<Navigate replace to={createControlSessionPath(DEFAULT_SESSION_ID)} />}
        path="/"
      />
      <Route element={<ControlSessionApp />} path="/sessions/:sessionId/*" />
    </Routes>
  );
}
