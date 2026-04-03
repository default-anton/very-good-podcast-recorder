import { describe, expect, it } from "vitest";

import {
  createSessionApiPath,
  createSessionSeatApiPath,
  createSessionSeatsApiPath,
} from "../control/src/app/lib/api";

import { jsonRequest, provisionLocalSession, requestControl } from "./control-api.helpers";

describe("control-plane local API seats", () => {
  it("wires seat CRUD through the local store without rotating role links", async () => {
    const sessionId = "seat-crud-proof-01";
    const sessionPath = createSessionApiPath(sessionId);
    const seatsPath = createSessionSeatsApiPath(sessionId);
    const provisionedSession = await provisionLocalSession(sessionId);
    const roleLinks = provisionedSession.body.session.links;

    const createdSeat = await requestControl(seatsPath, { method: "POST" });
    const renamedSeat = await requestControl(
      createSessionSeatApiPath(sessionId, "seat-guest-03"),
      jsonRequest("PATCH", {
        displayName: "Jules Host",
        role: "host",
      }),
    );
    const renamedNewSeat = await requestControl(
      createSessionSeatApiPath(sessionId, "seat-guest-04"),
      jsonRequest("PATCH", {
        displayName: "Dana White",
      }),
    );
    const deletedSeat = await requestControl(createSessionSeatApiPath(sessionId, "seat-guest-02"), {
      method: "DELETE",
    });
    const fetchedSession = await requestControl(sessionPath);
    const fetchedBody = await fetchedSession.json();

    expect(createdSeat.status).toBe(200);
    expect(renamedSeat.status).toBe(200);
    expect(renamedNewSeat.status).toBe(200);
    expect(deletedSeat.status).toBe(200);
    expect(fetchedSession.status).toBe(200);
    expect(fetchedBody.session.links).toEqual(roleLinks);
    expect(
      fetchedBody.session.seats.map(
        ({ displayName, id, role }: { displayName: string; id: string; role: string }) => ({
          displayName,
          id,
          role,
        }),
      ),
    ).toEqual([
      { displayName: "Anton Host", id: "seat-host-01", role: "host" },
      { displayName: "Jules Host", id: "seat-guest-03", role: "host" },
      { displayName: "Dana White", id: "seat-guest-04", role: "guest" },
    ]);
  });

  it("freezes roster edits after activation but allows runtime seat patches until ended", async () => {
    const sessionId = "seat-lock-proof-01";

    await provisionLocalSession(sessionId);
    await requestControl(
      createSessionApiPath(sessionId),
      jsonRequest("PATCH", {
        status: "active",
      }),
    );

    const blockedSeatCreate = await requestControl(createSessionSeatsApiPath(sessionId), {
      method: "POST",
    });
    const blockedSeatRename = await requestControl(
      createSessionSeatApiPath(sessionId, "seat-guest-03"),
      jsonRequest("PATCH", {
        displayName: "Locked While Active",
      }),
    );
    const blockedSeatDelete = await requestControl(
      createSessionSeatApiPath(sessionId, "seat-guest-03"),
      {
        method: "DELETE",
      },
    );
    const activeRuntimeSeatPatch = await requestControl(
      createSessionSeatApiPath(sessionId, "seat-host-01"),
      jsonRequest("PATCH", {
        micMuted: true,
      }),
    );
    const failedSession = await requestControl(
      createSessionApiPath(sessionId),
      jsonRequest("PATCH", {
        recordingHealth: "failed",
        recordingPhase: "failed",
      }),
    );
    const endedSession = await requestControl(
      createSessionApiPath(sessionId),
      jsonRequest("PATCH", {
        status: "ended",
      }),
    );
    const blockedEndedSeatPatch = await requestControl(
      createSessionSeatApiPath(sessionId, "seat-host-01"),
      jsonRequest("PATCH", {
        joined: false,
      }),
    );

    expect(blockedSeatCreate.status).toBe(409);
    expect(await blockedSeatCreate.json()).toEqual({
      error: {
        code: "session_roster_locked",
        message:
          "Roster edits are locked while local session seat-lock-proof-01 is active. Create a new session for a different active or ended roster.",
      },
    });
    expect(blockedSeatRename.status).toBe(409);
    expect(blockedSeatDelete.status).toBe(409);
    expect(activeRuntimeSeatPatch.status).toBe(200);
    expect((await activeRuntimeSeatPatch.json()).session.seats[0].micMuted).toBe(true);
    expect(failedSession.status).toBe(200);
    expect(endedSession.status).toBe(200);
    expect(blockedEndedSeatPatch.status).toBe(409);
    expect(await blockedEndedSeatPatch.json()).toEqual({
      error: {
        code: "session_ended",
        message:
          "Local session seat-lock-proof-01 is ended. This session is history-only and can no longer be edited.",
      },
    });
  });
});
