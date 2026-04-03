import {
  createStoredSeatResponse,
  deleteStoredSeatResponse,
  getStoredSessionRecord,
  updateStoredSeatResponse,
} from "../sessions";
import { decodePathSegment } from "../http/routes";
import { errorResponse, jsonResponse } from "../http/response";
import { readJsonObject } from "../http/request";
import { missingSeatOrSessionResponse } from "../validation/errors";
import {
  parseSeatPatch,
  validateRosterMutation,
  validateSeatPatch,
} from "../validation/seat-patch";

export async function handleSeatsRoute(request: Request, url: URL, rawSessionId: string) {
  if (request.method !== "POST") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only POST is supported for session seats.",
      "session",
    );
  }

  const sessionId = decodePathSegment(request, rawSessionId, "session id");

  if (sessionId instanceof Response) {
    return sessionId;
  }

  const storedRecord = getStoredSessionRecord(sessionId);

  if (storedRecord === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before editing it.`,
      "session",
    );
  }

  const rosterLockError = validateRosterMutation(request, sessionId, storedRecord.session.status);

  if (rosterLockError !== null) {
    return rosterLockError;
  }

  const response = createStoredSeatResponse(sessionId, url.origin);

  if (response === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before editing it.`,
      "session",
    );
  }

  return jsonResponse(request, response, 200, "session");
}

export async function handleSeatRoute(
  request: Request,
  url: URL,
  rawSessionId: string,
  rawSeatId: string,
) {
  if (request.method !== "DELETE" && request.method !== "PATCH") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only PATCH and DELETE are supported for session seats.",
      "session",
    );
  }

  const sessionId = decodePathSegment(request, rawSessionId, "session id");

  if (sessionId instanceof Response) {
    return sessionId;
  }

  const seatId = decodePathSegment(request, rawSeatId, "seat id");

  if (seatId instanceof Response) {
    return seatId;
  }

  const storedRecord = getStoredSessionRecord(sessionId);

  if (storedRecord === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before editing it.`,
      "session",
    );
  }

  if (request.method === "DELETE") {
    const rosterLockError = validateRosterMutation(request, sessionId, storedRecord.session.status);

    if (rosterLockError !== null) {
      return rosterLockError;
    }

    const response = deleteStoredSeatResponse(sessionId, seatId, url.origin);

    if (response === null) {
      return missingSeatOrSessionResponse(request, sessionId, seatId);
    }

    return jsonResponse(request, response, 200, "session");
  }

  const body = await readJsonObject(request);

  if (body instanceof Response) {
    return body;
  }

  const patch = parseSeatPatch(request, body);

  if (patch instanceof Response) {
    return patch;
  }

  const seatValidationError = validateSeatPatch(
    request,
    sessionId,
    storedRecord.session.status,
    patch,
  );

  if (seatValidationError !== null) {
    return seatValidationError;
  }

  const response = updateStoredSeatResponse(sessionId, seatId, url.origin, patch);

  if (response === null) {
    return missingSeatOrSessionResponse(request, sessionId, seatId);
  }

  return jsonResponse(request, response, 200, "session");
}
