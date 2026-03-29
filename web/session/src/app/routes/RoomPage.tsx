import {
  Camera,
  CameraOff,
  ChevronLeft,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  ScreenShare,
  Users,
} from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { buildJoinPath } from "../../../../shared/joinLinks";
import { useSessionApp } from "../App";
import { LocalSeatStatus } from "../components/LocalSeatStatus";
import { SessionStatusBar } from "../components/SessionStatusBar";
import { Button, Card, CardBody, CardHeader, Pill, SectionHeading, Select } from "../components/ui";
import type { SessionSeat } from "../lib/types";

const liveTone = {
  connected: "ok",
  reconnecting: "warn",
  disconnected: "danger",
} as const;

const captureTone = {
  not_recording: "neutral",
  recording: "accent",
  issue: "danger",
} as const;

const uploadTone = {
  synced: "ok",
  uploading: "info",
  catching_up: "warn",
  failed: "danger",
} as const;

const ownershipTone = {
  clear: "neutral",
  rejoin_available: "warn",
  takeover_required: "danger",
} as const;

export function RoomPage() {
  const {
    applyRoomPreset,
    cameraOptions,
    failRecording,
    finishDrain,
    leaveRoom,
    micOptions,
    roomPreset,
    selectLocalCamera,
    selectLocalMic,
    session,
    startRecording,
    stopRecording,
    toggleLocalCamera,
    toggleLocalMic,
    toggleLocalScreenShare,
  } = useSessionApp();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentSessionId = sessionId ?? session.id;
  const localSeat = session.seats.find((seat) => seat.id === session.joinedSeatId) ?? null;

  if (localSeat === null) {
    return <Navigate replace to={buildJoinPath(currentSessionId, session.role)} />;
  }

  function handleLeaveRoom() {
    leaveRoom();
    navigate(buildJoinPath(currentSessionId, session.role));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          onClick={() => {
            navigate(buildJoinPath(currentSessionId, session.role));
          }}
          size="sm"
          variant="ghost"
        >
          <ChevronLeft className="size-4" />
          Back to join flow
        </Button>
        <Pill tone={session.role === "host" ? "accent" : "info"}>{session.role} room shell</Pill>
      </div>

      <SectionHeading
        description={
          session.role === "host"
            ? "Host room shell keeps recording controls persistent while the roster still reads truthfully on narrow layouts."
            : "Guest room shell keeps personal seat status obvious without hiding session recording state."
        }
        eyebrow="Session room"
        title={session.title}
      />

      <SessionStatusBar
        localSeat={localSeat}
        onFailRecording={failRecording}
        onFinishDrain={finishDrain}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        recordingHealth={session.recordingHealth}
        recordingPhase={session.recordingPhase}
        role={session.role}
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
                  <h3 className="mt-3 text-xl font-semibold text-text">Local media controls</h3>
                </div>
                <Pill tone="accent">always visible</Pill>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="section-label" htmlFor="session-mic-select">
                    Choose mic
                  </label>
                  <Select
                    id="session-mic-select"
                    onChange={(event) => {
                      selectLocalMic(event.target.value);
                    }}
                    value={localSeat.selectedMic}
                  >
                    {micOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="section-label" htmlFor="session-camera-select">
                    Choose camera
                  </label>
                  <Select
                    id="session-camera-select"
                    onChange={(event) => {
                      selectLocalCamera(event.target.value);
                    }}
                    value={localSeat.selectedCamera}
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
                  onClick={toggleLocalMic}
                  variant={localSeat.micMuted ? "danger" : "secondary"}
                >
                  {localSeat.micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {localSeat.micMuted ? "Unmute mic" : "Mute mic"}
                </Button>
                <Button
                  onClick={toggleLocalCamera}
                  variant={localSeat.cameraEnabled ? "secondary" : "danger"}
                >
                  {localSeat.cameraEnabled ? (
                    <Camera className="size-4" />
                  ) : (
                    <CameraOff className="size-4" />
                  )}
                  {localSeat.cameraEnabled ? "Turn camera off" : "Turn camera on"}
                </Button>
                <Button onClick={toggleLocalScreenShare} variant="secondary">
                  {localSeat.screenShareActive ? (
                    <MonitorUp className="size-4" />
                  ) : (
                    <ScreenShare className="size-4" />
                  )}
                  {localSeat.screenShareActive ? "Stop screen share" : "Start screen share"}
                </Button>
                <Button onClick={handleLeaveRoom} variant="ghost">
                  <PhoneOff className="size-4" />
                  Leave session
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-28">
          <LocalSeatStatus seat={localSeat} />

          {session.role === "host" ? (
            <Card>
              <CardHeader>
                <p className="section-label">Host roster</p>
                <h3 className="mt-3 text-xl font-semibold text-text">Seat status panel</h3>
              </CardHeader>
              <CardBody>
                <ul className="space-y-3">
                  {session.seats.map((seat) => (
                    <li className="raised-surface p-4" key={seat.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="section-label">{seat.label}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-semibold text-text">
                              {seat.displayName}
                            </p>
                            <Pill tone={seat.role === "host" ? "accent" : "neutral"}>
                              {seat.role}
                            </Pill>
                          </div>
                        </div>
                        <Pill tone={seat.joined ? "ok" : "neutral"}>
                          {seat.joined ? "joined" : "waiting"}
                        </Pill>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <RosterChip
                          label="Live"
                          tone={liveTone[seat.liveCallStatus]}
                          value={seat.liveCallStatus}
                        />
                        <RosterChip
                          label="Capture"
                          tone={captureTone[seat.localCaptureStatus]}
                          value={seat.localCaptureStatus}
                        />
                        <RosterChip
                          label="Upload"
                          tone={uploadTone[seat.uploadStatus]}
                          value={seat.uploadStatus}
                        />
                        <RosterChip
                          label="Ownership"
                          tone={ownershipTone[seat.ownershipStatus]}
                          value={seat.ownershipStatus}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <p className="section-label">Demo state</p>
              <h3 className="mt-3 text-xl font-semibold text-text">Exercise room drift</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="fine-print">
                Drive the same shell through reconnect, backlog, and local-capture trouble before
                the real APIs land.
              </p>
              <div className="flex flex-wrap gap-2">
                <RoomPresetButton
                  active={roomPreset === "steady"}
                  label="Healthy"
                  onClick={() => {
                    applyRoomPreset("steady");
                  }}
                />
                <RoomPresetButton
                  active={roomPreset === "reconnecting"}
                  label="Reconnecting"
                  onClick={() => {
                    applyRoomPreset("reconnecting");
                  }}
                />
                <RoomPresetButton
                  active={roomPreset === "catching_up"}
                  label="Catching up"
                  onClick={() => {
                    applyRoomPreset("catching_up");
                  }}
                />
                <RoomPresetButton
                  active={roomPreset === "local_issue"}
                  label="Capture issue"
                  onClick={() => {
                    applyRoomPreset("local_issue");
                  }}
                />
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ParticipantCard({ seat }: { seat: SessionSeat }) {
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
          <SignalBlock
            label="Live"
            tone={liveTone[seat.liveCallStatus]}
            value={seat.liveCallStatus}
          />
          <SignalBlock
            label="Capture"
            tone={captureTone[seat.localCaptureStatus]}
            value={seat.localCaptureStatus}
          />
          <SignalBlock
            label="Upload"
            tone={uploadTone[seat.uploadStatus]}
            value={seat.uploadStatus}
          />
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

function SignalBlock({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "accent" | "danger" | "info" | "neutral" | "ok" | "warn";
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-bg px-3 py-3">
      <p className="section-label">{label}</p>
      <Pill className="mt-2" tone={tone}>
        {value.replaceAll("_", " ")}
      </Pill>
    </div>
  );
}

function RosterChip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "accent" | "danger" | "info" | "neutral" | "ok" | "warn";
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-bg px-3 py-2">
      <p className="section-label">{label}</p>
      <Pill className="mt-2" tone={tone}>
        {value.replaceAll("_", " ")}
      </Pill>
    </div>
  );
}

function RoomPresetButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} size="sm" variant={active ? "primary" : "secondary"}>
      {label}
    </Button>
  );
}
