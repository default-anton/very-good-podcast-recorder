import type { UpdateControlSessionInput } from "../../app/lib/api";
import type { RecordingHealth, RecordingPhase, SessionStatus } from "../../app/lib/types";

import { errorResponse } from "../http/response";
import {
  invalidFieldResponse,
  invalidSessionTransitionResponse,
  rosterLockedResponse,
  terminalSessionResponse,
} from "./errors";
import { isAllowedRecordingPhaseTransition, isAllowedStatusTransition } from "./transitions";

const ROSTER_EDITABLE_SESSION_STATUSES = new Set<SessionStatus>(["draft", "ready"]);
const SESSION_STATUSES = new Set<SessionStatus>(["draft", "ready", "active", "ended"]);
const RECORDING_PHASES = new Set<RecordingPhase>([
  "waiting",
  "recording",
  "draining",
  "stopped",
  "failed",
]);
const RECORDING_HEALTH = new Set<RecordingHealth>(["healthy", "degraded", "failed"]);

export function parseSessionPatch(request: Request, body: Record<string, unknown>) {
  const patch: UpdateControlSessionInput = {};

  if ("title" in body) {
    if (typeof body.title !== "string") {
      return invalidFieldResponse(request, "title", "a string");
    }

    patch.title = body.title;
  }

  if ("status" in body) {
    if (typeof body.status !== "string" || !SESSION_STATUSES.has(body.status as SessionStatus)) {
      return invalidFieldResponse(request, "status", "draft, ready, active, or ended");
    }

    patch.status = body.status as SessionStatus;
  }

  if ("recordingPhase" in body) {
    if (
      typeof body.recordingPhase !== "string" ||
      !RECORDING_PHASES.has(body.recordingPhase as RecordingPhase)
    ) {
      return invalidFieldResponse(
        request,
        "recordingPhase",
        "waiting, recording, draining, stopped, or failed",
      );
    }

    patch.recordingPhase = body.recordingPhase as RecordingPhase;
  }

  if ("recordingHealth" in body) {
    if (
      typeof body.recordingHealth !== "string" ||
      !RECORDING_HEALTH.has(body.recordingHealth as RecordingHealth)
    ) {
      return invalidFieldResponse(request, "recordingHealth", "healthy, degraded, or failed");
    }

    patch.recordingHealth = body.recordingHealth as RecordingHealth;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(
      request,
      400,
      "empty_patch",
      "Session patch must include at least one editable field.",
      "session",
    );
  }

  return patch;
}

export function validateSessionPatch(
  request: Request,
  sessionId: string,
  currentStatus: SessionStatus,
  currentRecordingPhase: RecordingPhase,
  patch: UpdateControlSessionInput,
) {
  if (currentStatus === "ended") {
    return terminalSessionResponse(request, sessionId);
  }

  if (patch.title !== undefined && !ROSTER_EDITABLE_SESSION_STATUSES.has(currentStatus)) {
    return rosterLockedResponse(request, sessionId, currentStatus, "Session title edits");
  }

  if (patch.status !== undefined && !isAllowedStatusTransition(currentStatus, patch.status)) {
    return invalidSessionTransitionResponse(
      request,
      sessionId,
      `Cannot move local session ${sessionId} from ${currentStatus} to ${patch.status}.`,
    );
  }

  const nextStatus = patch.status ?? currentStatus;
  const nextRecordingPhase = patch.recordingPhase ?? currentRecordingPhase;

  if (
    patch.recordingPhase !== undefined &&
    (nextStatus !== "active" ||
      !isAllowedRecordingPhaseTransition(currentRecordingPhase, patch.recordingPhase))
  ) {
    return invalidSessionTransitionResponse(
      request,
      sessionId,
      `Cannot set recording phase to ${patch.recordingPhase} while local session ${sessionId} is ${currentStatus}.`,
    );
  }

  if (
    patch.status === "ended" &&
    nextRecordingPhase !== "stopped" &&
    nextRecordingPhase !== "failed"
  ) {
    return invalidSessionTransitionResponse(
      request,
      sessionId,
      `Cannot end local session ${sessionId} while recording phase is ${nextRecordingPhase}.`,
    );
  }

  return null;
}
