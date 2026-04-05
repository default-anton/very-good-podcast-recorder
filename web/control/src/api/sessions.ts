import {
  type ControlSession,
  type ControlSessionResponse,
  type SessionJoinKeys,
  type SessionRuntimeDescriptor,
  type UpdateControlSeatInput,
  type UpdateControlSessionInput,
  withSessionLinks,
} from "../../../shared/sessionContract";
import { createGuestSeat, createInitialSession } from "../app/lib/session-fixtures";
import {
  createLocalRuntimeTopology,
  resolveLocalSessionAppOrigin,
} from "../../../shared/localRuntime";
import { loadLocalBootstrapConfig } from "../../../shared/localBootstrap";
import {
  normalizeControlSession,
  patchSessionSeat,
  removeSessionSeat,
} from "../app/lib/session-model";

import { createLocalJoinKeys, type JoinLinkRole, hasValidLocalJoinKey } from "./join-links";

interface StoredSessionRecord {
  joinKeys: SessionJoinKeys;
  localRuntimeBootstrapBound: boolean;
  runtime: SessionRuntimeDescriptor;
  session: ControlSession;
}

class LocalSessionStore {
  #sessions = new Map<string, StoredSessionRecord>();

  create(sessionId: string) {
    const existing = this.#sessions.get(sessionId);

    if (existing !== undefined) {
      return existing;
    }

    const created = createStoredSessionRecord(sessionId);
    this.#sessions.set(sessionId, created);
    return created;
  }

  createSeat(sessionId: string) {
    const record = this.get(sessionId);

    if (record === null) {
      return null;
    }

    if (record.session.seats.length >= 8) {
      return record;
    }

    const seatNumber = record.session.nextSeatNumber;

    record.session = normalizeControlSession({
      ...record.session,
      nextSeatNumber: seatNumber + 1,
      seats: [...record.session.seats, createGuestSeat(seatNumber)],
    });

    return record;
  }

  deleteSeat(sessionId: string, seatId: string) {
    const record = this.get(sessionId);

    if (record === null) {
      return null;
    }

    const seat = record.session.seats.find((currentSeat) => currentSeat.id === seatId);

    if (seat === undefined) {
      return null;
    }

    record.session = normalizeControlSession(removeSessionSeat(record.session, seatId));
    return record;
  }

  get(sessionId: string) {
    return this.#sessions.get(sessionId) ?? null;
  }

  updateSeat(sessionId: string, seatId: string, patch: UpdateControlSeatInput) {
    const record = this.get(sessionId);

    if (record === null) {
      return null;
    }

    const seat = record.session.seats.find((currentSeat) => currentSeat.id === seatId);

    if (seat === undefined) {
      return null;
    }

    record.session = normalizeControlSession(patchSessionSeat(record.session, seatId, patch));
    return record;
  }

  updateSession(sessionId: string, patch: UpdateControlSessionInput) {
    const record = this.get(sessionId);

    if (record === null) {
      return null;
    }

    record.session = normalizeControlSession({
      ...record.session,
      ...patch,
    });

    return record;
  }
}

const localSessionStore = new LocalSessionStore();

export function getStoredSessionRecord(sessionId: string) {
  return localSessionStore.get(sessionId);
}

export function ensureStoredSessionRecord(sessionId: string) {
  return localSessionStore.create(sessionId);
}

export function createStoredSeatResponse(sessionId: string, origin: string) {
  const record = localSessionStore.createSeat(sessionId);

  if (record === null) {
    return null;
  }

  return toControlSessionResponse(record, origin);
}

export function updateStoredSeatResponse(
  sessionId: string,
  seatId: string,
  origin: string,
  patch: UpdateControlSeatInput,
) {
  const record = localSessionStore.updateSeat(sessionId, seatId, patch);

  if (record === null) {
    return null;
  }

  return toControlSessionResponse(record, origin);
}

export function deleteStoredSeatResponse(sessionId: string, seatId: string, origin: string) {
  const record = localSessionStore.deleteSeat(sessionId, seatId);

  if (record === null) {
    return null;
  }

  return toControlSessionResponse(record, origin);
}

export function createControlSessionResponse(
  sessionId: string,
  origin: string,
): ControlSessionResponse | null {
  const record = getStoredSessionRecord(sessionId);

  if (record === null) {
    return null;
  }

  return toControlSessionResponse(record, origin);
}

export function ensureControlSessionResponse(
  sessionId: string,
  origin: string,
): ControlSessionResponse {
  return toControlSessionResponse(ensureStoredSessionRecord(sessionId), origin);
}

export function updateControlSessionResponse(
  sessionId: string,
  origin: string,
  patch: UpdateControlSessionInput,
) {
  const record = localSessionStore.updateSession(sessionId, patch);

  if (record === null) {
    return null;
  }

  return toControlSessionResponse(record, origin);
}

export function hasStoredJoinKey(sessionId: string, role: JoinLinkRole, joinKey: string | null) {
  const record = getStoredSessionRecord(sessionId);

  if (record === null) {
    return false;
  }

  return hasValidLocalJoinKey(record.joinKeys, role, joinKey);
}

function toControlSessionResponse(
  record: StoredSessionRecord,
  origin: string,
): ControlSessionResponse {
  const topology = createLocalRuntimeTopology(new URL(origin).hostname);

  return {
    runtime: {
      ...record.runtime,
      baseUrl: topology.sessiondBaseUrl,
      liveKitUrl: topology.liveKitUrl,
    },
    session: withSessionLinks(
      record.session,
      resolveLocalSessionAppOrigin(origin),
      record.joinKeys,
    ),
  };
}

function createStoredSessionRecord(sessionId: string): StoredSessionRecord {
  const bootstrap = loadLocalBootstrapConfig();

  if (bootstrap.sessionId === sessionId) {
    return {
      joinKeys: { ...bootstrap.joinKeys },
      localRuntimeBootstrapBound: true,
      runtime: createLocalRuntimeDescriptor(sessionId),
      session: normalizeControlSession(createBootstrapBoundSession(sessionId, bootstrap)),
    };
  }

  return {
    joinKeys: createLocalJoinKeys(),
    localRuntimeBootstrapBound: false,
    runtime: createLocalRuntimeDescriptor(sessionId),
    session: normalizeControlSession(createInitialSession(sessionId)),
  };
}

function createBootstrapBoundSession(
  sessionId: string,
  bootstrap: ReturnType<typeof loadLocalBootstrapConfig>,
): ControlSession {
  const session = createInitialSession(sessionId);
  const defaultSeats = new Map(session.seats.map((seat) => [seat.id, seat]));
  const defaultHostSeat = session.seats.find((seat) => seat.role === "host") ?? session.seats[0];

  return {
    ...session,
    nextSeatNumber: bootstrap.seats.length + 1,
    seats: bootstrap.seats.map((seat, index) => {
      const fallback = seat.role === "host" ? defaultHostSeat : createGuestSeat(index + 1);
      const template = defaultSeats.get(seat.id) ?? fallback;

      return {
        ...template,
        displayName: seat.displayName,
        id: seat.id,
        role: seat.role,
      };
    }),
  };
}

function createLocalRuntimeDescriptor(
  sessionId: string,
  hostname?: string | null,
): SessionRuntimeDescriptor {
  const topology = createLocalRuntimeTopology(hostname);

  return {
    baseUrl: topology.sessiondBaseUrl,
    liveKitUrl: topology.liveKitUrl,
    roomName: sessionId,
    state: "ready",
    turn: null,
  };
}
