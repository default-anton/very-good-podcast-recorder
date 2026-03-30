import type { JoinLinkRole } from "../../../../shared/joinLinks";

import type { ControlSession } from "./types";

export type SessionRuntimeState = "creating" | "ready" | "stopping" | "stopped" | "failed";

export interface SessionRuntimeDescriptor {
  baseUrl: string;
  liveKitUrl: string;
  roomName: string;
  state: SessionRuntimeState;
  turn: null;
}

export interface ControlSessionResponse {
  runtime: SessionRuntimeDescriptor;
  session: ControlSession;
}

export interface SessionBootstrapResponse {
  runtime: SessionRuntimeDescriptor;
  seats: Array<{
    displayName: string;
    id: string;
    label: string;
    role: JoinLinkRole;
  }>;
  session: {
    id: string;
    role: JoinLinkRole;
    status: ControlSession["status"];
    title: string;
  };
}

export function createSessionApiPath(sessionId: string) {
  return `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
}

export function createControlSessionPath(sessionId: string) {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

export function createControlRoomPath(sessionId: string) {
  return `${createControlSessionPath(sessionId)}/room`;
}

export function createBootstrapApiPath(sessionId: string, role: JoinLinkRole, joinKey: string) {
  const path = `${createSessionApiPath(sessionId)}/bootstrap/${role}`;
  const searchParams = new URLSearchParams({ k: joinKey });

  return `${path}?${searchParams.toString()}`;
}

export async function ensureControlSession(sessionId: string): Promise<ControlSessionResponse> {
  return fetchJson<ControlSessionResponse>(createSessionApiPath(sessionId), {
    method: "PUT",
  });
}

export async function fetchJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await createRequestError(response);
  }

  return (await response.json()) as TResponse;
}

async function createRequestError(response: Response) {
  let errorCode: string | null = null;
  let errorMessage = `${response.status} ${response.statusText}`;

  try {
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    if (body.error?.code !== undefined) {
      errorCode = body.error.code;
    }

    if (body.error?.message !== undefined) {
      errorMessage = body.error.message;
    }
  } catch {
    // Keep the default HTTP status message when the response is not JSON.
  }

  if (errorCode === null) {
    return new Error(`Control API request failed: ${errorMessage}`);
  }

  return new Error(`Control API request failed (${errorCode}): ${errorMessage}`);
}

function resolveApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const baseUrl = typeof window === "undefined" ? "http://127.0.0.1:5173" : window.location.origin;

  return new URL(path, baseUrl).toString();
}
