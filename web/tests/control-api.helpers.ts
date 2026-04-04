import worker from "../control/src/worker";
import { getLocalControlApiOrigin } from "../shared/localRuntime";
import type { ControlSessionResponse } from "../shared/sessionContract";
import { createSessionApiPath } from "../shared/sessionContract";

export function jsonRequest(method: "PATCH" | "POST" | "PUT", body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method,
  };
}

export async function requestControl(path: string, init?: RequestInit) {
  return worker.fetch(new Request(`${getLocalControlApiOrigin()}${path}`, init));
}

export async function provisionLocalSession(sessionId: string) {
  const response = await requestControl(createSessionApiPath(sessionId), { method: "PUT" });
  const body = (await response.json()) as ControlSessionResponse;

  return {
    body,
    guestJoinKey: new URL(body.session.links.guest).searchParams.get("k") ?? "",
    hostJoinKey: new URL(body.session.links.host).searchParams.get("k") ?? "",
    response,
  };
}
