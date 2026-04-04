import { withCors } from "./http/cors";
import { allowedMethodsForRoute, matchApiRoute, type ApiRoute } from "./http/routes";
import { errorResponse } from "./http/response";
import { handleBootstrapRoute } from "./routes/bootstrap";
import { handleHealthRoute } from "./routes/health";
import { handleSeatRoute, handleSeatsRoute } from "./routes/seats";
import { handleSessionRoute } from "./routes/session";

export async function routeApiRequest(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return null;
  }

  if (url.pathname === "/api/healthz") {
    return handleHealthRoute(request, url);
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

  if (route.kind === "seats") {
    return handleSeatsRoute(request, url, route.rawSessionId);
  }

  if (route.kind === "seat") {
    return handleSeatRoute(request, url, route.rawSessionId, route.rawSeatId);
  }

  return handleBootstrapRoute(request, url, route.rawSessionId, route.rawRole);
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
    allowedMethodsForRoute(route),
    true,
  );

  return response ?? new Response(null, { status: 403 });
}
