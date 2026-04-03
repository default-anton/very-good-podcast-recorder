import { errorResponse } from "./response";

export async function readJsonObject(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      request,
      400,
      "invalid_json",
      "Request body must be valid JSON.",
      "session",
    );
  }

  if (!isRecord(body)) {
    return errorResponse(
      request,
      400,
      "invalid_body",
      "Request body must be a JSON object.",
      "session",
    );
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
