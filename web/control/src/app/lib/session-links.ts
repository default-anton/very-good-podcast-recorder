import { buildDemoJoinKey } from "../../../../shared/joinLinks";
import {
  createSessionLinks as createContractSessionLinks,
  type SessionJoinKeys,
  withSessionLinks as withContractSessionLinks,
} from "../../../../shared/sessionContract";

import type { ControlSession } from "./types";

export type { SessionJoinKeys } from "../../../../shared/sessionContract";

export function createSessionLinks(
  origin: string,
  sessionId: string,
  joinKeys = createDemoSessionJoinKeys(sessionId),
) {
  return createContractSessionLinks(origin, sessionId, joinKeys);
}

export function withSessionLinks(
  session: ControlSession,
  origin: string,
  joinKeys = createDemoSessionJoinKeys(session.id),
): ControlSession {
  return withContractSessionLinks(session, origin, joinKeys);
}

function createDemoSessionJoinKeys(sessionId: string): SessionJoinKeys {
  return {
    guest: buildDemoJoinKey(sessionId, "guest"),
    host: buildDemoJoinKey(sessionId, "host"),
  };
}
