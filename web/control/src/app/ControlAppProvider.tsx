import { createContext, useContext, type ReactNode } from "react";

import {
  useControlSessionController,
  type ControlSessionController,
} from "./useControlSessionController";

type ControlAppContextValue = ControlSessionController;

const ControlAppContext = createContext<ControlAppContextValue | null>(null);

export function ControlAppProvider({
  children,
  sessionId,
}: {
  children: ReactNode;
  sessionId: string;
}) {
  const value = useControlSessionController(sessionId);

  return <ControlAppContext.Provider value={value}>{children}</ControlAppContext.Provider>;
}

export function useControlApp() {
  const value = useContext(ControlAppContext);

  if (value === null) {
    throw new Error("useControlApp must be used inside the control app provider.");
  }

  return value;
}
