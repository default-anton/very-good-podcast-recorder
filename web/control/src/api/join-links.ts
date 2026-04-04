import type { JoinLinkRole } from "../../../shared/joinLinks";
import type { SessionJoinKeys } from "../../../shared/sessionContract";

export type { JoinLinkRole };

export function isJoinRole(value: string | undefined): value is JoinLinkRole {
  return value === "host" || value === "guest";
}

export function createLocalJoinKeys(): SessionJoinKeys {
  return {
    guest: createOpaqueJoinKey("guest"),
    host: createOpaqueJoinKey("host"),
  };
}

export function hasValidLocalJoinKey(
  joinKeys: SessionJoinKeys,
  role: JoinLinkRole,
  joinKey: string | null,
) {
  return joinKey !== null && joinKey === joinKeys[role];
}

function createOpaqueJoinKey(role: JoinLinkRole) {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);

  return `local-${role}-${toHex(bytes)}`;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
