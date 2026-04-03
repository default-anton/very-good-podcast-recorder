import {
  getStoredSessionRecord,
  createControlSessionResponse,
  ensureControlSessionResponse,
  updateControlSessionResponse,
} from "../sessions";
import { decodePathSegment } from "../http/routes";
import { errorResponse, jsonResponse } from "../http/response";
import { readJsonObject } from "../http/request";
import { parseSessionPatch, validateSessionPatch } from "../validation/session-patch";

export async function handleSessionRoute(request: Request, url: URL, rawSessionId: string) {
  if (request.method !== "GET" && request.method !== "PATCH" && request.method !== "PUT") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only GET, PUT, and PATCH are supported for sessions.",
      "session",
    );
  }

  const sessionId = decodePathSegment(request, rawSessionId, "session id");

  if (sessionId instanceof Response) {
    return sessionId;
  }

  if (request.method === "PUT") {
    return jsonResponse(
      request,
      ensureControlSessionResponse(sessionId, url.origin),
      200,
      "session",
    );
  }

  if (request.method === "PATCH") {
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

    const body = await readJsonObject(request);

    if (body instanceof Response) {
      return body;
    }

    const patch = parseSessionPatch(request, body);

    if (patch instanceof Response) {
      return patch;
    }

    const validationError = validateSessionPatch(
      request,
      sessionId,
      storedRecord.session.status,
      storedRecord.session.recordingPhase,
      patch,
    );

    if (validationError !== null) {
      return validationError;
    }

    const response = updateControlSessionResponse(sessionId, url.origin, patch);

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

  const response = createControlSessionResponse(sessionId, url.origin);

  if (response === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before reading or bootstrapping it.`,
      "session",
    );
  }

  return jsonResponse(request, response, 200, "session");
}
