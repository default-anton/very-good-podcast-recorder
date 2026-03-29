import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("harness-only pivot", () => {
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

  it("keeps retired implementation trees absent", () => {
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
      "web/control/index.html",
      "web/control/src",
      "web/session/index.html",
      "web/session/src",
    ]) {
      expect(existsSync(path.join(repoRoot, relativePath))).toBe(false);
    }
  });
});
