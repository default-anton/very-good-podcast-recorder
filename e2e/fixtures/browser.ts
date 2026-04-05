import path from "node:path";
import { access } from "node:fs/promises";

import type { BrowserContextOptions, BrowserType, LaunchOptions } from "@playwright/test";

export interface FakeMediaFixturePaths {
  cameraY4m: string;
  micWav: string;
  screenShareY4m: string;
}

export interface HarnessBrowserLaunchOptions {
  cwd?: string;
  extraArgs?: string[];
}

export interface LaunchHarnessBrowserOptions {
  baseURL?: string;
  contextOptions?: BrowserContextOptions;
  cwd?: string;
  launchOptions?: Omit<LaunchOptions, "args"> & { args?: string[] };
}

export function getFakeMediaFixturePaths(cwd = process.cwd()): FakeMediaFixturePaths {
  const root = path.resolve(cwd, "e2e/fixtures/fake-media");

  return {
    cameraY4m: path.join(root, "camera.y4m"),
    micWav: path.join(root, "mic.wav"),
    screenShareY4m: path.join(root, "screen-share.y4m"),
  };
}

export async function assertFakeMediaFixtures(paths = getFakeMediaFixturePaths()) {
  await Promise.all(Object.values(paths).map((fixturePath) => access(fixturePath)));
  return paths;
}

export function createHarnessChromiumLaunchOptions(
  options: HarnessBrowserLaunchOptions = {},
): LaunchOptions {
  const paths = getFakeMediaFixturePaths(options.cwd);

  return {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--allow-http-screen-capture",
      `--use-file-for-fake-video-capture=${paths.cameraY4m}`,
      `--use-file-for-fake-audio-capture=${paths.micWav}`,
      ...(options.extraArgs ?? []),
    ],
  };
}

export function createHarnessContextOptions(
  baseURL?: string,
  contextOptions: BrowserContextOptions = {},
): BrowserContextOptions {
  return {
    ...contextOptions,
    baseURL: contextOptions.baseURL ?? baseURL,
    permissions: mergePermissions(
      ["camera", "clipboard-read", "clipboard-write", "microphone"],
      contextOptions.permissions,
    ),
  };
}

export async function launchHarnessBrowser(
  browserType: BrowserType,
  options: LaunchHarnessBrowserOptions = {},
) {
  await assertFakeMediaFixtures(getFakeMediaFixturePaths(options.cwd));

  const launchOptions = createHarnessChromiumLaunchOptions({
    cwd: options.cwd,
    extraArgs: options.launchOptions?.args,
  });
  const browser = await browserType.launch({
    ...options.launchOptions,
    args: launchOptions.args,
  });
  const context = await browser.newContext(
    createHarnessContextOptions(options.baseURL, options.contextOptions),
  );

  return { browser, context };
}

function mergePermissions(
  defaults: NonNullable<BrowserContextOptions["permissions"]>,
  provided: BrowserContextOptions["permissions"],
) {
  return Array.from(new Set([...(provided ?? []), ...defaults]));
}
