import { stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assertFakeMediaFixtures,
  createHarnessChromiumLaunchOptions,
  createHarnessContextOptions,
  getFakeMediaFixturePaths,
} from "../fixtures/browser";

describe("browser fixtures", () => {
  it("resolves the committed fake media fixtures", async () => {
    const fixturePaths = await assertFakeMediaFixtures(getFakeMediaFixturePaths());

    await Promise.all(
      Object.values(fixturePaths).map(async (fixturePath) => {
        const file = await stat(fixturePath);

        expect(file.isFile()).toBe(true);
        expect(file.size).toBeGreaterThan(0);
      }),
    );
  });

  it("builds deterministic chromium launch arguments", () => {
    const launchOptions = createHarnessChromiumLaunchOptions();

    expect(launchOptions.args).toContain("--use-fake-ui-for-media-stream");
    expect(launchOptions.args).toContain("--use-fake-device-for-media-stream");
    expect(launchOptions.args).toContain("--allow-http-screen-capture");
    expect(
      launchOptions.args?.some((value) => value.startsWith("--use-file-for-fake-video-capture=")),
    ).toBe(true);
    expect(
      launchOptions.args?.some((value) => value.startsWith("--use-file-for-fake-audio-capture=")),
    ).toBe(true);
  });

  it("keeps the core browser permissions on every harness context", () => {
    expect(createHarnessContextOptions("http://127.0.0.1:5174")).toEqual({
      baseURL: "http://127.0.0.1:5174",
      permissions: ["camera", "clipboard-read", "clipboard-write", "microphone"],
    });
  });
});
