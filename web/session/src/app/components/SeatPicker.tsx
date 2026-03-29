import { AlertTriangle, RotateCcw, ShieldAlert, UserRoundCheck } from "lucide-react";

import type { SessionSeat } from "../lib/types";
import { Button, Card, CardBody, CardHeader, Pill, cn } from "./ui";

const pickerTone = {
  available: "ok",
  you: "accent",
  in_use: "danger",
  rejoin_available: "warn",
} as const;

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

export function SeatPicker({
  activeSeatId,
  disabled = false,
  onChooseSeat,
  role,
  seats,
}: {
  activeSeatId: string | null;
  disabled?: boolean;
  onChooseSeat: (seatId: string) => void;
  role: "host" | "guest";
  seats: SessionSeat[];
}) {
  const roleSeats = seats.filter((seat) => seat.role === role);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-label">Seat claim</p>
            <h3 className="mt-3 text-xl font-semibold text-text">Choose your seat</h3>
            <p className="fine-print mt-2 max-w-2xl">
              Only seats for this role link are listed. Claim ownership stays singular, takeover
              stays explicit, and reconnect state stays visible instead of quietly collapsing back
              to healthy.
              {disabled
                ? " This browser is already in the room, so seat changes are locked until it leaves."
                : ""}
            </p>
          </div>
          <Pill tone="info">{role} link</Pill>
        </div>
      </CardHeader>
      <CardBody>
        <ul className="space-y-3">
          {roleSeats.map((seat) => {
            const selected = seat.id === activeSeatId;

            return (
              <li
                className={cn(
                  "raised-surface p-4 transition-colors",
                  selected && "border-accent/60 shadow-[0_0_0_1px_rgb(201_138_43_/_0.24)]",
                )}
                key={seat.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="section-label">{seat.label}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h4 className="max-w-full truncate text-lg font-semibold text-text">
                        {seat.displayName}
                      </h4>
                      <Pill tone={pickerTone[seat.pickerState]}>
                        {seat.pickerState.replaceAll("_", " ")}
                      </Pill>
                    </div>
                  </div>
                  <Button
                    aria-label={seatActionLabel(seat)}
                    disabled={disabled}
                    onClick={() => {
                      onChooseSeat(seat.id);
                    }}
                    variant={seat.pickerState === "in_use" ? "danger" : "secondary"}
                  >
                    {seatActionLabel(seat)}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SignalBlock label="Claim" tone={pickerTone[seat.pickerState]}>
                    {claimSignalValue(seat)}
                  </SignalBlock>
                  <SignalBlock label="Live call" tone={liveTone[seat.liveCallStatus]}>
                    {seat.liveCallStatus.replaceAll("_", " ")}
                  </SignalBlock>
                  <SignalBlock label="Capture" tone={captureTone[seat.localCaptureStatus]}>
                    {seat.localCaptureStatus.replaceAll("_", " ")}
                  </SignalBlock>
                  <SignalBlock label="Upload" tone={uploadTone[seat.uploadStatus]}>
                    {seat.uploadStatus.replaceAll("_", " ")}
                  </SignalBlock>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function SignalBlock({
  children,
  label,
  tone,
}: {
  children: string;
  label: string;
  tone: "accent" | "danger" | "info" | "neutral" | "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-line bg-bg px-3 py-3">
      <p className="section-label">{label}</p>
      <Pill className="mt-2" tone={tone}>
        {children}
      </Pill>
    </div>
  );
}

function seatActionLabel(seat: SessionSeat) {
  if (seat.pickerState === "available") {
    return `Claim ${seat.displayName}`;
  }

  if (seat.pickerState === "you" && seat.ownershipStatus === "rejoin_available") {
    return `Reclaim ${seat.displayName}`;
  }

  if (seat.pickerState === "you") {
    return `Continue as ${seat.displayName}`;
  }

  if (seat.pickerState === "rejoin_available") {
    return `Recover ${seat.displayName}`;
  }

  return `Review takeover for ${seat.displayName}`;
}

function claimSignalValue(seat: SessionSeat) {
  if (seat.pickerState === "you" && seat.ownershipStatus === "rejoin_available") {
    return "owned, rejoin needed";
  }

  if (seat.pickerState === "you") {
    return "owned by this browser";
  }

  return seat.pickerState.replaceAll("_", " ");
}

export function seatPickerNotice(seat: SessionSeat) {
  if (seat.pickerState === "you" && seat.ownershipStatus === "rejoin_available") {
    return {
      icon: <RotateCcw className="size-4" />,
      tone: "warn" as const,
      title: "This browser can reclaim the seat",
      body: "The seat dropped out of the room. Rejoining keeps the same seat identity and leaves backlog state visible instead of pretending the path is clean.",
    };
  }

  if (seat.pickerState === "you") {
    return {
      icon: <UserRoundCheck className="size-4" />,
      tone: "accent" as const,
      title: "This browser already owns the seat",
      body: "The shell keeps one owned seat per role link, so reclaim stays singular and predictable.",
    };
  }

  if (seat.pickerState === "rejoin_available") {
    return {
      icon: <RotateCcw className="size-4" />,
      tone: "warn" as const,
      title: "Recovery is available",
      body: "The last browser is gone. Recovering this seat keeps the same participant identity.",
    };
  }

  if (seat.pickerState === "in_use") {
    return {
      icon: <ShieldAlert className="size-4" />,
      tone: "danger" as const,
      title: "Takeover stays explicit",
      body: "Another browser owns this seat. The next step is a confirmation dialog, not a silent replacement.",
    };
  }

  return {
    icon: <AlertTriangle className="size-4" />,
    tone: "ok" as const,
    title: "Seat is available",
    body: "Claiming this seat is the boring path: choose devices, then join the room.",
  };
}
