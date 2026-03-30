import { BadgeCheck, ChevronRight, KeyRound, RotateCcw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { buildJoinRoomPath } from "../../../../shared/joinLinks";
import { DevicePreview } from "../components/DevicePreview";
import { SeatPicker, seatPickerNotice } from "../components/SeatPicker";
import { Button, Card, CardBody, CardHeader, Pill, SectionHeading } from "../components/ui";
import { useSessionApp } from "../App";

export function JoinPage() {
  const {
    applyJoinPreset,
    cameraOptions,
    chooseSeat,
    clearSeatSelection,
    confirmTakeover,
    dismissTakeover,
    joinPreset,
    joinRoom,
    micOptions,
    selectPreviewCamera,
    selectPreviewMic,
    session,
    takeoverSeatId,
  } = useSessionApp();
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentSessionId = sessionId ?? session.id;
  const currentSearch = location.search;
  const roomJoinLocked = session.joinedSeatId !== null;
  const localSeat = session.seats.find((seat) => seat.id === session.joinedSeatId) ?? null;
  const selectedSeat = session.seats.find((seat) => seat.id === session.selectedSeatId) ?? null;
  const takeoverSeat = session.seats.find((seat) => seat.id === takeoverSeatId) ?? null;
  const selectionNotice = selectedSeat === null ? null : seatPickerNotice(selectedSeat);

  function handleJoinRoom() {
    joinRoom();
    navigate({
      pathname: buildJoinRoomPath(currentSessionId, session.role),
      search: currentSearch,
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        description="Validate the role link, keep seat ownership explicit, and show one boring device check before the room opens."
        eyebrow="Session app"
        title="Responsive join flow"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)] xl:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-label">Role link validation</p>
                  <h3 className="mt-3 text-xl font-semibold text-text">Role link is valid</h3>
                </div>
                <Pill tone="ok">
                  <BadgeCheck className="mr-2 size-3.5" />
                  validated
                </Pill>
              </div>
            </CardHeader>
            <CardBody className="grid gap-3 lg:grid-cols-3">
              <ValidationRow label="Session ID" value={session.id} />
              <ValidationRow label="Role" value={session.role} />
              <ValidationRow
                label="Current step"
                value={
                  roomJoinLocked
                    ? "already in room"
                    : selectedSeat === null
                      ? "seat picker"
                      : "device preview"
                }
              />
            </CardBody>
          </Card>

          <SeatPicker
            activeSeatId={session.selectedSeatId}
            disabled={roomJoinLocked}
            onChooseSeat={chooseSeat}
            role={session.role}
            seats={session.seats}
          />
        </div>

        <aside className="space-y-6 xl:sticky xl:top-28">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-label">Join flow proof</p>
                  <h3 className="mt-3 text-xl font-semibold text-text">Exercise the shell</h3>
                </div>
                <Pill tone="info">local bootstrap</Pill>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="fine-print">
                These presets keep the slice reviewable before real claim endpoints exist.
              </p>
              <div className="flex flex-wrap gap-2">
                <JoinPresetButton
                  active={joinPreset === "fresh"}
                  disabled={roomJoinLocked}
                  label="Fresh join"
                  onClick={() => {
                    applyJoinPreset("fresh");
                  }}
                />
                <JoinPresetButton
                  active={joinPreset === "owned"}
                  disabled={roomJoinLocked}
                  label="This browser already owns a seat"
                  onClick={() => {
                    applyJoinPreset("owned");
                  }}
                />
                <JoinPresetButton
                  active={joinPreset === "recover"}
                  disabled={roomJoinLocked}
                  label="Recovery needed"
                  onClick={() => {
                    applyJoinPreset("recover");
                  }}
                />
                <JoinPresetButton
                  active={joinPreset === "takeover"}
                  disabled={roomJoinLocked}
                  label="Explicit takeover"
                  onClick={() => {
                    applyJoinPreset("takeover");
                  }}
                />
              </div>
            </CardBody>
          </Card>

          {roomJoinLocked && localSeat !== null ? (
            <Card>
              <CardHeader>
                <p className="section-label">Room ownership</p>
                <h3 className="mt-3 text-xl font-semibold text-text">
                  This browser is already in the room as {localSeat.displayName}
                </h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <p className="fine-print">
                  Seat changes stay locked until you leave from the room shell. That keeps one
                  browser on one seat and avoids silently leaking joined state onto another claim.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      navigate({
                        pathname: buildJoinRoomPath(currentSessionId, session.role),
                        search: currentSearch,
                      });
                    }}
                    variant="primary"
                  >
                    Return to room
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : selectedSeat !== null ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md border border-line bg-panel-raised p-2 text-accent">
                      {selectionNotice?.icon}
                    </div>
                    <div>
                      <p className="section-label">Claim summary</p>
                      <h3 className="mt-1 text-lg font-semibold text-text">
                        {selectionNotice?.title}
                      </h3>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <p className="fine-print">{selectionNotice?.body}</p>
                </CardBody>
              </Card>

              <DevicePreview
                cameraOptions={cameraOptions}
                micOptions={micOptions}
                onBack={clearSeatSelection}
                onCameraChange={selectPreviewCamera}
                onJoin={handleJoinRoom}
                onMicChange={selectPreviewMic}
                previewCamera={session.previewCamera}
                previewMic={session.previewMic}
                seat={selectedSeat}
              />
            </>
          ) : (
            <Card>
              <CardHeader>
                <p className="section-label">Device preview</p>
                <h3 className="mt-3 text-xl font-semibold text-text">Pick a seat first</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <PreviewHint
                  icon={<KeyRound className="size-4" />}
                  text="Validate the role link."
                />
                <PreviewHint
                  icon={<ChevronRight className="size-4" />}
                  text="Claim, recover, or explicitly take over one seat."
                />
                <PreviewHint
                  icon={<RotateCcw className="size-4" />}
                  text="Then the minimal device preview appears here."
                />
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {takeoverSeat !== null ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm">
          <Card aria-modal="true" className="w-full max-w-lg" role="dialog">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-md border border-danger/40 bg-danger/12 p-2 text-danger">
                  <ShieldAlert className="size-4" />
                </div>
                <div>
                  <p className="section-label">Explicit takeover required</p>
                  <h3 className="mt-2 text-xl font-semibold text-text">
                    Take over {takeoverSeat.displayName}?
                  </h3>
                </div>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-text">
                Another browser owns this seat right now. Taking it over keeps the same seat
                identity and immediately evicts the old browser from claim-authenticated work.
              </p>
              <p className="fine-print">
                This action stays explicit by design. There is never a silent two-owner window.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmTakeover} variant="danger">
                  Take over seat
                </Button>
                <Button onClick={dismissTakeover} variant="ghost">
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ValidationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-raised px-4 py-3">
      <p className="section-label">{label}</p>
      <p className="mt-2 break-all font-mono text-sm text-text">{value}</p>
    </div>
  );
}

function JoinPresetButton({
  active,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant={active ? "primary" : "secondary"}
    >
      {label}
    </Button>
  );
}

function PreviewHint({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-panel-raised px-4 py-3 text-sm text-text">
      <span className="mt-0.5 text-accent">{icon}</span>
      <p>{text}</p>
    </div>
  );
}
