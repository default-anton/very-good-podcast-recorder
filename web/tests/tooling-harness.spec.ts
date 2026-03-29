import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("repo landing zones", () => {
  it("keeps the quality scripts in place", () => {
    for (const relativePath of [
      "docs/epics",
      "scripts/check",
      "scripts/format",
      "scripts/lint",
      "scripts/test",
      "scripts/typecheck",
    ]) {
      expect(existsSync(path.join(repoRoot, relativePath))).toBe(true);
    }
  });

  it("keeps the first control app shell in place", () => {
    for (const relativePath of [
      "web/control/index.html",
      "web/control/src/app/App.tsx",
      "web/control/src/app/components/RecordingStatusBar.tsx",
      "web/control/src/app/components/SeatList.tsx",
      "web/control/src/app/components/SessionForm.tsx",
      "web/control/src/app/routes/SessionRoomPage.tsx",
      "web/control/src/app/routes/SessionSetupPage.tsx",
      "web/control/src/app/lib/types.ts",
      "web/control/src/main.tsx",
      "web/control/src/styles.css",
    ]) {
      expect(existsSync(path.join(repoRoot, relativePath))).toBe(true);
    }
  });

  it("keeps later implementation trees absent", () => {
    for (const relativePath of [
      "cmd",
      "db",
      "deploy",
      "internal/artifacts",
      "internal/auth",
      "internal/controlplane",
      "internal/localstack",
      "internal/logging",
      "internal/provisioning",
      "internal/recordings",
      "internal/sessions",
      "internal/uploads",
      "internal/vgpr",
      "testdata",
      "web/session/index.html",
      "web/session/src",
    ]) {
      expect(existsSync(path.join(repoRoot, relativePath))).toBe(false);
    }
  });
});
