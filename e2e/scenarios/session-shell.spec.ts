import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { buildJoinHref, buildJoinRoomPath } from "../../web/shared/joinLinks";
import { getLocalControlAppOrigin, getLocalSessionAppOrigin } from "../../web/shared/localRuntime";

const localControlAppOrigin = getLocalControlAppOrigin();
const localSessionAppOrigin = getLocalSessionAppOrigin();

test.use({ baseURL: localSessionAppOrigin });

for (const viewport of [
  { height: 1024, name: "narrow tablet", width: 768 },
  { height: 900, name: "wide laptop", width: 1440 },
]) {
  test(`join shell keeps claim, recovery, and preview steps visible at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/");

    await expect(page).toHaveURL(/\/join\/amber-session-01\/guest\?k=local-guest-[^&]+$/);
    await expect(page.getByRole("heading", { name: "Responsive join flow" })).toBeVisible();
    await expect(page.getByText("Role link is valid")).toBeVisible();
    await expect(page.getByText("Choose your seat")).toBeVisible();

    await page.getByRole("button", { name: "Claim Mara Chen" }).click();
    await expect(page.getByRole("heading", { name: "Minimal device preview" })).toBeVisible();

    await page.getByRole("button", { name: "Back to seat picker" }).click();
    await page.getByRole("button", { name: "Recovery needed" }).click();
    await page.getByRole("button", { name: "Recover Mara Chen" }).click();
    await expect(page.getByRole("heading", { name: "Minimal device preview" })).toBeVisible();

    await page.getByRole("button", { name: "Back to seat picker" }).click();
    await expect(page.getByRole("button", { name: "Continue as Mara Chen" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue as Jules Narrow-Layout-Name Test" }),
    ).toHaveCount(0);
    expect(await pageHasHorizontalOverflow(page)).toBe(false);
  });

  test(`guest room shell keeps core actions visible at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await openGuestRoom(page, "guest-layout-proof-01");

    await expect(page.getByText("Session status")).toBeVisible();
    await expect(page.getByText("Local seat")).toBeVisible();
    await expect(page.getByText("Local media controls")).toBeVisible();

    await page.getByRole("button", { name: "Mute mic" }).click();
    await expect(page.getByRole("button", { name: "Unmute mic" })).toBeVisible();
    expect(await pageHasHorizontalOverflow(page)).toBe(false);
  });

  test(`host room shell keeps recording controls and reconnect state visible at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await openHostRoom(page, "host-layout-proof-01");

    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();
    await expect(page.getByText("Seat status panel")).toBeVisible();

    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();

    await page.getByRole("button", { name: "Leave session" }).click();
    await expect(page).toHaveURL(/\/join\/host-layout-proof-01\/host(\?k=.*)?$/);
    await expect(page.getByRole("button", { name: "Reclaim Anton Host" })).toBeVisible();

    const antonRow = seatRow(page, "Anton Host");
    await expect(antonRow).toContainText("owned, rejoin needed");
    await expect(antonRow).toContainText("issue");
    await expect(antonRow).toContainText("catching up");
    expect(await pageHasHorizontalOverflow(page)).toBe(false);
  });
}

test("ended role links stay invalid in the session app", async ({ page }) => {
  const sessionId = "ended-link-proof-01";
  const sessionPath = `${localControlAppOrigin}/api/v1/sessions/${encodeURIComponent(sessionId)}`;
  const provisionedSession = await page.request.fetch(sessionPath, {
    headers: {
      Accept: "application/json",
    },
    method: "PUT",
  });
  const provisionedBody = (await provisionedSession.json()) as {
    session: {
      links: {
        guest: string;
      };
    };
  };

  const activatedSession = await page.request.fetch(sessionPath, {
    data: { status: "active" },
    method: "PATCH",
  });
  const failedSession = await page.request.fetch(sessionPath, {
    data: { recordingHealth: "failed", recordingPhase: "failed" },
    method: "PATCH",
  });
  const endedSession = await page.request.fetch(sessionPath, {
    data: { status: "ended" },
    method: "PATCH",
  });

  expect(activatedSession.ok()).toBe(true);
  expect(failedSession.ok()).toBe(true);
  expect(endedSession.ok()).toBe(true);

  await page.goto(provisionedBody.session.links.guest);

  await expect(page.getByRole("heading", { name: "This role link is not valid" })).toBeVisible();
  await expect(
    page.getByText(
      "Local session ended-link-proof-01 is ended. Only ready or active sessions can be bootstrapped.",
    ),
  ).toBeVisible();
});

test("join flow stays read-only while this browser is already in the room", async ({ page }) => {
  await openGuestRoom(page, "room-lock-proof-01");

  await page.getByRole("button", { name: "Back to join flow" }).click();

  await expect(page.getByText("This browser is already in the room as Mara Chen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as Mara Chen" })).toBeDisabled();
});

test("takeover stays explicit before the preview opens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explicit takeover" }).click();
  await page.getByRole("button", { name: "Review takeover for Mara Chen" }).click();

  await expect(page.getByRole("dialog")).toContainText("Take over Mara Chen?");
  await expect(page.getByText("There is never a silent two-owner window.")).toBeVisible();

  await page.getByRole("button", { name: "Take over seat" }).click();
  await expect(page.getByRole("heading", { name: "Minimal device preview" })).toBeVisible();
});

async function openGuestRoom(page: Page, sessionId: string) {
  await page.goto(await provisionRoleLink(page, sessionId, "guest"));

  await expect(page.getByRole("heading", { name: "Responsive join flow" })).toBeVisible();
  await page.getByRole("button", { name: "Claim Mara Chen" }).click();
  await page.getByRole("button", { name: "Join room shell" }).click();

  await expect(page).toHaveURL(new RegExp(`${buildJoinRoomPath(sessionId, "guest")}(\\?k=.*)?$`));
}

async function openHostRoom(page: Page, sessionId: string) {
  await page.goto(await provisionRoleLink(page, sessionId, "host"));

  await expect(page.getByRole("heading", { name: "Responsive join flow" })).toBeVisible();
  await page.getByRole("button", { name: "Claim Anton Host" }).click();
  await page.getByRole("button", { name: "Join room shell" }).click();

  await expect(page).toHaveURL(new RegExp(`${buildJoinRoomPath(sessionId, "host")}(\\?k=.*)?$`));
}

function seatRow(page: Page, displayName: string) {
  return page.locator("li").filter({ hasText: displayName });
}

async function provisionRoleLink(page: Page, sessionId: string, role: "guest" | "host") {
  const response = await page.request.fetch(
    `${localControlAppOrigin}/api/v1/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Accept: "application/json",
      },
      method: "PUT",
    },
  );
  const body = (await response.json()) as {
    session: {
      links: {
        guest: string;
        host: string;
      };
    };
  };

  expect(response.ok()).toBe(true);

  const joinKey = new URL(body.session.links[role]).searchParams.get("k");

  if (joinKey === null || joinKey.length === 0) {
    throw new Error(`Missing ${role} join key for ${sessionId}.`);
  }

  return buildJoinHref(sessionId, role, joinKey);
}

async function pageHasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}
