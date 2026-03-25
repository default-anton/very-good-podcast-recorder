import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import controlConfig from "../control/vite.config";
import sessionConfig from "../session/vite.config";

const testsDir = fileURLToPath(new URL(".", import.meta.url));

describe("vite config", () => {
  it("serves the control app from web/control", () => {
    expect(path.resolve(controlConfig.root ?? "")).toBe(path.resolve(testsDir, "../control"));
  });

  it("serves the session app from web/session", () => {
    expect(path.resolve(sessionConfig.root ?? "")).toBe(path.resolve(testsDir, "../session"));
  });
});
