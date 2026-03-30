import type { ControlSessionResponse, SessionBootstrapResponse } from "../app/lib/api";

import type { JoinLinkRole } from "./join-links";
import { toSeatDescriptors } from "./seats";

export function createBootstrapResponse(
  response: ControlSessionResponse,
  role: JoinLinkRole,
): SessionBootstrapResponse {
  return {
    runtime: response.runtime,
    seats: toSeatDescriptors(response.session),
    session: {
      id: response.session.id,
      role,
      status: response.session.status,
      title: response.session.title,
    },
  };
}
