import type { ControlSessionResponse } from "../control/src/app/lib/api";
import { createSessionApiPath } from "../control/src/app/lib/api";
import worker from "../control/src/worker";

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
  return worker.fetch(new Request(`http://127.0.0.1:5173${path}`, init));
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
