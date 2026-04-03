import { describe, expect, it } from "vitest";

import { createBootstrapApiPath, createSessionApiPath } from "../control/src/app/lib/api";

import { provisionLocalSession, requestControl } from "./control-api.helpers";

describe("control-plane local API CORS", () => {
  it("keeps session summaries same-origin and only exposes bootstrap over approved local CORS origins", async () => {
    const sessionId = "cors-proof-01";
    const sessionPath = createSessionApiPath(sessionId);
    const provisionedSession = await provisionLocalSession(sessionId);
    const bootstrapPath = createBootstrapApiPath(
      sessionId,
      "guest",
      provisionedSession.guestJoinKey,
    );

    const crossOriginSession = await requestControl(sessionPath, {
      headers: {
        Origin: "http://127.0.0.1:5174",
      },
    });
    const allowedPreflight = await requestControl(bootstrapPath, {
      headers: {
        "Access-Control-Request-Headers": "Content-Type",
        Origin: "http://127.0.0.1:5174",
      },
      method: "OPTIONS",
    });
    const allowedBootstrap = await requestControl(bootstrapPath, {
      headers: {
        Origin: "http://127.0.0.1:5174",
      },
    });
    const deniedPreflight = await requestControl(bootstrapPath, {
      headers: {
        "Access-Control-Request-Headers": "Content-Type",
        Origin: "https://evil.example",
      },
      method: "OPTIONS",
    });

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
});
