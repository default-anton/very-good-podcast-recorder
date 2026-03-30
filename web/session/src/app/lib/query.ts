import { QueryClient, queryOptions } from "@tanstack/react-query";

import type { JoinLinkRole } from "../../../../shared/joinLinks";

export interface SessionBootstrapResponse {
  runtime: {
    baseUrl: string;
    liveKitUrl: string;
    roomName: string;
    state: "creating" | "ready" | "stopping" | "stopped" | "failed";
    turn: null;
  };
  seats: Array<{
    displayName: string;
    id: string;
    label: string;
    role: JoinLinkRole;
  }>;
  session: {
    id: string;
    role: JoinLinkRole;
    status: "draft" | "ready" | "active" | "ended";
    title: string;
  };
}

export interface SessionRoleLinksResponse {
  guest: string;
  host: string;
}

export const sessionQueryKeys = {
  bootstrap: (sessionId: string, role: JoinLinkRole, joinKey: string) =>
    ["session", "bootstrap", sessionId, role, joinKey] as const,
  links: (sessionId: string) => ["session", "links", sessionId] as const,
};

export function createSessionQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 60_000,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
}

export function sessionBootstrapQueryOptions(
  sessionId: string,
  role: JoinLinkRole,
  joinKey: string,
) {
  return queryOptions({
    queryFn: async () => fetchSessionBootstrap(sessionId, role, joinKey),
    queryKey: sessionQueryKeys.bootstrap(sessionId, role, joinKey),
  });
}

export function sessionRoleLinksQueryOptions(sessionId: string) {
  return queryOptions({
    queryFn: async () => fetchSessionRoleLinks(sessionId),
    queryKey: sessionQueryKeys.links(sessionId),
  });
}

async function fetchSessionBootstrap(sessionId: string, role: JoinLinkRole, joinKey: string) {
  return fetchJson<SessionBootstrapResponse>(createBootstrapApiPath(sessionId, role, joinKey));
}

async function fetchSessionRoleLinks(sessionId: string) {
  const response = await fetchJson<{ session: { links: SessionRoleLinksResponse } }>(
    createSessionApiPath(sessionId),
    {
      method: "PUT",
    },
  );

  return response.session.links;
}

function createBootstrapApiPath(sessionId: string, role: JoinLinkRole, joinKey: string) {
  const searchParams = new URLSearchParams({ k: joinKey });

  return `/api/v1/sessions/${encodeURIComponent(sessionId)}/bootstrap/${role}?${searchParams.toString()}`;
}

function createSessionApiPath(sessionId: string) {
  return `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
}

async function fetchJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | TResponse
    | null;

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? body.error?.message
        : undefined;

    throw new Error(
      message ?? `Session bootstrap failed: ${response.status} ${response.statusText}`,
    );
  }

  return body as TResponse;
}

function resolveApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const baseUrl = typeof window === "undefined" ? "http://127.0.0.1:5174" : window.location.origin;

  return new URL(path, baseUrl).toString();
}
