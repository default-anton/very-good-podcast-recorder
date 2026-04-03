import { describe, expect, it } from "vitest";

import {
  createBootstrapApiPath,
  createControlSessionPath,
  createSessionApiPath,
  createSessionSeatApiPath,
} from "../control/src/app/lib/api";
import { controlQueryKeys } from "../control/src/app/lib/query";
import { buildJoinUrl } from "../shared/joinLinks";

import { jsonRequest, provisionLocalSession, requestControl } from "./control-api.helpers";

describe("control-plane local API bootstrap", () => {
  it("returns bootstrap data for a provisioned session and valid join key", async () => {
    const sessionId = "bootstrap-proof-01";
    const sessionPath = createSessionApiPath(sessionId);

    const missingBootstrap = await requestControl(
      createBootstrapApiPath(sessionId, "guest", "bad-key"),
    );
    const provisionedSession = await provisionLocalSession(sessionId);
    const guestBootstrap = await requestControl(
      createBootstrapApiPath(sessionId, "guest", provisionedSession.guestJoinKey),
    );
    const guestBootstrapBody = await guestBootstrap.json();
    const fetchedSession = await requestControl(sessionPath);
    const fetchedBody = await fetchedSession.json();

    expect(missingBootstrap.status).toBe(404);
    expect(provisionedSession.response.status).toBe(200);
    expect(provisionedSession.body.session.links.host).toMatch(
      /^http:\/\/127\.0\.0\.1:5174\/join\/bootstrap-proof-01\/host\?k=local-host-/,
    );
    expect(provisionedSession.body.session.links.guest).toMatch(
      /^http:\/\/127\.0\.0\.1:5174\/join\/bootstrap-proof-01\/guest\?k=local-guest-/,
    );
    expect(provisionedSession.hostJoinKey).not.toBe("");
    expect(provisionedSession.guestJoinKey).not.toBe("");
    expect(provisionedSession.hostJoinKey).not.toBe(provisionedSession.guestJoinKey);
    expect(fetchedSession.status).toBe(200);
    expect(fetchedBody.session.links).toEqual(provisionedSession.body.session.links);
    expect(guestBootstrap.status).toBe(200);
    expect(guestBootstrapBody.session).toEqual({
      id: sessionId,
      role: "guest",
      status: "ready",
      title: "Late Night Tape Check",
    });
  });

  it("only bootstraps sessions that are ready or active", async () => {
    const sessionId = "bootstrap-status-proof-01";
    const sessionPath = createSessionApiPath(sessionId);
    const provisionedSession = await provisionLocalSession(sessionId);

    const readyBootstrap = await requestControl(
      createBootstrapApiPath(sessionId, "guest", provisionedSession.guestJoinKey),
    );
    const draftSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "draft",
      }),
    );
    const draftBootstrap = await requestControl(
      createBootstrapApiPath(sessionId, "guest", provisionedSession.guestJoinKey),
    );
    const restoredReadySession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "ready",
      }),
    );
    const activeSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "active",
      }),
    );
    const activeBootstrap = await requestControl(
      createBootstrapApiPath(sessionId, "guest", provisionedSession.guestJoinKey),
    );
    const failedSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        recordingHealth: "failed",
        recordingPhase: "failed",
      }),
    );
    const endedSession = await requestControl(
      sessionPath,
      jsonRequest("PATCH", {
        status: "ended",
      }),
    );
    const endedBootstrap = await requestControl(
      createBootstrapApiPath(sessionId, "guest", provisionedSession.guestJoinKey),
    );

    expect(readyBootstrap.status).toBe(200);
    expect(draftSession.status).toBe(200);
    expect(draftBootstrap.status).toBe(409);
    expect(await draftBootstrap.json()).toEqual({
      error: {
        code: "session_not_joinable",
        message:
          "Local session bootstrap-status-proof-01 is draft. Only ready or active sessions can be bootstrapped.",
      },
    });
    expect(restoredReadySession.status).toBe(200);
    expect(activeSession.status).toBe(200);
    expect(activeBootstrap.status).toBe(200);
    expect(failedSession.status).toBe(200);
    expect(endedSession.status).toBe(200);
    expect(endedBootstrap.status).toBe(409);
    expect(await endedBootstrap.json()).toEqual({
      error: {
        code: "session_not_joinable",
        message:
          "Local session bootstrap-status-proof-01 is ended. Only ready or active sessions can be bootstrapped.",
      },
    });
  });

  it("returns structured JSON for malformed path encoding and invalid role links", async () => {
    const malformedPath = await requestControl("/api/v1/sessions/%E0%A4%A");
    const invalidRole = await requestControl(
      "/api/v1/sessions/bootstrap-proof-03/bootstrap/admin?k=bad-key",
    );

    expect(malformedPath.status).toBe(400);
    expect(await malformedPath.json()).toEqual({
      error: {
        code: "invalid_path_segment",
        message: "session id must be valid percent-encoded UTF-8.",
      },
    });
    expect(invalidRole.status).toBe(400);
    expect(await invalidRole.json()).toEqual({
      error: {
        code: "invalid_role",
        message: "Role must be host or guest.",
      },
    });
  });

  it("encodes session and seat ids when building control and join routes", () => {
    const sessionId = "space/slash?hash#id";
    const seatId = "seat/guest#02";

    expect(createSessionApiPath(sessionId)).toBe("/api/v1/sessions/space%2Fslash%3Fhash%23id");
    expect(createSessionSeatApiPath(sessionId, seatId)).toBe(
      "/api/v1/sessions/space%2Fslash%3Fhash%23id/seats/seat%2Fguest%2302",
    );
    expect(createControlSessionPath(sessionId)).toBe("/sessions/space%2Fslash%3Fhash%23id");
    expect(buildJoinUrl("http://127.0.0.1:5174", sessionId, "guest", "join-key")).toBe(
      "http://127.0.0.1:5174/join/space%2Fslash%3Fhash%23id/guest?k=join-key",
    );
  });

  it("keys bootstrap cache entries by join key", () => {
    expect(controlQueryKeys.bootstrap("session-01", "guest", "join-key-a")).not.toEqual(
      controlQueryKeys.bootstrap("session-01", "guest", "join-key-b"),
    );
  });
});
