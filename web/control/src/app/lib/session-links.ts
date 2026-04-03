import { buildDemoJoinKey, buildJoinUrl } from "../../../../shared/joinLinks";

import type { ControlSession } from "./types";

export interface SessionJoinKeys {
  guest: string;
  host: string;
}

export function createSessionLinks(
  origin: string,
  sessionId: string,
  joinKeys = createDemoSessionJoinKeys(sessionId),
) {
  return {
    guest: buildJoinUrl(origin, sessionId, "guest", joinKeys.guest),
    host: buildJoinUrl(origin, sessionId, "host", joinKeys.host),
  };
}

export function withSessionLinks(
  session: ControlSession,
  origin: string,
  joinKeys = createDemoSessionJoinKeys(session.id),
): ControlSession {
  return {
    ...session,
    links: createSessionLinks(origin, session.id, joinKeys),
  };
}

function createDemoSessionJoinKeys(sessionId: string): SessionJoinKeys {
  return {
    guest: buildDemoJoinKey(sessionId, "guest"),
    host: buildDemoJoinKey(sessionId, "host"),
  };
}
