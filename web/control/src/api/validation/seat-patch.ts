import type { UpdateControlSeatInput } from "../../app/lib/api";
import type { SeatRole, SessionStatus } from "../../app/lib/types";

import { errorResponse } from "../http/response";
import { invalidFieldResponse, rosterLockedResponse, terminalSessionResponse } from "./errors";

const ROSTER_EDITABLE_SESSION_STATUSES = new Set<SessionStatus>(["draft", "ready"]);
const SEAT_ROLES = new Set<SeatRole>(["host", "guest"]);
const OWNERSHIP_STATUSES = new Set(["clear", "rejoin_available", "takeover_required"]);

export function parseSeatPatch(request: Request, body: Record<string, unknown>) {
  const patch: UpdateControlSeatInput = {};

  if ("displayName" in body) {
    if (typeof body.displayName !== "string") {
      return invalidFieldResponse(request, "displayName", "a string");
    }

    patch.displayName = body.displayName;
  }

  if ("role" in body) {
    if (typeof body.role !== "string" || !SEAT_ROLES.has(body.role as SeatRole)) {
      return invalidFieldResponse(request, "role", "host or guest");
    }

    patch.role = body.role as SeatRole;
  }

  if ("joined" in body) {
    if (typeof body.joined !== "boolean") {
      return invalidFieldResponse(request, "joined", "a boolean");
    }

    patch.joined = body.joined;
  }

  if ("micMuted" in body) {
    if (typeof body.micMuted !== "boolean") {
      return invalidFieldResponse(request, "micMuted", "a boolean");
    }

    patch.micMuted = body.micMuted;
  }

  if ("cameraEnabled" in body) {
    if (typeof body.cameraEnabled !== "boolean") {
      return invalidFieldResponse(request, "cameraEnabled", "a boolean");
    }

    patch.cameraEnabled = body.cameraEnabled;
  }

  if ("screenShareActive" in body) {
    if (typeof body.screenShareActive !== "boolean") {
      return invalidFieldResponse(request, "screenShareActive", "a boolean");
    }

    patch.screenShareActive = body.screenShareActive;
  }

  if ("selectedMic" in body) {
    if (typeof body.selectedMic !== "string") {
      return invalidFieldResponse(request, "selectedMic", "a string");
    }

    patch.selectedMic = body.selectedMic;
  }

  if ("selectedCamera" in body) {
    if (typeof body.selectedCamera !== "string") {
      return invalidFieldResponse(request, "selectedCamera", "a string");
    }

    patch.selectedCamera = body.selectedCamera;
  }

  if ("ownershipStatus" in body) {
    if (typeof body.ownershipStatus !== "string" || !OWNERSHIP_STATUSES.has(body.ownershipStatus)) {
      return invalidFieldResponse(
        request,
        "ownershipStatus",
        "clear, rejoin_available, or takeover_required",
      );
    }

    patch.ownershipStatus = body.ownershipStatus as UpdateControlSeatInput["ownershipStatus"];
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(
      request,
      400,
      "empty_patch",
      "Seat patch must include at least one editable field.",
      "session",
    );
  }

  return patch;
}

export function validateRosterMutation(
  request: Request,
  sessionId: string,
  currentStatus: SessionStatus,
) {
  if (currentStatus === "ended") {
    return terminalSessionResponse(request, sessionId);
  }

  if (!ROSTER_EDITABLE_SESSION_STATUSES.has(currentStatus)) {
    return rosterLockedResponse(request, sessionId, currentStatus, "Roster edits");
  }

  return null;
}

export function validateSeatPatch(
  request: Request,
  sessionId: string,
  currentStatus: SessionStatus,
  patch: UpdateControlSeatInput,
) {
  if (currentStatus === "ended") {
    return terminalSessionResponse(request, sessionId);
  }

  if (touchesRosterFields(patch) && !ROSTER_EDITABLE_SESSION_STATUSES.has(currentStatus)) {
    return rosterLockedResponse(request, sessionId, currentStatus, "Roster edits");
  }

  return null;
}

function touchesRosterFields(patch: UpdateControlSeatInput) {
  return patch.displayName !== undefined || patch.role !== undefined;
}
