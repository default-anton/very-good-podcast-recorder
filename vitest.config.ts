import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["web/tests/**/*.spec.ts", "e2e/tests/**/*.spec.ts"],
    reporters: ["dot"],
  },
});
