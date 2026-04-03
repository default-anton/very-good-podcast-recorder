import type {
  ControlSessionResponse,
  SessionRuntimeDescriptor,
  UpdateControlSeatInput,
  UpdateControlSessionInput,
} from "../app/lib/api";
import { createGuestSeat, createInitialSession } from "../app/lib/session-fixtures";
import { type SessionJoinKeys, withSessionLinks } from "../app/lib/session-links";
import {
  normalizeControlSession,
  patchSessionSeat,
  removeSessionSeat,
} from "../app/lib/session-model";
import type { ControlSession } from "../app/lib/types";

import { createLocalJoinKeys, type JoinLinkRole, hasValidLocalJoinKey } from "./join-links";

interface StoredSessionRecord {
  joinKeys: SessionJoinKeys;
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
  return {
    runtime: record.runtime,
    session: withSessionLinks(record.session, resolveJoinAppOrigin(origin), record.joinKeys),
  };
}

function createStoredSessionRecord(sessionId: string): StoredSessionRecord {
  return {
    joinKeys: createLocalJoinKeys(),
    runtime: createLocalRuntimeDescriptor(sessionId),
    session: normalizeControlSession(createInitialSession(sessionId)),
  };
}

function createLocalRuntimeDescriptor(sessionId: string): SessionRuntimeDescriptor {
  return {
    baseUrl: "http://127.0.0.1:8081",
    liveKitUrl: "ws://127.0.0.1:7880",
    roomName: sessionId,
    state: "ready",
    turn: null,
  };
}

function resolveJoinAppOrigin(controlOrigin: string) {
  const url = new URL(controlOrigin);

  if (url.hostname === "127.0.0.1" && url.port === "5173") {
    return "http://127.0.0.1:5174";
  }

  if (url.hostname === "localhost" && url.port === "5173") {
    return "http://localhost:5174";
  }

  return controlOrigin;
}
