import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: "line",
  testDir: "e2e/scenarios",
  use: {
    headless: true,
  },
  webServer: [
    {
      command: "mise exec -- pnpm exec vite --config web/control/vite.config.ts",
      port: 5173,
      reuseExistingServer: false,
    },
    {
      command: "mise exec -- pnpm exec vite --config web/session/vite.config.ts",
      port: 5174,
      reuseExistingServer: false,
    },
  ],
});
