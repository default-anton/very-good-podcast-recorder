import path from "node:path";
import { readFileSync } from "node:fs";

import type { JoinLinkRole } from "./joinLinks";
import type { SessionJoinKeys } from "./sessionContract";

export interface LocalBootstrapSeat {
  displayName: string;
  id: string;
  role: JoinLinkRole;
}

export interface LocalBootstrapConfig {
  joinKeys: SessionJoinKeys;
  seats: LocalBootstrapSeat[];
  sessionId: string;
}

export function loadLocalBootstrapConfig(
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): LocalBootstrapConfig {
  const repoRoot = path.resolve(options.cwd ?? process.cwd());
  const env = loadLocalBootstrapEnv(repoRoot, options.env ?? process.env);

  return {
    joinKeys: {
      guest: requireLocalBootstrapEnv(env, "SESSIOND_BOOTSTRAP_GUEST_JOIN_KEY"),
      host: requireLocalBootstrapEnv(env, "SESSIOND_BOOTSTRAP_HOST_JOIN_KEY"),
    },
    seats: parseBootstrapSeats(requireLocalBootstrapEnv(env, "SESSIOND_BOOTSTRAP_SEATS_JSON")),
    sessionId: requireLocalBootstrapEnv(env, "SESSIOND_SESSION_ID"),
  };
}

function loadLocalBootstrapEnv(repoRoot: string, env: NodeJS.ProcessEnv) {
  const committed = readEnvFile(path.join(repoRoot, "deploy/local/sessiond.env"));
  const local = readEnvFile(path.join(repoRoot, ".env.local"), true);
  const merged = { ...committed, ...local };

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

function readEnvFile(filePath: string, optional = false) {
  try {
    return parseEnvFile(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (optional && isMissingFileError(error)) {
      return {};
    }
    if (!optional && isMissingFileError(error)) {
      throw new Error(`Missing local bootstrap env file ${filePath}.`, { cause: error });
    }

    throw error;
  }
}

function parseEnvFile(content: string) {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const match = /^export\s+([A-Z0-9_]+)=(.*)$/u.exec(line) ?? /^([A-Z0-9_]+)=(.*)$/u.exec(line);

    if (match === null) {
      continue;
    }

    parsed[match[1]] = unquoteEnvValue(match[2].trim());
  }

  return parsed;
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseBootstrapSeats(raw: string) {
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;

  return parsed.map((seat) => {
    if (seat.role !== "host" && seat.role !== "guest") {
      throw new Error(`Unsupported local bootstrap seat role ${String(seat.role)}.`);
    }

    return {
      displayName: requireStringField(seat, "display_name"),
      id: requireStringField(seat, "id"),
      role: seat.role,
    } satisfies LocalBootstrapSeat;
  });
}

function requireLocalBootstrapEnv(env: Record<string, string>, key: string) {
  const value = env[key]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing local bootstrap env value ${key}.`);
  }

  return value;
}

function requireStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Local bootstrap field ${key} must be a non-empty string.`);
  }

  return value;
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
