import { Camera, Headphones, Mic, MonitorUp } from "lucide-react";
import type { ReactNode } from "react";

import type { SessionSeat } from "../lib/types";
import { Button, Card, CardBody, CardHeader, Pill, Select } from "./ui";

export function DevicePreview({
  cameraOptions,
  micOptions,
  onBack,
  onCameraChange,
  onJoin,
  onMicChange,
  previewCamera,
  previewMic,
  seat,
}: {
  cameraOptions: string[];
  micOptions: string[];
  onBack: () => void;
  onCameraChange: (value: string) => void;
  onJoin: () => void;
  onMicChange: (value: string) => void;
  previewCamera: string;
  previewMic: string;
  seat: SessionSeat;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-label">Device check</p>
            <h3 className="mt-3 text-xl font-semibold text-text">Minimal device preview</h3>
            <p className="fine-print mt-2 max-w-2xl">
              Keep the preview boring: confirm the seat identity, pick the mic and camera, then go
              straight into the room.
            </p>
          </div>
          <Pill tone="accent">{seat.label}</Pill>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="utility-grid raised-surface overflow-hidden p-4">
          <div className="flex min-h-52 flex-col justify-between rounded-md border border-line bg-bg/80 p-4">
            <div>
              <p className="section-label">Preview target</p>
              <h4 className="mt-2 text-lg font-semibold text-text">{seat.displayName}</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewSignal icon={<Mic className="size-4" />} label="Mic" value={previewMic} />
              <PreviewSignal
                icon={<Camera className="size-4" />}
                label="Camera"
                value={previewCamera}
              />
              <PreviewSignal
                icon={<MonitorUp className="size-4" />}
                label="Role"
                value={seat.role}
              />
              <PreviewSignal
                icon={<Headphones className="size-4" />}
                label="Claim"
                value={seat.pickerState.replaceAll("_", " ")}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="section-label" htmlFor="preview-mic-select">
              Choose mic
            </label>
            <Select
              id="preview-mic-select"
              onChange={(event) => {
                onMicChange(event.target.value);
              }}
              value={previewMic}
            >
              {micOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="section-label" htmlFor="preview-camera-select">
              Choose camera
            </label>
            <Select
              id="preview-camera-select"
              onChange={(event) => {
                onCameraChange(event.target.value);
              }}
              value={previewCamera}
            >
              {cameraOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text">
          Seat identity is fixed before room join. If this is the wrong seat, go back now rather
          than creating an ownership mess during recording.
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onJoin} variant="primary">
            Join room shell
          </Button>
          <Button onClick={onBack} variant="ghost">
            Back to seat picker
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function PreviewSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-raised px-3 py-3 text-sm text-text">
      <p className="section-label">{label}</p>
      <p className="mt-2 flex items-center gap-2 truncate">
        <span className="text-accent">{icon}</span>
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
