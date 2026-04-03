import type { QueryClient } from "@tanstack/react-query";

import type {
  ControlSessionResponse,
  UpdateControlSeatInput,
  UpdateControlSessionInput,
} from "./api";
import { controlQueryKeys } from "./query";
import { createInitialSession, normalizeControlSession } from "./state";
import type { ControlSession } from "./types";

export function getCachedControlSession(
  queryClient: QueryClient,
  sessionId: string,
  fallbackSession?: ControlSession,
) {
  const response = queryClient.getQueryData<ControlSessionResponse>(
    controlQueryKeys.session(sessionId),
  );

  return response?.session ?? fallbackSession ?? createInitialSession(sessionId);
}

export function patchControlSessionResponse(
  response: ControlSessionResponse,
  patch: UpdateControlSessionInput,
): ControlSessionResponse {
  return {
    ...response,
    session: normalizeControlSession({
      ...response.session,
      ...patch,
    }),
  };
}

export function patchControlSeatResponse(
  response: ControlSessionResponse,
  seatId: string,
  patch: UpdateControlSeatInput,
): ControlSessionResponse {
  return {
    ...response,
    session: normalizeControlSession({
      ...response.session,
      seats: response.session.seats.map((seat) => {
        if (seat.id !== seatId) {
          return seat;
        }

        return {
          ...seat,
          ...patch,
        };
      }),
    }),
  };
}
