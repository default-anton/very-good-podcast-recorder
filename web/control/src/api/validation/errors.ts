import type { SessionStatus } from "../../../../shared/sessionContract";

import { errorResponse } from "../http/response";

export function invalidFieldResponse(request: Request, field: string, expected: string) {
  return errorResponse(request, 400, "invalid_field", `${field} must be ${expected}.`, "session");
}

export function rosterLockedResponse(
  request: Request,
  sessionId: string,
  currentStatus: SessionStatus,
  target: string,
) {
  return errorResponse(
    request,
    409,
    "session_roster_locked",
    `${target} are locked while local session ${sessionId} is ${currentStatus}. Create a new session for a different active or ended roster.`,
    "session",
  );
}

export function terminalSessionResponse(request: Request, sessionId: string) {
  return errorResponse(
    request,
    409,
    "session_ended",
    `Local session ${sessionId} is ended. This session is history-only and can no longer be edited.`,
    "session",
  );
}

export function invalidSessionTransitionResponse(
  request: Request,
  sessionId: string,
  message: string,
) {
  return errorResponse(
    request,
    409,
    "invalid_session_transition",
    `${message} Provision a new local session or return to setup instead of forcing this transition.`,
    "session",
  );
}

export function missingSeatOrSessionResponse(request: Request, sessionId: string, seatId: string) {
  return errorResponse(
    request,
    404,
    "seat_not_found",
    `Seat ${seatId} does not exist in local session ${sessionId}. Provision the session and roster before editing this seat.`,
    "session",
  );
}
