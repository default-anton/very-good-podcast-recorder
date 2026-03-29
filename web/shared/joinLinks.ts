export type JoinLinkRole = "host" | "guest";

export function buildJoinPath(sessionId: string, role: JoinLinkRole) {
  return `/join/${sessionId}/${role}`;
}

export function buildJoinRoomPath(sessionId: string, role: JoinLinkRole) {
  return `${buildJoinPath(sessionId, role)}/room`;
}

export function buildJoinHref(sessionId: string, role: JoinLinkRole, joinKey?: string) {
  const path = buildJoinPath(sessionId, role);

  if (joinKey === undefined || joinKey.length === 0) {
    return path;
  }

  return `${path}?k=${encodeURIComponent(joinKey)}`;
}

export function buildJoinUrl(
  origin: string,
  sessionId: string,
  role: JoinLinkRole,
  joinKey?: string,
) {
  return new URL(buildJoinHref(sessionId, role, joinKey), origin).toString();
}

export function buildDemoJoinKey(sessionId: string, role: JoinLinkRole) {
  return `demo-${sessionId}-${role}-key`;
}
