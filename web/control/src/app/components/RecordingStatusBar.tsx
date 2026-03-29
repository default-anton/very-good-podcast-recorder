import { CircleDot, LoaderCircle, RadioTower, ShieldAlert } from "lucide-react";

import type { RecordingHealth, RecordingPhase, SessionStatus } from "../lib/types";
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

const sessionTone = {
  draft: "neutral",
  ready: "info",
  active: "accent",
  ended: "neutral",
} as const;

export function RecordingStatusBar({
  onActivateSession,
  onEndHostedRun,
  onFinishDrain,
  onStartRecording,
  onStopRecording,
  recordingHealth,
  recordingPhase,
  sessionStatus,
}: {
  onActivateSession: () => void;
  onEndHostedRun: () => void;
  onFinishDrain: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordingHealth: RecordingHealth;
  recordingPhase: RecordingPhase;
  sessionStatus: SessionStatus;
}) {
  return (
    <Card className="sticky top-4 z-20 border-accent/30 bg-panel/95 backdrop-blur-sm">
      <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="section-label">Room status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone={phaseTone[recordingPhase]}>
              <CircleDot className="mr-2 size-3.5" />
              Recording {recordingPhase.replaceAll("_", " ")}
            </Pill>
            <Pill tone={healthTone[recordingHealth]}>
              <ShieldAlert className="mr-2 size-3.5" />
              Health {recordingHealth}
            </Pill>
            <Pill tone={sessionTone[sessionStatus]}>
              <RadioTower className="mr-2 size-3.5" />
              Session {sessionStatus}
            </Pill>
          </div>
          <p className="fine-print mt-3 max-w-3xl">
            {phaseDescription(recordingPhase, recordingHealth)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {sessionStatus === "draft" || sessionStatus === "ready" ? (
            <Button onClick={onActivateSession} variant="secondary">
              Activate hosted run
            </Button>
          ) : null}

          {sessionStatus === "active" &&
          (recordingPhase === "waiting" || recordingPhase === "stopped") ? (
            <Button onClick={onStartRecording} variant="primary">
              Start recording
            </Button>
          ) : null}

          {sessionStatus === "active" && recordingPhase === "recording" ? (
            <Button onClick={onStopRecording} variant="danger">
              Stop recording
            </Button>
          ) : null}

          {sessionStatus === "active" && recordingPhase === "draining" ? (
            <Button onClick={onFinishDrain} variant="secondary">
              <LoaderCircle className="size-4" />
              Finish upload drain
            </Button>
          ) : null}

          {sessionStatus === "active" &&
          (recordingPhase === "stopped" || recordingPhase === "failed") ? (
            <Button onClick={onEndHostedRun} variant="secondary">
              End hosted run
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function phaseDescription(recordingPhase: RecordingPhase, recordingHealth: RecordingHealth) {
  if (recordingPhase === "recording") {
    return "Live call, local capture, and upload stay separate. Keep an eye on the roster when any seat drifts from healthy.";
  }

  if (recordingPhase === "draining") {
    return "Recording is stopped. Leave the room open until every seat finishes background uploads.";
  }

  if (recordingPhase === "failed" || recordingHealth === "failed") {
    return "Treat this run as untrustworthy until the failing seats and manifests are understood.";
  }

  if (recordingHealth === "degraded") {
    return "The run can continue, but at least one seat needs attention before this becomes a support mystery.";
  }

  if (recordingPhase === "stopped") {
    return "The room is idle again. Use the control shell to review roster state before the next take.";
  }

  return "The room shell is armed but not recording yet. Join signals and controls stay visible in narrow and wide layouts.";
}
