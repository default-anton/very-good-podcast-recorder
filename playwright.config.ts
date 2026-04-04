import { spawnSync } from "node:child_process";

import { defineConfig } from "@playwright/test";

import {
  getLocalControlApiOrigin,
  getLocalControlAppOrigin,
  getLocalSessionAppOrigin,
  localRuntimePorts,
} from "./web/shared/localRuntime";

interface ExistingHttpEndpointProbe {
  expectedBodyFragment: string;
  url: string;
}

export interface ExistingHttpServerProbe {
  endpoints: ExistingHttpEndpointProbe[];
}

export interface PlaywrightServerReuseState {
  controlApp: boolean;
  sessionApp: boolean;
}

export function probeExistingHttpServer(probe: ExistingHttpServerProbe) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const probe = JSON.parse(process.argv[1]);

        async function main() {
          for (const endpoint of probe.endpoints) {
            const response = await fetch(endpoint.url, { signal: AbortSignal.timeout(1500) }).catch(
              () => null,
            );
            if (response === null || !response.ok) {
              process.exit(1);
            }

            const body = await response.text();
            if (!body.includes(endpoint.expectedBodyFragment)) {
              process.exit(1);
            }
          }

          process.exit(0);
        }

        await main();
      `,
      JSON.stringify(probe),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  return result.status === 0;
}

export function detectReusablePlaywrightServers(): PlaywrightServerReuseState {
  return {
    controlApp: probeExistingHttpServer({
      endpoints: [
        {
          expectedBodyFragment: "<title>VGPR Control</title>",
          url: `${getLocalControlAppOrigin()}/`,
        },
        {
          expectedBodyFragment: '"app": "control-api"',
          url: `${getLocalControlApiOrigin()}/api/healthz`,
        },
      ],
    }),
    sessionApp: probeExistingHttpServer({
      endpoints: [
        {
          expectedBodyFragment: "<title>VGPR Session</title>",
          url: `${getLocalSessionAppOrigin()}/`,
        },
      ],
    }),
  };
}

export function createPlaywrightWebServers(reuseState: PlaywrightServerReuseState) {
  return [
    {
      command: "mise exec -- pnpm exec vite --config web/control/vite.config.ts",
      port: localRuntimePorts.controlApp,
      reuseExistingServer: reuseState.controlApp,
    },
    {
      command: "mise exec -- pnpm exec vite --config web/session/vite.config.ts",
      port: localRuntimePorts.sessionApp,
      reuseExistingServer: reuseState.sessionApp,
    },
  ];
}

const playwrightServerReuseState = detectReusablePlaywrightServers();

export default defineConfig({
  reporter: "line",
  testDir: "e2e/scenarios",
  use: {
    headless: true,
  },
  webServer: createPlaywrightWebServers(playwrightServerReuseState),
});
