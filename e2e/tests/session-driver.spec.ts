import { createServer, type IncomingMessage } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HarnessSessionDriver,
  createHarnessPaths,
  loadHarnessBootstrapConfig,
} from "../fixtures/session-driver";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("session driver", () => {
  it("loads the local harness bootstrap config with repo-local precedence", async () => {
    const cwd = await createTempRepo();

    await writeRepoFile(
      cwd,
      "deploy/local/sessiond.env",
      [
        "SESSIOND_SESSION_ID=from-committed-env",
        "SESSIOND_BOOTSTRAP_HOST_JOIN_KEY=committed-host",
        "SESSIOND_BOOTSTRAP_GUEST_JOIN_KEY=committed-guest",
        'SESSIOND_BOOTSTRAP_SEATS_JSON=\'[{"id":"seat-host-01","role":"host","display_name":"Anton Host"}]\'',
      ].join("\n"),
    );
    await writeRepoFile(
      cwd,
      ".env.local",
      [
        "SESSIOND_SESSION_ID=from-local-env",
        "SESSIOND_BOOTSTRAP_GUEST_JOIN_KEY=local-guest",
        'SESSIOND_BOOTSTRAP_SEATS_JSON=\'[{"id":"seat-host-01","role":"host","display_name":"Anton Host"},{"id":"seat-guest-02","role":"guest","display_name":"Mara Chen"}]\'',
      ].join("\n"),
    );

    const config = await loadHarnessBootstrapConfig({
      cwd,
      env: {
        SESSIOND_BOOTSTRAP_HOST_JOIN_KEY: "shell-host",
      },
    });

    expect(config).toEqual({
      guestJoinKey: "local-guest",
      hostJoinKey: "shell-host",
      seats: [
        { displayName: "Anton Host", id: "seat-host-01", role: "host" },
        { displayName: "Mara Chen", id: "seat-guest-02", role: "guest" },
      ],
      sessionId: "from-local-env",
    });
    expect(createHarnessPaths({ cwd, sessionId: config.sessionId }).sessionArtifactRoot).toBe(
      path.join(cwd, ".vgpr/local/artifacts/from-local-env"),
    );
  });

  it("claims seats and uploads chunks with the expected cookie and headers", async () => {
    const requests: Array<{
      body: string;
      headers: Record<string, string | undefined>;
      method: string;
      pathname: string;
    }> = [];
    const server = createServer(async (request, response) => {
      const body = await readRequestBody(request);

      requests.push({
        body,
        headers: {
          cookie: request.headers.cookie,
          "content-length": request.headers["content-length"],
          "content-type": request.headers["content-type"],
          "x-chunk-sha256": request.headers["x-chunk-sha256"] as string | undefined,
        },
        method: request.method ?? "",
        pathname: request.url ?? "",
      });

      if (request.method === "PUT" && request.url === "/api/v1/sessions/amber-session-01") {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            runtime: {
              baseUrl: "http://127.0.0.1:8081",
              liveKitUrl: "ws://127.0.0.1:7880",
              roomName: "amber-session-01",
              state: "ready",
              turn: null,
            },
            session: {
              id: "amber-session-01",
              links: { guest: "guest-link", host: "host-link" },
              nextSeatNumber: 4,
              recordingHealth: "healthy",
              recordingPhase: "waiting",
              seats: [],
              status: "ready",
              title: "Harness",
            },
          }),
        );
        return;
      }

      if (request.method === "POST" && request.url === "/api/v1/seat-claims/claim") {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Set-Cookie", "vgpr_claim=claim-cookie; Path=/; HttpOnly");
        response.end(
          JSON.stringify({
            claim_state: "active",
            claim_version: 1,
            livekit: {
              participant_identity: "seat-host-01",
              room: "amber-session-01",
              token: "token-123",
            },
            participant_seat_id: "seat-host-01",
            role: "host",
            session_id: "amber-session-01",
          }),
        );
        return;
      }

      if (request.method === "PUT" && request.url === "/api/v1/recording-tracks/trk-01/chunks/0") {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            byte_size: 11,
            chunk_index: 0,
            recording_track_id: "trk-01",
            sha256_hex: request.headers["x-chunk-sha256"],
            status: "stored",
          }),
        );
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: { code: "not_found" } }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();

      if (address === null || typeof address === "string") {
        throw new Error("Server address was not available.");
      }

      const origin = `http://127.0.0.1:${address.port}`;
      const driver = new HarnessSessionDriver({
        bootstrap: {
          guestJoinKey: "guest-secret",
          hostJoinKey: "host-secret",
          seats: [{ displayName: "Anton Host", id: "seat-host-01", role: "host" }],
          sessionId: "amber-session-01",
        },
        controlApiOrigin: origin,
        sessiondBaseUrl: origin,
      });

      const session = await driver.ensureControlSession();
      const claim = await driver.claimSeat({ role: "host", seatId: "seat-host-01" });
      const upload = await driver.uploadChunk(claim, {
        chunkBytes: new TextEncoder().encode("hello world"),
        chunkIndex: 0,
        contentType: "audio/webm",
        recordingTrackId: "trk-01",
      });

      expect(session.session.id).toBe("amber-session-01");
      expect(claim.cookie).toBe("claim-cookie");
      expect(upload.status).toBe("stored");
      expect(requests).toHaveLength(3);
      expect(requests[0]).toMatchObject({
        body: "",
        method: "PUT",
        pathname: "/api/v1/sessions/amber-session-01",
      });
      expect(JSON.parse(requests[1].body)).toEqual({
        join_key: "host-secret",
        participant_seat_id: "seat-host-01",
        role: "host",
        session_id: "amber-session-01",
      });
      expect(requests[1].headers.cookie).toBeUndefined();
      expect(requests[2]).toMatchObject({
        headers: {
          cookie: "vgpr_claim=claim-cookie",
          "content-length": "11",
          "content-type": "audio/webm",
        },
        method: "PUT",
        pathname: "/api/v1/recording-tracks/trk-01/chunks/0",
      });
      expect(requests[2].headers["x-chunk-sha256"]).toMatch(/^[a-f0-9]{64}$/u);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});

async function createTempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "vgpr-harness-"));

  tempDirs.push(cwd);
  await mkdir(path.join(cwd, "deploy/local"), { recursive: true });

  return cwd;
}

async function writeRepoFile(cwd: string, relativePath: string, content: string) {
  const filePath = path.join(cwd, relativePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${content}\n`, "utf8");
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(body);
    });
    request.on("error", reject);
  });
}
