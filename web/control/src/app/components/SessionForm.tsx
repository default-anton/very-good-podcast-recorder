import { Link2, RadioTower, Save } from "lucide-react";

import type { ControlSession, Seat } from "../lib/types";
import { SeatList } from "./SeatList";
import { Button, Card, CardBody, CardHeader, Input, Pill } from "./ui";

export function SessionForm({
  disabled,
  onAddSeat,
  onCopyLink,
  onOpenRoom,
  onRemoveSeat,
  onStatusChange,
  onTitleChange,
  onUpdateSeat,
  operatorSeatId,
  session,
}: {
  disabled: boolean;
  onAddSeat: () => void;
  onCopyLink: (role: "host" | "guest") => void;
  onOpenRoom: () => void;
  onRemoveSeat: (seatId: string) => void;
  onStatusChange: (status: "draft" | "ready") => void;
  onTitleChange: (title: string) => void;
  onUpdateSeat: (seatId: string, patch: Partial<Pick<Seat, "displayName" | "role">>) => void;
  operatorSeatId: string;
  session: ControlSession;
}) {
  const guestCount = session.seats.filter((seat) => seat.role === "guest").length;
  const hostCount = session.seats.filter((seat) => seat.role === "host").length;
  const readyToOpen = session.status === "ready" || session.status === "active";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-label">Host session setup</p>
            <h3 className="mt-3 text-xl font-semibold text-text">Session identity and roster</h3>
            <p className="fine-print mt-2 max-w-2xl">
              Keep title, seats, and role links in one place. Once the run is active, roster edits
              lock.
            </p>
          </div>
          <Pill
            tone={
              session.status === "active"
                ? "accent"
                : session.status === "ready"
                  ? "info"
                  : "neutral"
            }
          >
            {session.status}
          </Pill>
        </CardHeader>
        <CardBody className="space-y-6">
          <div>
            <label className="section-label" htmlFor="session-title">
              Session title
            </label>
            <Input
              disabled={disabled}
              id="session-title"
              maxLength={80}
              onChange={(event) => {
                onTitleChange(event.target.value);
              }}
              value={session.title}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled}
              onClick={() => {
                onStatusChange("draft");
              }}
              variant={session.status === "draft" ? "primary" : "secondary"}
            >
              <Save className="size-4" />
              Draft
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                onStatusChange("ready");
              }}
              variant={session.status === "ready" ? "primary" : "secondary"}
            >
              <RadioTower className="size-4" />
              Ready to join
            </Button>
            <Button disabled={!readyToOpen} onClick={onOpenRoom} variant="primary">
              Open room shell
            </Button>
          </div>

          {disabled ? (
            <p className="rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text">
              This hosted run is already active or ended. Roster and role edits stay locked until
              the next run.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-label">Roster</p>
              <h3 className="mt-3 text-xl font-semibold text-text">Channel strips</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill tone="accent">{session.seats.length} seats</Pill>
              <Pill tone="info">{hostCount} hosts</Pill>
              <Pill tone="neutral">{guestCount} guests</Pill>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <SeatList
            disabled={disabled}
            lockedSeatId={operatorSeatId}
            mode="setup"
            onAddSeat={onAddSeat}
            onRemoveSeat={onRemoveSeat}
            onUpdateSeat={onUpdateSeat}
            seats={session.seats}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <p className="section-label">Share links</p>
          <h3 className="mt-3 text-xl font-semibold text-text">Stable role URLs</h3>
        </CardHeader>
        <CardBody className="grid gap-4 lg:grid-cols-2">
          <LinkCard label="Host" onCopy={() => onCopyLink("host")} url={session.links.host} />
          <LinkCard label="Guest" onCopy={() => onCopyLink("guest")} url={session.links.guest} />
        </CardBody>
      </Card>
    </div>
  );
}

function LinkCard({ label, onCopy, url }: { label: string; onCopy: () => void; url: string }) {
  return (
    <div className="raised-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-label">{label} link</p>
          <p className="mt-2 break-all font-mono text-sm text-text">{url}</p>
        </div>
        <Button onClick={onCopy} size="sm" variant="secondary">
          <Link2 className="size-4" />
          Copy
        </Button>
      </div>
    </div>
  );
}
