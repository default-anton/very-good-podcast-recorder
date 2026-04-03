import { describe, expect, it } from "vitest";

import { createSessionApiPath } from "../control/src/app/lib/api";

import { jsonRequest, provisionLocalSession, requestControl } from "./control-api.helpers";

describe("control-plane local API sessions", () => {
  it("requires explicit provisioning before sessions can be read", async () => {
    const sessionId = "session-read-proof-01";
    const sessionPath = createSessionApiPath(sessionId);

    const missingSession = await requestControl(sessionPath);
    const provisionedSession = await provisionLocalSession(sessionId);
    const fetchedSession = await requestControl(sessionPath);
    const fetchedBody = await fetchedSession.json();

    expect(missingSession.status).toBe(404);
    expect(await missingSession.json()).toEqual({
      error: {
        code: "session_not_found",
        message:
          "Local session session-read-proof-01 does not exist. Provision it before reading or bootstrapping it.",
      },
    });
    expect(provisionedSession.response.status).toBe(200);
    expect(provisionedSession.body.session.id).toBe(sessionId);
    expect(fetchedSession.status).toBe(200);
    expect(fetchedBody.session.links).toEqual(provisionedSession.body.session.links);
  });

  it("updates session fields without rotating role links", async () => {
    const sessionId = "session-update-proof-01";
    const sessionPath = createSessionApiPath(sessionId);
    const provisionedSession = await provisionLocalSession(sessionId);

    const updatedSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        title: "Session CRUD wired",
      }),
    );
    const updatedBody = await updatedSession.json();
    const fetchedSession = await requestControl(sessionPath);
    const fetchedBody = await fetchedSession.json();

    expect(updatedSession.status).toBe(200);
    expect(updatedBody.session.title).toBe("Session CRUD wired");
    expect(updatedBody.session.links).toEqual(provisionedSession.body.session.links);
    expect(fetchedSession.status).toBe(200);
    expect(fetchedBody.session.title).toBe("Session CRUD wired");
    expect(fetchedBody.session.links).toEqual(provisionedSession.body.session.links);
  });

  it("enforces session status and recording phase transitions", async () => {
    const sessionId = "session-transition-proof-01";
    const sessionPath = createSessionApiPath(sessionId);

    await provisionLocalSession(sessionId);

    const activatedSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "active",
      }),
    );
    const recordingSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        recordingHealth: "healthy",
        recordingPhase: "recording",
      }),
    );
    const blockedEarlyEnd = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "ended",
      }),
    );
    const blockedTitleEdit = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        title: "Locked title",
      }),
    );
    const drainingSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        recordingPhase: "draining",
      }),
    );
    const stoppedSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        recordingPhase: "stopped",
      }),
    );
    const invalidStatusTransition = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "draft",
      }),
    );
    const endedSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "ended",
      }),
    );
    const blockedEndedRecordingPatch = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        recordingPhase: "failed",
      }),
    );

    expect(activatedSession.status).toBe(200);
    expect(recordingSession.status).toBe(200);
    expect(blockedEarlyEnd.status).toBe(409);
    expect(await blockedEarlyEnd.json()).toEqual({
      error: {
        code: "invalid_session_transition",
        message:
          "Cannot end local session session-transition-proof-01 while recording phase is recording. Provision a new local session or return to setup instead of forcing this transition.",
      },
    });
    expect(blockedTitleEdit.status).toBe(409);
    expect(await blockedTitleEdit.json()).toEqual({
      error: {
        code: "session_roster_locked",
        message:
          "Session title edits are locked while local session session-transition-proof-01 is active. Create a new session for a different active or ended roster.",
      },
    });
    expect(drainingSession.status).toBe(200);
    expect(stoppedSession.status).toBe(200);
    expect(invalidStatusTransition.status).toBe(409);
    expect(await invalidStatusTransition.json()).toEqual({
      error: {
        code: "invalid_session_transition",
        message:
          "Cannot move local session session-transition-proof-01 from active to draft. Provision a new local session or return to setup instead of forcing this transition.",
      },
    });
    expect(endedSession.status).toBe(200);
    expect(blockedEndedRecordingPatch.status).toBe(409);
    expect(await blockedEndedRecordingPatch.json()).toEqual({
      error: {
        code: "session_ended",
        message:
          "Local session session-transition-proof-01 is ended. This session is history-only and can no longer be edited.",
      },
    });
  });
});
