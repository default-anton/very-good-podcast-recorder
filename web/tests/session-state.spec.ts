import { describe, expect, it } from "vitest";

import {
  createInitialAppState,
  presentSession,
  sessionAppReducer,
} from "../session/src/app/lib/sessionState";
import type { SessionBootstrapResponse } from "../session/src/app/lib/query";
import type { JoinRole, SessionSeat } from "../session/src/app/lib/types";

describe("session shell state", () => {
  it("recover preset clears stale joined state from seats that become available", () => {
    const state = reduce(createState("guest"), { preset: "recover", type: "apply-join-preset" });
    const session = presentSession(state);
    const jules = seat(session.seats, "seat-guest-03");

    expect(jules.claimState).toBe("unclaimed");
    expect(jules.pickerState).toBe("available");
    expect(jules.joined).toBe(false);
    expect(jules.liveCallStatus).toBe("disconnected");
  });

  it("takeover preset clears stale joined state from the seat that becomes available", () => {
    const state = reduce(createState("guest"), { preset: "takeover", type: "apply-join-preset" });
    const session = presentSession(state);
    const mara = seat(session.seats, "seat-guest-02");
    const jules = seat(session.seats, "seat-guest-03");

    expect(mara.pickerState).toBe("in_use");
    expect(mara.joined).toBe(true);
    expect(jules.claimState).toBe("unclaimed");
    expect(jules.pickerState).toBe("available");
    expect(jules.joined).toBe(false);
  });

  it("does not allow claiming another seat while this browser is already joined", () => {
    const joinedState = reduce(
      createState("guest"),
      { seatId: "seat-guest-02", type: "choose-seat" },
      { type: "join-room" },
    );

    const stateAfterSeatSwitchAttempt = reduce(joinedState, {
      seatId: "seat-guest-04",
      type: "choose-seat",
    });
    const session = presentSession(stateAfterSeatSwitchAttempt);
    const mara = seat(session.seats, "seat-guest-02");
    const dana = seat(session.seats, "seat-guest-04");

    expect(session.ownedSeatId).toBe("seat-guest-02");
    expect(session.joinedSeatId).toBe("seat-guest-02");
    expect(session.selectedSeatId).toBe("seat-guest-02");
    expect(mara.pickerState).toBe("you");
    expect(mara.joined).toBe(true);
    expect(dana.pickerState).toBe("rejoin_available");
    expect(dana.joined).toBe(false);
  });

  it("hydrates the session shell from bootstrap data and keeps the fetched roster", () => {
    const state = createInitialAppState({
      bootstrap: {
        runtime: {
          baseUrl: "http://127.0.0.1:8081",
          liveKitUrl: "ws://127.0.0.1:7880",
          roomName: "bootstrap-shell-proof-01",
          state: "ready",
          turn: null,
        },
        seats: [
          {
            displayName: "Anton Host",
            id: "seat-host-01",
            label: "Channel 01",
            role: "host",
          },
          {
            displayName: "Mara Chen",
            id: "seat-guest-02",
            label: "Channel 02",
            role: "guest",
          },
          {
            displayName: "Jules Narrow-Layout-Name Test",
            id: "seat-guest-03",
            label: "Channel 03",
            role: "guest",
          },
        ],
        session: {
          id: "bootstrap-shell-proof-01",
          role: "guest",
          status: "ready",
          title: "Bootstrap title",
        },
      } satisfies SessionBootstrapResponse,
      role: "guest",
      sessionId: "ignored-by-bootstrap",
    });
    const freshSession = presentSession(state);
    const recoverSession = presentSession(
      sessionAppReducer(state, { preset: "recover", type: "apply-join-preset" }),
    );

    expect(freshSession.id).toBe("bootstrap-shell-proof-01");
    expect(freshSession.title).toBe("Bootstrap title");
    expect(
      freshSession.seats.map(({ displayName, id, role }) => ({ displayName, id, role })),
    ).toEqual([
      { displayName: "Anton Host", id: "seat-host-01", role: "host" },
      { displayName: "Mara Chen", id: "seat-guest-02", role: "guest" },
      {
        displayName: "Jules Narrow-Layout-Name Test",
        id: "seat-guest-03",
        role: "guest",
      },
    ]);
    expect(seat(recoverSession.seats, "seat-guest-02").pickerState).toBe("rejoin_available");
    expect(seat(recoverSession.seats, "seat-guest-03").pickerState).toBe("available");
  });

  it("keeps failure state explicit after leaving a failed recording run", () => {
    const state = reduce(
      createState("host"),
      { seatId: "seat-host-01", type: "choose-seat" },
      { type: "join-room" },
      { type: "start-recording" },
      { type: "fail-recording" },
      { type: "leave-room" },
    );
    const session = presentSession(state);
    const anton = seat(session.seats, "seat-host-01");

    expect(session.recordingPhase).toBe("failed");
    expect(session.joinedSeatId).toBe(null);
    expect(anton.pickerState).toBe("you");
    expect(anton.ownershipStatus).toBe("rejoin_available");
    expect(anton.localCaptureStatus).toBe("issue");
    expect(anton.uploadStatus).toBe("failed");
  });
});

function createState(role: JoinRole) {
  return createInitialAppState({ role, sessionId: `${role}-state-proof-01` });
}

function reduce(
  state: ReturnType<typeof createState>,
  ...actions: Parameters<typeof sessionAppReducer>[1][]
) {
  return actions.reduce(sessionAppReducer, state);
}

function seat(seats: SessionSeat[], seatId: string) {
  const match = seats.find((currentSeat) => currentSeat.id === seatId);

  if (match === undefined) {
    throw new Error(`Seat ${seatId} was not found in the session state test.`);
  }

  return match;
}
