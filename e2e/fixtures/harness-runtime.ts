import path from "node:path";

import type { JoinLinkRole } from "../../web/shared/joinLinks";
import { loadLocalBootstrapConfig } from "../../web/shared/localBootstrap";

export interface HarnessBootstrapSeat {
  displayName: string;
  id: string;
  role: JoinLinkRole;
}

export interface HarnessBootstrapConfig {
  guestJoinKey: string;
  hostJoinKey: string;
  seats: HarnessBootstrapSeat[];
  sessionId: string;
}

export interface HarnessPaths {
  artifactRoot: string;
  e2eRoot: string;
  logsRoot: string;
  repoRoot: string;
  sessionArtifactRoot: string;
}

export function createHarnessPaths(options: { cwd?: string; sessionId: string }): HarnessPaths {
  const repoRoot = path.resolve(options.cwd ?? process.cwd());
  const localRoot = path.join(repoRoot, ".vgpr/local");
  const artifactRoot = path.join(localRoot, "artifacts");

  return {
    artifactRoot,
    e2eRoot: path.join(localRoot, "e2e"),
    logsRoot: path.join(localRoot, "logs"),
    repoRoot,
    sessionArtifactRoot: path.join(artifactRoot, options.sessionId),
  };
}

export async function loadHarnessBootstrapConfig(
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<HarnessBootstrapConfig> {
  const bootstrap = loadLocalBootstrapConfig(options);

  return {
    guestJoinKey: bootstrap.joinKeys.guest,
    hostJoinKey: bootstrap.joinKeys.host,
    seats: bootstrap.seats.map((seat) => ({ ...seat })),
    sessionId: bootstrap.sessionId,
  };
}

export function findHarnessSeat(config: HarnessBootstrapConfig, seatId: string) {
  return config.seats.find((seat) => seat.id === seatId) ?? null;
}

export function joinKeyForRole(config: HarnessBootstrapConfig, role: JoinLinkRole) {
  return role === "host" ? config.hostJoinKey : config.guestJoinKey;
}
