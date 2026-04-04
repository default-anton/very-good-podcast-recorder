import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { ControlSession, ControlSessionResponse } from "../shared/sessionContract";
import { controlQueryKeys } from "../control/src/app/lib/query";
import { getLocalLiveKitUrl, getLocalSessiondBaseUrl } from "../shared/localRuntime";
import {
  getCachedControlSession,
  patchControlSeatResponse,
} from "../control/src/app/lib/session-contract";
import { createInitialSession } from "../control/src/app/lib/state";

describe("control session contract cache", () => {
  it("reads rapid host toggles from the latest cached session snapshot", () => {
    const queryClient = new QueryClient();
    const sessionId = "toggle-cache-proof-01";
    const queryKey = controlQueryKeys.session(sessionId);
    const initialResponse = createResponse(sessionId);

    queryClient.setQueryData(queryKey, initialResponse);

    const firstSession = getCachedControlSession(queryClient, sessionId);
    const firstToggleValue = !hostSeat(firstSession).micMuted;

    queryClient.setQueryData(
      queryKey,
      patchControlSeatResponse(initialResponse, "seat-host-01", {
        micMuted: firstToggleValue,
      }),
    );

    const secondSession = getCachedControlSession(queryClient, sessionId);
    const secondToggleValue = !hostSeat(secondSession).micMuted;

    expect(firstToggleValue).toBe(true);
    expect(hostSeat(secondSession).micMuted).toBe(true);
    expect(secondToggleValue).toBe(false);
  });
});

function createResponse(sessionId: string): ControlSessionResponse {
  return {
    runtime: {
      baseUrl: getLocalSessiondBaseUrl(),
      liveKitUrl: getLocalLiveKitUrl(),
      roomName: sessionId,
      state: "ready",
      turn: null,
    },
    session: createInitialSession(sessionId),
  };
}

function hostSeat(session: ControlSession) {
  const match = session.seats.find((seat) => seat.id === "seat-host-01");

  if (match === undefined) {
    throw new Error("Host seat missing from control session cache test.");
  }

  return match;
}
