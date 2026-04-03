import { ClipboardCheck, ExternalLink, Link2, MonitorCog } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useControlApp } from "../ControlAppProvider";
import { createControlRoomPath } from "../lib/api";
import { SessionForm } from "../components/SessionForm";
import { Card, CardBody, CardHeader, SectionHeading } from "../components/ui";

export function SessionSetupPage() {
  const {
    activateSession,
    addSeat,
    joinOperatorRoom,
    operatorSeatId,
    removeSeat,
    roleLinks,
    roleLinksStatus,
    session,
    setSessionStatus,
    setTitle,
    updateSeat,
  } = useControlApp();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const currentSessionId = sessionId ?? session.id;
  const [copyFeedback, setCopyFeedback] = useState<{
    message: string;
    tone: "danger" | "ok";
  } | null>(null);
  const editingLocked = session.status === "active" || session.status === "ended";

  useEffect(() => {
    if (copyFeedback === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyFeedback(null);
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyFeedback]);

  async function handleCopyLink(role: "host" | "guest") {
    if (roleLinks === null) {
      setCopyFeedback({
        message:
          roleLinksStatus === "error"
            ? `${role} link unavailable — local control API did not return the role URLs.`
            : `${role} link is still loading from the local control API.`,
        tone: "danger",
      });
      return;
    }

    const copied = await copyText(roleLinks[role]);

    if (copied) {
      setCopyFeedback({ message: `${role} link copied to clipboard`, tone: "ok" });
      return;
    }

    setCopyFeedback({
      message: `${role} link copy failed — clipboard access is unavailable in this browser.`,
      tone: "danger",
    });
  }

  async function handleOpenRoom() {
    if (session.status !== "active") {
      await activateSession();
    }

    await joinOperatorRoom();
    navigate(createControlRoomPath(currentSessionId));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <SectionHeading
          description="The first shell keeps host setup boring: clear roster editing, obvious copy-link actions, and a straight path into the room."
          eyebrow="Control app"
          title="Responsive session setup"
        />

        <SessionForm
          disabled={editingLocked}
          links={roleLinks}
          linksStatus={roleLinksStatus}
          onAddSeat={() => {
            void addSeat();
          }}
          onCopyLink={(role) => {
            void handleCopyLink(role);
          }}
          onOpenRoom={() => {
            void handleOpenRoom();
          }}
          onRemoveSeat={(seatId) => {
            void removeSeat(seatId);
          }}
          onStatusChange={(status) => {
            void setSessionStatus(status);
          }}
          onTitleChange={(title) => {
            void setTitle(title);
          }}
          onUpdateSeat={(seatId, patch) => {
            void updateSeat(seatId, patch);
          }}
          operatorSeatId={operatorSeatId}
          session={session}
        />
      </div>

      <aside className="space-y-6 xl:pt-[3.25rem]">
        <Card>
          <CardHeader>
            <p className="section-label">Run status</p>
            <h3 className="mt-3 text-xl font-semibold text-text">Operator summary</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <SummaryRow label="Session ID" value={session.id} />
            <SummaryRow label="Host run" value={session.status} />
            <SummaryRow label="Seats" value={`${session.seats.length}`} />
            <SummaryRow
              label="Clipboard"
              tone={copyFeedback?.tone}
              value={copyFeedback?.message ?? "Nothing yet"}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <p className="section-label">Readiness</p>
            <h3 className="mt-3 text-xl font-semibold text-text">Before you open the room</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <ChecklistItem
              done={session.title.trim().length > 0}
              icon={<MonitorCog className="size-4" />}
              text="Session title is set"
            />
            <ChecklistItem
              done={session.seats.some((seat) => seat.role === "host")}
              icon={<ClipboardCheck className="size-4" />}
              text="At least one host seat exists"
            />
            <ChecklistItem
              done={session.seats.some((seat) => seat.role === "guest")}
              icon={<Link2 className="size-4" />}
              text="Guest roster is present"
            />
            <ChecklistItem
              done={session.status === "ready" || session.status === "active"}
              icon={<ExternalLink className="size-4" />}
              text="Session is marked ready"
            />
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function SummaryRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "danger" | "ok";
  value: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-md border border-line bg-panel-raised px-4 py-3"
      data-testid={`summary-row-${label.toLowerCase().replaceAll(" ", "-")}`}
    >
      <span className="section-label">{label}</span>
      <span
        className={
          tone === "danger" ? "font-mono text-sm text-danger" : "font-mono text-sm text-text"
        }
      >
        {value}
      </span>
    </div>
  );
}

function ChecklistItem({ done, icon, text }: { done: boolean; icon: ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-panel-raised px-4 py-3 text-sm text-text">
      <span className={done ? "text-ok" : "text-warn"}>{icon}</span>
      <div>
        <p>{text}</p>
        <p className="fine-print mt-1">
          {done ? "Ready" : "Needs attention before the run starts."}
        </p>
      </div>
    </div>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to the legacy copy path
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.append(textArea);
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}
