import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { Seat, SeatRole } from "../lib/types";
import { Button, Input, Pill, Select, cn } from "./ui";

type SeatListProps =
  | {
      mode: "setup";
      seats: Seat[];
      disabled: boolean;
      lockedSeatId: string;
      onAddSeat: () => void;
      onRemoveSeat: (seatId: string) => void;
      onUpdateSeat: (seatId: string, patch: Partial<Pick<Seat, "displayName" | "role">>) => void;
    }
  | {
      mode: "room";
      seats: Seat[];
    };

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

export function SeatList(props: SeatListProps) {
  if (props.mode === "setup") {
    const hostCount = props.seats.filter((seat) => seat.role === "host").length;
    const canAddSeat = props.seats.length < 8;

    return (
      <div className="space-y-3">
        {props.seats.map((seat) => (
          <SetupSeatRow
            disabled={props.disabled}
            hostCount={hostCount}
            key={seat.id}
            lockedSeatId={props.lockedSeatId}
            onRemoveSeat={props.onRemoveSeat}
            onUpdateSeat={props.onUpdateSeat}
            seat={seat}
            seatCount={props.seats.length}
          />
        ))}

        <Button
          disabled={props.disabled || !canAddSeat}
          onClick={props.onAddSeat}
          variant="secondary"
        >
          <Plus className="size-4" />
          Add seat
        </Button>
        {!canAddSeat ? (
          <p className="fine-print">Eight seats is enough for the first shell. Add more later.</p>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {props.seats.map((seat) => (
        <li className="raised-surface p-4" key={seat.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="section-label">{seat.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-text">{seat.displayName}</p>
                <Pill tone={seat.role === "host" ? "accent" : "neutral"}>{seat.role}</Pill>
                <Pill tone={seat.joined ? "ok" : "neutral"}>
                  {seat.joined ? "joined" : "waiting"}
                </Pill>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatusChip
              label="Live"
              tone={liveTone[seat.liveCallStatus]}
              value={seat.liveCallStatus}
            />
            <StatusChip
              label="Capture"
              tone={captureTone[seat.localCaptureStatus]}
              value={seat.localCaptureStatus}
            />
            <StatusChip
              label="Upload"
              tone={uploadTone[seat.uploadStatus]}
              value={seat.uploadStatus}
            />
            <StatusChip
              detail={ownershipDetail(seat.ownershipStatus)}
              label="Ownership"
              tone={ownershipTone[seat.ownershipStatus]}
              value={seat.ownershipStatus}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SetupSeatRow({
  disabled,
  hostCount,
  lockedSeatId,
  onRemoveSeat,
  onUpdateSeat,
  seat,
  seatCount,
}: {
  disabled: boolean;
  hostCount: number;
  lockedSeatId: string;
  onRemoveSeat: (seatId: string) => void;
  onUpdateSeat: (seatId: string, patch: Partial<Pick<Seat, "displayName" | "role">>) => void;
  seat: Seat;
  seatCount: number;
}) {
  const [displayNameDraft, setDisplayNameDraft] = useState(seat.displayName);
  const isLockedSeat = seat.id === lockedSeatId;
  const onlyHost = seat.role === "host" && hostCount === 1;
  const disableRemove = disabled || seatCount === 1 || onlyHost || isLockedSeat;

  useEffect(() => {
    setDisplayNameDraft(seat.displayName);
  }, [seat.displayName, seat.id]);

  return (
    <div className="raised-surface grid gap-3 p-4 md:grid-cols-[minmax(0,1.8fr)_160px_auto] md:items-end">
      <div>
        <p className="section-label">{seat.label}</p>
        <div className="mt-2">
          <label className="sr-only" htmlFor={`${seat.id}-name`}>
            Seat display name
          </label>
          <Input
            disabled={disabled}
            id={`${seat.id}-name`}
            maxLength={48}
            onBlur={() => {
              if (displayNameDraft !== seat.displayName) {
                onUpdateSeat(seat.id, { displayName: displayNameDraft });
              }
            }}
            onChange={(event) => {
              setDisplayNameDraft(event.target.value);
            }}
            placeholder="Display name"
            value={displayNameDraft}
          />
        </div>
      </div>

      <div>
        <p className="section-label">Role</p>
        <div className="mt-2">
          <label className="sr-only" htmlFor={`${seat.id}-role`}>
            Seat role
          </label>
          <Select
            disabled={disabled || onlyHost || isLockedSeat}
            id={`${seat.id}-role`}
            onChange={(event) => {
              onUpdateSeat(seat.id, {
                role: event.target.value as SeatRole,
              });
            }}
            value={seat.role}
          >
            <option value="host">Host</option>
            <option value="guest">Guest</option>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 md:justify-end">
        <Button
          aria-label={`Remove ${seat.displayName || seat.label}`}
          disabled={disableRemove}
          onClick={() => {
            onRemoveSeat(seat.id);
          }}
          size="sm"
          variant="ghost"
        >
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>

      {onlyHost || isLockedSeat ? (
        <p className="fine-print md:col-span-3">
          {isLockedSeat
            ? "This seat is pinned to the local operator in the demo shell, so its role and presence stay fixed."
            : "Keep one host seat in the roster. Move host duties first, then remove this channel."}
        </p>
      ) : null}
    </div>
  );
}

function StatusChip({
  detail,
  label,
  tone,
  value,
}: {
  detail?: string;
  label: string;
  tone: "accent" | "danger" | "info" | "neutral" | "ok" | "warn";
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-bg px-3 py-2",
        tone === "danger" && "border-danger/40",
      )}
    >
      <p className="section-label">{label}</p>
      <Pill className="mt-2" tone={tone}>
        {value.replaceAll("_", " ")}
      </Pill>
      {detail === undefined ? null : <p className="fine-print mt-2">{detail}</p>}
    </div>
  );
}

function ownershipDetail(value: Seat["ownershipStatus"]) {
  if (value === "rejoin_available") {
    return "Seat can be reclaimed on a new browser without silent replacement.";
  }

  if (value === "takeover_required") {
    return "Another browser owns this seat. Explicit takeover is required.";
  }

  return "No claim conflict is blocking this seat right now.";
}
