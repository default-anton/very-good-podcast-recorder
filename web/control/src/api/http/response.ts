import { withCors, type CorsPolicy } from "./cors";

export function jsonResponse(
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

export function errorResponse(
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
