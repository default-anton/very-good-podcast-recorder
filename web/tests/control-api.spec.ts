import { describe, expect, it } from "vitest";

import {
  createBootstrapApiPath,
  createControlSessionPath,
  createSessionApiPath,
} from "../control/src/app/lib/api";
import { controlQueryKeys } from "../control/src/app/lib/query";
import worker from "../control/src/worker";
import { buildJoinUrl } from "../shared/joinLinks";

describe("control-plane local API", () => {
  it("requires explicit provisioning before sessions can be read or bootstrapped", async () => {
    const sessionId = "bootstrap-proof-01";
    const sessionPath = createSessionApiPath(sessionId);

    const missingSession = await worker.fetch(new Request(`http://127.0.0.1:5173${sessionPath}`));
    const missingBootstrap = await worker.fetch(
      new Request(`http://127.0.0.1:5173${createBootstrapApiPath(sessionId, "guest", "bad-key")}`),
    );
    const provisionedSession = await worker.fetch(
      new Request(`http://127.0.0.1:5173${sessionPath}`, { method: "PUT" }),
    );
    const provisionedBody = await provisionedSession.json();
    const guestJoinKey = new URL(provisionedBody.session.links.guest).searchParams.get("k");
    const hostJoinKey = new URL(provisionedBody.session.links.host).searchParams.get("k");
    const fetchedSession = await worker.fetch(new Request(`http://127.0.0.1:5173${sessionPath}`));
    const fetchedBody = await fetchedSession.json();
    const guestBootstrap = await worker.fetch(
      new Request(
        `http://127.0.0.1:5173${createBootstrapApiPath(sessionId, "guest", guestJoinKey ?? "")}`,
      ),
    );
    const guestBootstrapBody = await guestBootstrap.json();

    expect(missingSession.status).toBe(404);
    expect(await missingSession.json()).toEqual({
      error: {
        code: "session_not_found",
        message:
          "Local session bootstrap-proof-01 does not exist. Provision it before reading or bootstrapping it.",
      },
    });
    expect(missingBootstrap.status).toBe(404);
    expect(provisionedSession.status).toBe(200);
    expect(provisionedBody.session.id).toBe(sessionId);
    expect(provisionedBody.session.links.host).toMatch(
      /^http:\/\/127\.0\.0\.1:5174\/join\/bootstrap-proof-01\/host\?k=local-host-/,
    );
    expect(provisionedBody.session.links.guest).toMatch(
      /^http:\/\/127\.0\.0\.1:5174\/join\/bootstrap-proof-01\/guest\?k=local-guest-/,
    );
    expect(hostJoinKey).not.toBeNull();
    expect(guestJoinKey).not.toBeNull();
    expect(hostJoinKey).not.toBe(guestJoinKey);
    expect(fetchedSession.status).toBe(200);
    expect(fetchedBody.session.links).toEqual(provisionedBody.session.links);
    expect(guestBootstrap.status).toBe(200);
    expect(guestBootstrapBody.session).toEqual({
      id: sessionId,
      role: "guest",
      status: "ready",
      title: "Late Night Tape Check",
    });
  });

  it("keeps session summaries same-origin and only exposes bootstrap over approved local CORS origins", async () => {
    const sessionId = "cors-proof-01";
    const sessionPath = createSessionApiPath(sessionId);

    const provisionedSession = await worker.fetch(
      new Request(`http://127.0.0.1:5173${sessionPath}`, { method: "PUT" }),
    );
    const provisionedBody = await provisionedSession.json();
    const guestJoinKey = new URL(provisionedBody.session.links.guest).searchParams.get("k");
    const bootstrapPath = createBootstrapApiPath(sessionId, "guest", guestJoinKey ?? "");
    const crossOriginSession = await worker.fetch(
      new Request(`http://127.0.0.1:5173${sessionPath}`, {
        headers: {
          Origin: "http://127.0.0.1:5174",
        },
      }),
    );
    const allowedPreflight = await worker.fetch(
      new Request(`http://127.0.0.1:5173${bootstrapPath}`, {
        headers: {
          "Access-Control-Request-Headers": "Content-Type",
          Origin: "http://127.0.0.1:5174",
        },
        method: "OPTIONS",
      }),
    );
    const allowedBootstrap = await worker.fetch(
      new Request(`http://127.0.0.1:5173${bootstrapPath}`, {
        headers: {
          Origin: "http://127.0.0.1:5174",
        },
      }),
    );
    const deniedPreflight = await worker.fetch(
      new Request(`http://127.0.0.1:5173${bootstrapPath}`, {
        headers: {
          "Access-Control-Request-Headers": "Content-Type",
          Origin: "https://evil.example",
        },
        method: "OPTIONS",
      }),
    );

    expect(crossOriginSession.status).toBe(200);
    expect(crossOriginSession.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(allowedPreflight.status).toBe(204);
    expect(allowedPreflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:5174",
    );
    expect(allowedPreflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(allowedPreflight.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(allowedBootstrap.status).toBe(200);
    expect(allowedBootstrap.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:5174",
    );
    expect(deniedPreflight.status).toBe(403);
    expect(deniedPreflight.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns structured JSON for malformed path encoding and invalid role links", async () => {
    const malformedPath = await worker.fetch(
      new Request("http://127.0.0.1:5173/api/v1/sessions/%E0%A4%A"),
    );
    const invalidRole = await worker.fetch(
      new Request(
        "http://127.0.0.1:5173/api/v1/sessions/bootstrap-proof-03/bootstrap/admin?k=bad-key",
      ),
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
});

describe("control route helpers", () => {
  it("encodes session ids when building control and join routes", () => {
    const sessionId = "space/slash?hash#id";

    expect(createSessionApiPath(sessionId)).toBe("/api/v1/sessions/space%2Fslash%3Fhash%23id");
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
