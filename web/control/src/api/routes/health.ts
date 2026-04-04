import { createLocalRuntimeTopology } from "../../../../shared/localRuntime";

import { errorResponse, jsonResponse } from "../http/response";

export function handleHealthRoute(request: Request, url: URL) {
  if (request.method !== "GET") {
    return errorResponse(
      request,
      405,
      "method_not_allowed",
      "Only GET is supported for control API health.",
      "session",
    );
  }

  return jsonResponse(
    request,
    {
      app: "control-api",
      runtime: createLocalRuntimeTopology(url.hostname),
      status: "ok",
    },
    200,
    "session",
  );
}
