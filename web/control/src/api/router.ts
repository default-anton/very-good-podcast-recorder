import { createBootstrapResponse } from "./bootstrap";
import { isJoinRole } from "./join-links";
import {
  createControlSessionResponse,
  ensureControlSessionResponse,
  hasStoredJoinKey,
} from "./sessions";

type ApiRoute =
  | {
      kind: "bootstrap";
      rawRole: string;
      rawSessionId: string;
    }
  | {
      kind: "session";
      rawSessionId: string;
    };

type CorsPolicy = "bootstrap" | "none" | "session";

const LOCAL_SESSION_APP_ORIGINS = new Set(["http://127.0.0.1:5174", "http://localhost:5174"]);

export async function routeApiRequest(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return null;
  }

  const route = matchApiRoute(url.pathname);

  if (request.method === "OPTIONS") {
    return preflightResponse(request, route);
  }

  if (route === null) {
    return errorResponse(
      request,
      404,
      "not_found",
      `No local control-plane route matches ${url.pathname}.`,
    );
  }

  if (route.kind === "session") {
    return handleSessionRoute(request, url, route.rawSessionId);
  }

  return handleBootstrapRoute(request, url, route.rawSessionId, route.rawRole);
}

function handleSessionRoute(request: Request, url: URL, rawSessionId: string) {
  if (request.method !== "GET" && request.method !== "PUT") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only GET and PUT are supported for sessions.",
      "session",
    );
  }

  const sessionId = decodePathSegment(request, rawSessionId, "session id");

  if (sessionId instanceof Response) {
    return sessionId;
  }

  const response =
    request.method === "PUT"
      ? ensureControlSessionResponse(sessionId, url.origin)
      : createControlSessionResponse(sessionId, url.origin);

  if (response === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before reading or bootstrapping it.`,
      "session",
    );
  }

  return jsonResponse(request, response, 200, "session");
}

function handleBootstrapRoute(request: Request, url: URL, rawSessionId: string, rawRole: string) {
  if (request.method !== "GET") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only GET is supported for session bootstrap.",
      "bootstrap",
    );
  }

  const sessionId = decodePathSegment(request, rawSessionId, "session id");

  if (sessionId instanceof Response) {
    return sessionId;
  }

  const role = decodePathSegment(request, rawRole, "role");

  if (role instanceof Response) {
    return role;
  }

  if (!isJoinRole(role)) {
    return errorResponse(request, 400, "invalid_role", "Role must be host or guest.", "bootstrap");
  }

  const sessionResponse = createControlSessionResponse(sessionId, url.origin);

  if (sessionResponse === null) {
    return errorResponse(
      request,
      404,
      "session_not_found",
      `Local session ${sessionId} does not exist. Provision it before bootstrapping it.`,
      "bootstrap",
    );
  }

  if (!hasStoredJoinKey(sessionId, role, url.searchParams.get("k"))) {
    return errorResponse(
      request,
      403,
      "invalid_join_key",
      "Join key is missing or does not match this role link.",
      "bootstrap",
    );
  }

  return jsonResponse(request, createBootstrapResponse(sessionResponse, role), 200, "bootstrap");
}

function preflightResponse(request: Request, route: ApiRoute | null) {
  if (route === null) {
    return errorResponse(
      request,
      404,
      "not_found",
      `No local control-plane route matches ${new URL(request.url).pathname}.`,
    );
  }

  const response = withCors(
    request,
    new Response(null, { status: 204 }),
    route.kind === "bootstrap" ? "bootstrap" : "session",
    route.kind === "bootstrap" ? "GET, OPTIONS" : "GET, PUT, OPTIONS",
    true,
  );

  return response ?? new Response(null, { status: 403 });
}

function matchApiRoute(pathname: string): ApiRoute | null {
  const bootstrapMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/bootstrap\/([^/]+)$/u);

  if (bootstrapMatch !== null) {
    return {
      kind: "bootstrap",
      rawRole: bootstrapMatch[2],
      rawSessionId: bootstrapMatch[1],
    };
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/u);

  if (sessionMatch !== null) {
    return {
      kind: "session",
      rawSessionId: sessionMatch[1],
    };
  }

  return null;
}

function decodePathSegment(request: Request, value: string, label: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return errorResponse(
      request,
      400,
      "invalid_path_segment",
      `${label} must be valid percent-encoded UTF-8.`,
    );
  }
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  corsPolicy: CorsPolicy = "none",
) {
  const response = new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });

  return withCors(request, response, corsPolicy) ?? response;
}

function errorResponse(
  request: Request,
  status: number,
  code: string,
  message: string,
  corsPolicy: CorsPolicy = "none",
) {
  return jsonResponse(
    request,
    {
      error: {
        code,
        message,
      },
    },
    status,
    corsPolicy,
  );
}

function withCors(
  request: Request,
  response: Response,
  corsPolicy: CorsPolicy,
  allowMethods = defaultAllowedMethods(corsPolicy),
  strict = false,
) {
  if (corsPolicy === "none") {
    return response;
  }

  const origin = resolveCorsOrigin(request, corsPolicy);

  if (origin === null) {
    return strict ? null : response;
  }

  const headers = new Headers(response.headers);
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");

  headers.set("Access-Control-Allow-Headers", requestedHeaders ?? "Accept, Content-Type");
  headers.set("Access-Control-Allow-Methods", allowMethods);
  headers.set("Access-Control-Allow-Origin", origin);
  appendVary(headers, "Access-Control-Request-Headers");
  appendVary(headers, "Origin");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function resolveCorsOrigin(request: Request, corsPolicy: Exclude<CorsPolicy, "none">) {
  const originHeader = request.headers.get("Origin");

  if (originHeader === null) {
    return null;
  }

  let origin: string;

  try {
    origin = new URL(originHeader).origin;
  } catch {
    return null;
  }

  const requestOrigin = new URL(request.url).origin;

  if (origin === requestOrigin) {
    return origin;
  }

  if (corsPolicy === "bootstrap" && LOCAL_SESSION_APP_ORIGINS.has(origin)) {
    return origin;
  }

  return null;
}

function defaultAllowedMethods(corsPolicy: CorsPolicy) {
  if (corsPolicy === "bootstrap") {
    return "GET, OPTIONS";
  }

  if (corsPolicy === "session") {
    return "GET, PUT, OPTIONS";
  }

  return "GET, OPTIONS";
}

function appendVary(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (current === null || current.length === 0) {
    headers.set("Vary", value);
    return;
  }

  const values = current.split(",").map((entry) => entry.trim());

  if (!values.includes(value)) {
    headers.set("Vary", `${current}, ${value}`);
  }
}
