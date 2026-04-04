import {
  createBootstrapApiPath,
  createSessionApiPath,
  createSessionSeatApiPath,
  createSessionSeatsApiPath,
  type ControlSessionResponse,
  type UpdateControlSeatInput,
  type UpdateControlSessionInput,
} from "../../../../shared/sessionContract";
import {
  getLocalControlApiOrigin,
  resolveLocalControlApiOrigin,
} from "../../../../shared/localRuntime";

export {
  createBootstrapApiPath,
  createSessionApiPath,
  createSessionSeatApiPath,
  createSessionSeatsApiPath,
} from "../../../../shared/sessionContract";
export type {
  ControlSessionResponse,
  SessionBootstrapResponse,
  SessionRuntimeDescriptor,
  SessionRuntimeState,
  UpdateControlSeatInput,
  UpdateControlSessionInput,
} from "../../../../shared/sessionContract";

export function createControlSessionPath(sessionId: string) {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

export function createControlRoomPath(sessionId: string) {
  return `${createControlSessionPath(sessionId)}/room`;
}

export async function ensureControlSession(
  sessionId: string,
  init?: RequestInit,
): Promise<ControlSessionResponse> {
  return fetchJson<ControlSessionResponse>(createSessionApiPath(sessionId), {
    ...init,
    method: "PUT",
  });
}

export async function updateControlSession(
  sessionId: string,
  patch: UpdateControlSessionInput,
): Promise<ControlSessionResponse> {
  return fetchJson<ControlSessionResponse>(createSessionApiPath(sessionId), {
    body: JSON.stringify(patch),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function createControlSeat(sessionId: string): Promise<ControlSessionResponse> {
  return fetchJson<ControlSessionResponse>(createSessionSeatsApiPath(sessionId), {
    method: "POST",
  });
}

export async function updateControlSeat(
  sessionId: string,
  seatId: string,
  patch: UpdateControlSeatInput,
): Promise<ControlSessionResponse> {
  return fetchJson<ControlSessionResponse>(createSessionSeatApiPath(sessionId, seatId), {
    body: JSON.stringify(patch),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function deleteControlSeat(
  sessionId: string,
  seatId: string,
): Promise<ControlSessionResponse> {
  return fetchJson<ControlSessionResponse>(createSessionSeatApiPath(sessionId, seatId), {
    method: "DELETE",
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

  const baseUrl =
    typeof window === "undefined"
      ? getLocalControlApiOrigin()
      : resolveLocalControlApiOrigin(window.location.origin);

  return new URL(path, baseUrl).toString();
}
