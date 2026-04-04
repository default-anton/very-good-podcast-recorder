import { defineConfig } from "@playwright/test";

import { localRuntimePorts } from "./web/shared/localRuntime";

export default defineConfig({
  reporter: "line",
  testDir: "e2e/scenarios",
  use: {
    headless: true,
  },
  webServer: [
    {
      command: "mise exec -- pnpm exec vite --config web/control/vite.config.ts",
      port: localRuntimePorts.controlApp,
      reuseExistingServer: false,
    },
    {
      command: "mise exec -- pnpm exec vite --config web/session/vite.config.ts",
      port: localRuntimePorts.sessionApp,
      reuseExistingServer: false,
    },
  ],
});
