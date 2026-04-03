import {
  Camera,
  CameraOff,
  ChevronLeft,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RadioTower,
  ScreenShare,
  Users,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useControlApp } from "../ControlAppProvider";
import { RecordingStatusBar } from "../components/RecordingStatusBar";
import { SeatList } from "../components/SeatList";
import { Button, Card, CardBody, CardHeader, Pill, SectionHeading, Select } from "../components/ui";
import { createControlSessionPath } from "../lib/api";
import type { Seat } from "../lib/types";

export function SessionRoomPage() {
  const {
    activateSession,
    applyDemoPreset,
    cameraOptions,
    endHostedRun,
    failRecording,
    finishDrain,
    leaveOperatorRoom,
    micOptions,
    operatorSeatId,
    selectHostCamera,
    selectHostMic,
    session,
    startRecording,
    stopRecording,
    toggleHostCamera,
    toggleHostMic,
    toggleHostScreenShare,
  } = useControlApp();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentSessionId = sessionId ?? session.id;
  const operatorSeat = session.seats.find((seat) => seat.id === operatorSeatId);

  if (operatorSeat === undefined) {
    throw new Error("Control room shell requires at least one host seat.");
  }

  async function handleLeaveSession() {
    await leaveOperatorRoom();
    navigate(createControlSessionPath(currentSessionId));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          onClick={() => {
            navigate(createControlSessionPath(currentSessionId));
          }}
          size="sm"
          variant="ghost"
        >
          <ChevronLeft className="size-4" />
          Back to setup
        </Button>
        <Pill tone="accent">Control room shell</Pill>
      </div>

      <SectionHeading
        description="Keep recording state persistent, media controls reachable, and the roster truthful even when the layout collapses."
        eyebrow="Host room"
        title={session.title}
      />

      <RecordingStatusBar
        onActivateSession={() => {
          void activateSession();
        }}
        onEndHostedRun={() => {
          void endHostedRun();
        }}
        onFinishDrain={() => {
          void finishDrain();
        }}
        onStartRecording={() => {
          void startRecording();
        }}
        onStopRecording={() => {
          void stopRecording();
        }}
        recordingHealth={session.recordingHealth}
        recordingPhase={session.recordingPhase}
        sessionStatus={session.status}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)] xl:items-start">
        <div className="space-y-6">
          <Card className="utility-grid overflow-hidden">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-label">Participant grid</p>
                  <h3 className="mt-3 text-xl font-semibold text-text">Live room overview</h3>
                </div>
                <Pill tone="info">
                  <Users className="mr-2 size-3.5" />
                  {session.seats.length} channels
                </Pill>
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid gap-4 md:grid-cols-2">
                {session.seats.map((seat) => (
                  <ParticipantCard key={seat.id} seat={seat} />
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-label">Participant controls</p>
                  <h3 className="mt-3 text-xl font-semibold text-text">Local host controls</h3>
                </div>
                <Pill tone="accent">
                  <RadioTower className="mr-2 size-3.5" />
                  always visible
                </Pill>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="section-label" htmlFor="host-mic-select">
                    Choose mic
                  </label>
                  <Select
                    id="host-mic-select"
                    onChange={(event) => {
                      void selectHostMic(event.target.value);
                    }}
                    value={operatorSeat.selectedMic}
                  >
                    {micOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="section-label" htmlFor="host-camera-select">
                    Choose camera
                  </label>
                  <Select
                    id="host-camera-select"
                    onChange={(event) => {
                      void selectHostCamera(event.target.value);
                    }}
                    value={operatorSeat.selectedCamera}
                  >
                    {cameraOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    void toggleHostMic();
                  }}
                  variant={operatorSeat.micMuted ? "danger" : "secondary"}
                >
                  {operatorSeat.micMuted ? (
                    <MicOff className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                  {operatorSeat.micMuted ? "Unmute mic" : "Mute mic"}
                </Button>
                <Button
                  onClick={() => {
                    void toggleHostCamera();
                  }}
                  variant={operatorSeat.cameraEnabled ? "secondary" : "danger"}
                >
                  {operatorSeat.cameraEnabled ? (
                    <Camera className="size-4" />
                  ) : (
                    <CameraOff className="size-4" />
                  )}
                  {operatorSeat.cameraEnabled ? "Turn camera off" : "Turn camera on"}
                </Button>
                <Button
                  onClick={() => {
                    void toggleHostScreenShare();
                  }}
                  variant="secondary"
                >
                  {operatorSeat.screenShareActive ? (
                    <MonitorUp className="size-4" />
                  ) : (
                    <ScreenShare className="size-4" />
                  )}
                  {operatorSeat.screenShareActive ? "Stop screen share" : "Start screen share"}
                </Button>
                <Button
                  onClick={() => {
                    void handleLeaveSession();
                  }}
                  variant="ghost"
                >
                  <PhoneOff className="size-4" />
                  Leave session
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-28">
          <Card>
            <CardHeader>
              <p className="section-label">Host roster</p>
              <h3 className="mt-3 text-xl font-semibold text-text">Seat status panel</h3>
            </CardHeader>
            <CardBody>
              <SeatList mode="room" seats={session.seats} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <p className="section-label">Demo state</p>
              <h3 className="mt-3 text-xl font-semibold text-text">Exercise the shell</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="fine-print">
                These local buttons keep the shell reviewable before real APIs exist. They drive the
                same room layout with clear degraded-state language.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => applyDemoPreset("healthy")} size="sm" variant="secondary">
                  Healthy
                </Button>
                <Button onClick={() => applyDemoPreset("reconnect")} size="sm" variant="secondary">
                  Reconnecting
                </Button>
                <Button onClick={() => applyDemoPreset("catchup")} size="sm" variant="secondary">
                  Catching up
                </Button>
                <Button onClick={() => applyDemoPreset("issue")} size="sm" variant="danger">
                  Local issue
                </Button>
                <Button onClick={() => applyDemoPreset("rejoin")} size="sm" variant="secondary">
                  Rejoin available
                </Button>
                <Button onClick={() => applyDemoPreset("takeover")} size="sm" variant="secondary">
                  Takeover required
                </Button>
                <Button
                  onClick={() => {
                    void failRecording();
                  }}
                  size="sm"
                  variant="danger"
                >
                  Recording failed
                </Button>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ParticipantCard({ seat }: { seat: Seat }) {
  return (
    <div className="raised-surface flex min-h-56 flex-col justify-between p-4">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-label">{seat.label}</p>
            <h4 className="mt-2 truncate text-lg font-semibold text-text">{seat.displayName}</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={seat.role === "host" ? "accent" : "neutral"}>{seat.role}</Pill>
            <Pill tone={seat.joined ? "ok" : "neutral"}>{seat.joined ? "joined" : "waiting"}</Pill>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SignalBlock label="Live" tone={seat.liveCallStatus} />
          <SignalBlock label="Capture" tone={seat.localCaptureStatus} />
          <SignalBlock label="Upload" tone={seat.uploadStatus} />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-line bg-bg px-3 py-3 text-sm text-text-muted">
        <p>
          Mic {seat.micMuted ? "muted" : "live"} · Camera {seat.cameraEnabled ? "armed" : "off"}
        </p>
        <p className="mt-1">
          Screen share {seat.screenShareActive ? "active" : "idle"} · Device {seat.selectedMic}
        </p>
      </div>
    </div>
  );
}

function SignalBlock({ label, tone }: { label: string; tone: string }) {
  const pillTone =
    tone === "connected" || tone === "synced"
      ? "ok"
      : tone === "recording"
        ? "accent"
        : tone === "uploading"
          ? "info"
          : tone === "reconnecting" || tone === "catching_up"
            ? "warn"
            : tone === "issue" || tone === "failed" || tone === "disconnected"
              ? "danger"
              : "neutral";

  return (
    <div className="rounded-md border border-line bg-bg px-3 py-3">
      <p className="section-label">{label}</p>
      <Pill className="mt-2" tone={pillTone}>
        {tone.replaceAll("_", " ")}
      </Pill>
    </div>
  );
}
