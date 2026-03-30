import type { ControlSessionResponse, SessionRuntimeDescriptor } from "../app/lib/api";
import { createInitialSession, type SessionJoinKeys, withSessionLinks } from "../app/lib/state";
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

  get(sessionId: string) {
    return this.#sessions.get(sessionId) ?? null;
  }
}

const localSessionStore = new LocalSessionStore();

export function getStoredSessionRecord(sessionId: string) {
  return localSessionStore.get(sessionId);
}

export function ensureStoredSessionRecord(sessionId: string) {
  return localSessionStore.create(sessionId);
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
    session: createInitialSession(sessionId),
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
