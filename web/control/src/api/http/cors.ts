const LOCAL_SESSION_APP_ORIGINS = new Set(["http://127.0.0.1:5174", "http://localhost:5174"]);

export type CorsPolicy = "bootstrap" | "none" | "session";

export function withCors(
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
    return "GET, PUT, PATCH, POST, DELETE, OPTIONS";
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
