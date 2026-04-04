import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { describe, expect, it } from "vitest";

import { createPlaywrightWebServers, probeExistingHttpServer } from "../../playwright.config";
import { localRuntimePorts } from "../shared/localRuntime";

describe("playwright config", () => {
  it("reuses only the local runtime servers that were positively identified", () => {
    expect(createPlaywrightWebServers({ controlApp: true, sessionApp: false })).toEqual([
      {
        command: "mise exec -- pnpm exec vite --config web/control/vite.config.ts",
        port: localRuntimePorts.controlApp,
        reuseExistingServer: true,
      },
      {
        command: "mise exec -- pnpm exec vite --config web/session/vite.config.ts",
        port: localRuntimePorts.sessionApp,
        reuseExistingServer: false,
      },
    ]);
  });

  it("only reuses an existing server when every expected marker matches", async () => {
    await withServers(
      {
        controlApi: {
          body: '{"app": "control-api", "status": "ok"}',
          contentType: "application/json",
        },
        controlApp: {
          body: "<title>VGPR Control</title>",
          contentType: "text/html; charset=utf-8",
        },
      },
      async ({ controlApiUrl, controlAppUrl }) => {
        expect(
          probeExistingHttpServer({
            endpoints: [
              {
                expectedBodyFragment: "<title>VGPR Control</title>",
                url: controlAppUrl,
              },
              {
                expectedBodyFragment: '"app": "control-api"',
                url: controlApiUrl,
              },
            ],
          }),
        ).toBe(true);
      },
    );
  });

  it("refuses reuse when a listener on the port is not the expected VGPR app", async () => {
    await withServers(
      {
        controlApi: {
          body: '{"status": "ok"}',
          contentType: "application/json",
        },
        controlApp: {
          body: "<title>Another App</title>",
          contentType: "text/html; charset=utf-8",
        },
      },
      async ({ controlApiUrl, controlAppUrl }) => {
        expect(
          probeExistingHttpServer({
            endpoints: [
              {
                expectedBodyFragment: "<title>VGPR Control</title>",
                url: controlAppUrl,
              },
              {
                expectedBodyFragment: '"app": "control-api"',
                url: controlApiUrl,
              },
            ],
          }),
        ).toBe(false);
      },
    );
  });
});

async function withServers(
  responses: {
    controlApi: ServerResponseConfig;
    controlApp: ServerResponseConfig;
  },
  run: (urls: { controlApiUrl: string; controlAppUrl: string }) => Promise<void>,
) {
  const controlApp = await startServerProcess(responses.controlApp);
  const controlApi = await startServerProcess(responses.controlApi);

  try {
    await run({
      controlApiUrl: controlApi.url,
      controlAppUrl: controlApp.url,
    });
  } finally {
    await stopServerProcess(controlApp.child);
    await stopServerProcess(controlApi.child);
  }
}

interface ServerResponseConfig {
  body: string;
  contentType: string;
  statusCode?: number;
}

async function startServerProcess(config: ServerResponseConfig) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        import { createServer } from "node:http";

        const config = JSON.parse(process.argv[1]);
        const server = createServer((request, response) => {
          response.statusCode = config.statusCode ?? 200;
          response.setHeader("Content-Type", config.contentType);
          response.end(config.body);
        });

        process.on("SIGTERM", () => {
          server.close(() => process.exit(0));
        });

        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (address === null || typeof address === "string") {
            process.exit(1);
            return;
          }

          process.stdout.write(String(address.port));
        });
      `,
      JSON.stringify(config),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const port = await readPort(child);

  return {
    child,
    url: `http://127.0.0.1:${port}`,
  };
}

function readPort(child: ChildProcessWithoutNullStreams) {
  return new Promise<number>((resolve, reject) => {
    let resolved = false;
    let stderr = "";

    const fail = (error: Error) => {
      if (resolved) {
        return;
      }

      resolved = true;
      reject(error);
    };

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", fail);
    child.once("exit", (code) => {
      fail(new Error(`server process exited before it reported a port (code ${code}): ${stderr}`));
    });
    child.stdout.once("data", (chunk: Buffer | string) => {
      const port = Number.parseInt(chunk.toString(), 10);

      if (Number.isNaN(port)) {
        fail(new Error(`server process reported an invalid port: ${chunk.toString()}`));
        return;
      }

      resolved = true;
      resolve(port);
    });
  });
}

function stopServerProcess(child: ChildProcessWithoutNullStreams) {
  return new Promise<void>((resolve, reject) => {
    child.once("exit", (code, signal) => {
      if (code !== 0 && signal !== "SIGTERM") {
        reject(new Error(`server process exited unexpectedly (code ${code}, signal ${signal})`));
        return;
      }

      resolve();
    });
    child.kill("SIGTERM");
  });
}
