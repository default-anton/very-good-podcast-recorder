import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: "line",
  testDir: "e2e/scenarios",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
  },
  webServer: {
    command: "mise exec -- pnpm exec vite --config web/control/vite.config.ts",
    port: 5173,
    reuseExistingServer: false,
  },
});
