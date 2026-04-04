import { describe, expect, it } from "vitest";

import { createBootstrapApiPath, createSessionApiPath } from "../control/src/app/lib/api";
import { getLocalControlAppOrigin, getLocalSessionAppOrigin } from "../shared/localRuntime";

import { provisionLocalSession, requestControl } from "./control-api.helpers";

describe("control-plane local API CORS", () => {
  it("exposes local control-plane routes over approved loopback app origins only", async () => {
    const sessionId = "cors-proof-01";
    const sessionPath = createSessionApiPath(sessionId);
    const provisionedSession = await provisionLocalSession(sessionId);
    const bootstrapPath = createBootstrapApiPath(
      sessionId,
      "guest",
      provisionedSession.guestJoinKey,
    );

    const controlAppOrigin = getLocalControlAppOrigin();
    const sessionAppOrigin = getLocalSessionAppOrigin();
    const controlSession = await requestControl(sessionPath, {
      headers: {
        Origin: controlAppOrigin,
      },
    });
    const sessionAppSession = await requestControl(sessionPath, {
      headers: {
        Origin: sessionAppOrigin,
      },
    });
    const allowedPreflight = await requestControl(bootstrapPath, {
      headers: {
        "Access-Control-Request-Headers": "Content-Type",
        Origin: sessionAppOrigin,
      },
      method: "OPTIONS",
    });
    const allowedBootstrap = await requestControl(bootstrapPath, {
      headers: {
        Origin: sessionAppOrigin,
      },
    });
    const deniedPreflight = await requestControl(bootstrapPath, {
      headers: {
        "Access-Control-Request-Headers": "Content-Type",
        Origin: "https://evil.example",
      },
      method: "OPTIONS",
    });

    expect(controlSession.status).toBe(200);
    expect(controlSession.headers.get("Access-Control-Allow-Origin")).toBe(controlAppOrigin);
    expect(sessionAppSession.status).toBe(200);
    expect(sessionAppSession.headers.get("Access-Control-Allow-Origin")).toBe(sessionAppOrigin);
    expect(allowedPreflight.status).toBe(204);
    expect(allowedPreflight.headers.get("Access-Control-Allow-Origin")).toBe(sessionAppOrigin);
    expect(allowedPreflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(allowedPreflight.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(allowedBootstrap.status).toBe(200);
    expect(allowedBootstrap.headers.get("Access-Control-Allow-Origin")).toBe(sessionAppOrigin);
    expect(deniedPreflight.status).toBe(403);
    expect(deniedPreflight.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
