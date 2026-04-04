import type { RecordingPhase, SessionStatus } from "../../../../shared/sessionContract";

export function isAllowedStatusTransition(currentStatus: SessionStatus, nextStatus: SessionStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (currentStatus === "draft") {
    return nextStatus === "ready" || nextStatus === "ended";
  }

  if (currentStatus === "ready") {
    return nextStatus === "active" || nextStatus === "draft" || nextStatus === "ended";
  }

  if (currentStatus === "active") {
    return nextStatus === "ended";
  }

  return false;
}

export function isAllowedRecordingPhaseTransition(
  currentPhase: RecordingPhase,
  nextPhase: RecordingPhase,
) {
  if (currentPhase === nextPhase) {
    return true;
  }

  if (nextPhase === "failed") {
    return currentPhase !== "failed";
  }

  if (currentPhase === "waiting") {
    return nextPhase === "recording";
  }

  if (currentPhase === "recording") {
    return nextPhase === "draining";
  }

  if (currentPhase === "draining") {
    return nextPhase === "stopped";
  }

  if (currentPhase === "stopped") {
    return nextPhase === "recording";
  }

  return false;
}
