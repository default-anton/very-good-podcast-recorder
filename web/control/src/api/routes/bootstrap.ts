import type { SessionStatus } from "../../../../shared/sessionContract";

import { createBootstrapResponse } from "../bootstrap";
import { isJoinRole } from "../join-links";
import { createControlSessionResponse, hasStoredJoinKey } from "../sessions";
import { decodePathSegment } from "../http/routes";
import { errorResponse, jsonResponse } from "../http/response";

const JOINABLE_SESSION_STATUSES = new Set<SessionStatus>(["ready", "active"]);

export function handleBootstrapRoute(
  request: Request,
  url: URL,
  rawSessionId: string,
  rawRole: string,
) {
  if (request.method !== "GET") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only GET is supported for session bootstrap.",
      "bootstrap",
    );
  }

  const sessionId = decodePathSegment(request, rawSessionId, "session id");

  if (sessionId instanceof Response) {
    return sessionId;
  }

  const role = decodePathSegment(request, rawRole, "role");

  if (role instanceof Response) {
    return role;
  }

  if (!isJoinRole(role)) {
    return errorResponse(request, 400, "invalid_role", "Role must be host or guest.", "bootstrap");
  }

  const sessionResponse = createControlSessionResponse(sessionId, url.origin);

  if (sessionResponse === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before bootstrapping it.`,
      "bootstrap",
    );
  }

  if (!JOINABLE_SESSION_STATUSES.has(sessionResponse.session.status)) {
    return errorResponse(
      request,
      409,
      "session_not_joinable",
      `Local session ${sessionId} is ${sessionResponse.session.status}. Only ready or active sessions can be bootstrapped.`,
      "bootstrap",
    );
  }

  if (!hasStoredJoinKey(sessionId, role, url.searchParams.get("k"))) {
    return errorResponse(
      request,
      403,
      "invalid_join_key",
      "Join key is missing or does not match this role link.",
      "bootstrap",
    );
  }

  return jsonResponse(request, createBootstrapResponse(sessionResponse, role), 200, "bootstrap");
}
