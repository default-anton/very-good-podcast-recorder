import { Camera, Mic, MonitorUp, ShieldAlert } from "lucide-react";

import type { SessionSeat } from "../lib/types";
import { Card, CardBody, CardHeader, Pill } from "./ui";

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

export function LocalSeatStatus({ seat }: { seat: SessionSeat }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-label">Local seat</p>
            <h3 className="mt-3 text-xl font-semibold text-text">{seat.displayName}</h3>
          </div>
          <Pill tone={seat.role === "host" ? "accent" : "info"}>{seat.role}</Pill>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <StatusRow
            label="Live"
            tone={liveTone[seat.liveCallStatus]}
            value={seat.liveCallStatus}
          />
          <StatusRow
            label="Capture"
            tone={captureTone[seat.localCaptureStatus]}
            value={seat.localCaptureStatus}
          />
          <StatusRow
            label="Upload"
            tone={uploadTone[seat.uploadStatus]}
            value={seat.uploadStatus}
          />
        </div>

        <div className="rounded-md border border-line bg-panel-raised px-4 py-3 text-sm text-text">
          <p className="flex items-center gap-2">
            <Mic className="size-4 text-accent" />
            Mic {seat.micMuted ? "muted" : "live"} · {seat.selectedMic}
          </p>
          <p className="mt-2 flex items-center gap-2">
            <Camera className="size-4 text-accent" />
            Camera {seat.cameraEnabled ? "armed" : "off"} · {seat.selectedCamera}
          </p>
          <p className="mt-2 flex items-center gap-2">
            <MonitorUp className="size-4 text-accent" />
            Screen share {seat.screenShareActive ? "active" : "idle"}
          </p>
        </div>

        <div className="rounded-md border border-line bg-bg px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-text">
            <ShieldAlert className="size-4 text-accent" />
            Live call, local capture, and upload stay separate.
          </p>
          <p className="fine-print mt-2">
            A connected room does not prove that this seat is recording or caught up on uploads.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function StatusRow({
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
