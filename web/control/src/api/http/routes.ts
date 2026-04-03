import { errorResponse } from "./response";

export type ApiRoute =
  | {
      kind: "bootstrap";
      rawRole: string;
      rawSessionId: string;
    }
  | {
      kind: "session";
      rawSessionId: string;
    }
  | {
      kind: "seat";
      rawSeatId: string;
      rawSessionId: string;
    }
  | {
      kind: "seats";
      rawSessionId: string;
    };

export function matchApiRoute(pathname: string): ApiRoute | null {
  const bootstrapMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/bootstrap\/([^/]+)$/u);

  if (bootstrapMatch !== null) {
    return {
      kind: "bootstrap",
      rawRole: bootstrapMatch[2],
      rawSessionId: bootstrapMatch[1],
    };
  }

  const seatMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/seats\/([^/]+)$/u);

  if (seatMatch !== null) {
    return {
      kind: "seat",
      rawSeatId: seatMatch[2],
      rawSessionId: seatMatch[1],
    };
  }

  const seatsMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/seats$/u);

  if (seatsMatch !== null) {
    return {
      kind: "seats",
      rawSessionId: seatsMatch[1],
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

export function decodePathSegment(request: Request, value: string, label: string) {
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

export function allowedMethodsForRoute(route: ApiRoute) {
  if (route.kind === "bootstrap") {
    return "GET, OPTIONS";
  }

  if (route.kind === "session") {
    return "GET, PUT, PATCH, OPTIONS";
  }

  if (route.kind === "seats") {
    return "POST, OPTIONS";
  }

  return "PATCH, DELETE, OPTIONS";
}
