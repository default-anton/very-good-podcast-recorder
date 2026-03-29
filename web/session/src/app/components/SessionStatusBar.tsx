import { CircleDot, LoaderCircle, RadioTower, ShieldAlert, UserRound } from "lucide-react";

import type { JoinRole, RecordingHealth, RecordingPhase, SessionSeat } from "../lib/types";
import { Button, Card, CardBody, Pill } from "./ui";

const phaseTone = {
  waiting: "neutral",
  recording: "accent",
  draining: "warn",
  stopped: "ok",
  failed: "danger",
} as const;

const healthTone = {
  healthy: "ok",
  degraded: "warn",
  failed: "danger",
} as const;

export function SessionStatusBar({
  localSeat,
  onFailRecording,
  onFinishDrain,
  onStartRecording,
  onStopRecording,
  recordingHealth,
  recordingPhase,
  role,
}: {
  localSeat: SessionSeat;
  onFailRecording: () => void;
  onFinishDrain: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordingHealth: RecordingHealth;
  recordingPhase: RecordingPhase;
  role: JoinRole;
}) {
  return (
    <Card className="sticky top-4 z-20 border-accent/30 bg-panel/95 backdrop-blur-sm">
      <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="section-label">Session status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone={phaseTone[recordingPhase]}>
              <CircleDot className="mr-2 size-3.5" />
              Recording {recordingPhase.replaceAll("_", " ")}
            </Pill>
            <Pill tone={healthTone[recordingHealth]}>
              <ShieldAlert className="mr-2 size-3.5" />
              Health {recordingHealth}
            </Pill>
            <Pill tone={role === "host" ? "accent" : "info"}>
              <UserRound className="mr-2 size-3.5" />
              {localSeat.displayName}
            </Pill>
            <Pill tone={role === "host" ? "accent" : "neutral"}>
              <RadioTower className="mr-2 size-3.5" />
              Role {role}
            </Pill>
          </div>
          <p className="fine-print mt-3 max-w-3xl">
            {phaseDescription(recordingPhase, recordingHealth, role)}
          </p>
        </div>

        {role === "host" ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {(recordingPhase === "waiting" || recordingPhase === "stopped") && (
              <Button onClick={onStartRecording} variant="primary">
                Start recording
              </Button>
            )}

            {recordingPhase === "recording" && (
              <>
                <Button onClick={onStopRecording} variant="danger">
                  Stop recording
                </Button>
                <Button onClick={onFailRecording} variant="secondary">
                  Recording failed
                </Button>
              </>
            )}

            {recordingPhase === "draining" && (
              <Button onClick={onFinishDrain} variant="secondary">
                <LoaderCircle className="size-4" />
                Finish upload drain
              </Button>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function phaseDescription(
  recordingPhase: RecordingPhase,
  recordingHealth: RecordingHealth,
  role: JoinRole,
) {
  if (recordingPhase === "recording") {
    return role === "host"
      ? "Host controls stay in reach while the roster tells the truth about capture and upload drift."
      : "Guests can see when recording is live, but their own capture and upload path still needs separate attention.";
  }

  if (recordingPhase === "draining") {
    return "Recording is stopped. Keep the room open until uploads finish and the backlog is gone.";
  }

  if (recordingPhase === "failed" || recordingHealth === "failed") {
    return "Treat this run as untrustworthy until the failing seat and upload state are understood.";
  }

  if (recordingHealth === "degraded") {
    return "The room is still usable, but at least one seat is drifting away from healthy recording state.";
  }

  if (recordingPhase === "stopped") {
    return "The hosted run is idle again. Keep the room shell readable while artifacts finish or the next take starts.";
  }

  return "The room is ready. Recording controls and per-seat status stay visible in narrow and wide layouts.";
}
