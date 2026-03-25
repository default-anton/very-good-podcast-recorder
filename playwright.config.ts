import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e/scenarios",
  reporter: "line",
  use: {
    headless: true,
  },
});
