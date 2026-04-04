import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { getLocalControlAppOrigin, getLocalSessionAppOrigin } from "../../web/shared/localRuntime";

const localControlAppOrigin = getLocalControlAppOrigin();
const localSessionAppOrigin = getLocalSessionAppOrigin();

test.use({ baseURL: localControlAppOrigin });

for (const viewport of [
  { height: 1024, name: "narrow tablet", width: 768 },
  { height: 900, name: "wide laptop", width: 1440 },
]) {
  test(`control shell keeps core actions visible at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await openRoomShell(page, `layout-proof-01-${viewport.width}`);

    await expect(page.getByText("Room status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();
    await expect(page.getByText("Seat status panel")).toBeVisible();

    await page.getByRole("button", { name: "Mute mic" }).click();
    await expect(page.getByRole("button", { name: "Unmute mic" })).toBeVisible();
    expect(await pageHasHorizontalOverflow(page)).toBe(false);
  });
}

test("rapid host mic toggles stay ordered against the latest session snapshot", async ({
  page,
}) => {
  const sessionId = "rapid-mic-proof-01";
  const sessionPath = `${localControlAppOrigin}/api/v1/sessions/${encodeURIComponent(sessionId)}`;

  await openRoomShell(page, sessionId);
  await page.evaluate(() => {
    const muteButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Mute mic"),
    );

    if (!(muteButton instanceof HTMLButtonElement)) {
      throw new Error("Mute mic button missing from control room shell.");
    }

    muteButton.click();
    muteButton.click();
  });

  const unmuteButton = page.getByRole("button", { name: "Unmute mic" });

  if ((await unmuteButton.count()) > 0) {
    await unmuteButton.click();
  } else {
    await page.getByRole("button", { name: "Mute mic" }).click();
  }

  await expect
    .poll(async () => {
      const response = await page.request.fetch(sessionPath);
      const body = (await response.json()) as {
        session: {
          seats: Array<{
            id: string;
            micMuted: boolean;
          }>;
        };
      };

      return body.session.seats.find((seat) => seat.id === "seat-host-01")?.micMuted ?? null;
    })
    .toBe(true);
});

test("setup shell keeps the operator seat pinned", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#seat-host-01-role")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove Anton Host" })).toBeDisabled();
});

test("setup fields roll back to canonical session state after a rejected edit", async ({
  page,
}) => {
  const sessionId = "setup-rollback-proof-01";
  const sessionPath = `${localControlAppOrigin}/api/v1/sessions/${encodeURIComponent(sessionId)}`;

  await page.goto(`/sessions/${sessionId}`);
  await expect(roleLinkUrl(page, "host")).toContainText(
    new RegExp(`^${escapeRegExp(localSessionAppOrigin)}/join/${sessionId}/host\\?k=local-host-`),
  );

  const activatedSession = await page.request.fetch(sessionPath, {
    data: { status: "active" },
    method: "PATCH",
  });

  expect(activatedSession.ok()).toBe(true);

  const sessionTitle = page.getByLabel("Session title");

  await sessionTitle.fill("This title should roll back");
  await page.getByRole("button", { name: "Draft" }).focus();

  await expect(sessionTitle).toHaveValue("Late Night Tape Check");
  await expect(sessionTitle).toBeDisabled();
  await expect(page.getByTestId("summary-row-host-run")).toContainText("active");
  await expect(page.getByText("This hosted run is already active or ended.")).toBeVisible();
});

test("copy link reports failure when clipboard access is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Document.prototype.execCommand = () => false;
  });

  await page.goto("/");
  await expect(roleLinkUrl(page, "host")).toContainText(
    new RegExp(
      `^${escapeRegExp(localSessionAppOrigin)}/join/amber-session-01/host\\?k=local-host-`,
    ),
  );
  await page.getByRole("button", { name: "Copy" }).first().click();

  await expect(
    page.getByText("host link copy failed — clipboard access is unavailable in this browser."),
  ).toBeVisible();
  await expect(page.getByText("host link copied to clipboard")).toHaveCount(0);
});

test("leave session only leaves the local operator and does not end the hosted run", async ({
  page,
}) => {
  await openRoomShell(page, "leave-proof-01");
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();

  await page.getByRole("button", { name: "Leave session" }).click();

  await expect(page).toHaveURL(/\/sessions\/leave-proof-01$/);
  await expect(page.getByText("This hosted run is already active or ended.")).toBeVisible();

  await page.getByRole("button", { name: "Open room shell" }).click();

  await expect(page).toHaveURL(/\/sessions\/leave-proof-01\/room$/);
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
});

test("host roster surfaces claim ownership problems", async ({ page }) => {
  await openRoomShell(page, "ownership-proof-01");

  await page.getByRole("button", { name: "Rejoin available" }).click();
  await expect(page.getByText("rejoin available").last()).toBeVisible();
  await expect(
    page.getByText("Seat can be reclaimed on a new browser without silent replacement."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Takeover required" }).click();
  await expect(page.getByText("takeover required").last()).toBeVisible();
  await expect(
    page.getByText("Another browser owns this seat. Explicit takeover is required."),
  ).toBeVisible();
});

test("stopping a healthy recording keeps roster state truthful", async ({ page }) => {
  await openRoomShell(page, "healthy-stop-01");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();

  const julesRow = seatStatusRow(page, "Jules Narrow-Layout-Name Test");

  await expect(page.getByText("Health healthy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish upload drain" })).toBeVisible();
  await expect(julesRow).toContainText("waiting");
  await expect(julesRow).toContainText("disconnected");
  await expect(julesRow).toContainText("synced");
  await expect(julesRow).not.toContainText("catching up");
});

test("terminal room states cover failed recording and ended hosted run", async ({ page }) => {
  await openRoomShell(page, "terminal-proof-01");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("button", { name: "Recording failed" }).click();

  await expect(page.getByText("Health failed")).toBeVisible();
  await expect(page.getByText("Recording failed").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "End hosted run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop recording" })).toHaveCount(0);

  await page.getByRole("button", { name: "End hosted run" }).click();
  await expect(page.getByText("Session ended")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate hosted run" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(page).toHaveURL(/\/sessions\/terminal-proof-01$/);
  await expect(page.getByTestId("summary-row-host-run")).toContainText("ended");
  await expect(page.getByRole("button", { name: "Open room shell" })).toBeDisabled();
});

test("session state follows client-side navigation to a different session id", async ({ page }) => {
  await page.goto("/sessions/route-a");
  await page.getByLabel("Session title").fill("Session A was edited");

  const routeAHostLink = roleLinkUrl(page, "host");

  await expect(routeAHostLink).toContainText(
    new RegExp(`^${escapeRegExp(localSessionAppOrigin)}/join/route-a/host\\?k=local-host-`),
  );

  await navigateWithinSpa(page, "/sessions/route-b");

  await expect(page).toHaveURL(/\/sessions\/route-b$/);
  await expect(roleLinkUrl(page, "host")).toContainText(
    new RegExp(`^${escapeRegExp(localSessionAppOrigin)}/join/route-b/host\\?k=local-host-`),
  );
  await expect(roleLinkUrl(page, "host")).not.toContainText("/join/route-a/host?");
  await expect(page.getByLabel("Session title")).toHaveValue("Late Night Tape Check");
  await expect(page.getByText("route-b", { exact: true })).toBeVisible();
});

async function openRoomShell(page: Page, sessionId: string) {
  await page.goto(`/sessions/${sessionId}`);

  await expect(page.getByRole("heading", { name: "Responsive session setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open room shell" })).toBeVisible();
  await expect(page.getByText("Stable role URLs")).toBeVisible();
  expect(await pageHasHorizontalOverflow(page)).toBe(false);

  await page.getByRole("button", { name: "Open room shell" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/room$`));
}

function seatStatusRow(page: Page, displayName: string) {
  return page.locator("li").filter({ hasText: displayName });
}

function roleLinkUrl(page: Page, role: "guest" | "host") {
  return page.getByTestId(`role-link-url-${role}`);
}

async function navigateWithinSpa(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function pageHasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
