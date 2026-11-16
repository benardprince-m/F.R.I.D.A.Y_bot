// FRIDAY plugin config: parse and validate the owner-controlled plugin config, and
// resolve the live snapshot on every read so /lockdown and /owner take effect immediately.
//
// The config is operator-controlled: `ownerIds` (fail-closed when empty) and `lockedDown`
// (the kill switch). Unknown fields are rejected so a typo never silently weakens policy.

import { resolveLivePluginConfigObject } from "openclaw/plugin-sdk/plugin-config-runtime";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import type { SenderIdentity } from "./policy/owner-auth.js";

export interface FridayConfig {
  ownerIds: SenderIdentity[];
  lockedDown: boolean;
  /** Directory holding PERSONA.md and CONSTITUTION.md. Defaults to the process cwd. */
  personaDir?: string;
  /** Local provider id used for cheap-first routing (§7.10). Unset disables routing overrides. */
  localProvider?: string;
  /** Local model id paired with `localProvider`. */
  localModel?: string;
}

const EMPTY_CONFIG: FridayConfig = { ownerIds: [], lockedDown: false };

const STRING_FIELDS = ["localProvider", "localModel"] as const;

function isKnownField(key: string): boolean {
  return (
    key === "ownerIds" ||
    key === "personaDir" ||
    key === "lockedDown" ||
    (STRING_FIELDS as readonly string[]).includes(key)
  );
}

function invalid(detail: string): Error {
  return new Error(`friday: ${detail}`);
}

/**
 * Parse the raw plugin config into a validated snapshot.
 *
 * `ownerIds` entries are `"<channel>:<senderId>"`. A malformed entry throws rather than
 * being dropped: a silent drop would narrow the owner set and lock the owner out.
 */
export function parseFridayConfig(raw: unknown): FridayConfig {
  if (raw === undefined || raw === null) {
    return EMPTY_CONFIG;
  }
  if (!isRecord(raw)) {
    throw invalid("configuration must be an object");
  }
  for (const key of Object.keys(raw)) {
    if (!isKnownField(key)) {
      throw invalid(`unknown configuration field: ${key}`);
    }
  }
  const rawOwnerIds = raw.ownerIds;
  const ownerIds: SenderIdentity[] = [];
  if (rawOwnerIds !== undefined) {
    if (!Array.isArray(rawOwnerIds)) {
      throw invalid("ownerIds must be an array");
    }
    for (const entry of rawOwnerIds) {
      if (typeof entry !== "string") {
        throw invalid("each ownerIds entry must be a string");
      }
      const separator = entry.indexOf(":");
      const channel = separator === -1 ? "" : entry.slice(0, separator).trim();
      const senderId = separator === -1 ? "" : entry.slice(separator + 1).trim();
      if (!channel || !senderId) {
        throw invalid('ownerIds entries must look like "channel:senderId"');
      }
      ownerIds.push({ channel, senderId });
    }
  }
  const lockedDown = raw.lockedDown;
  if (lockedDown !== undefined && typeof lockedDown !== "boolean") {
    throw invalid("lockedDown must be a boolean");
  }
  const rawPersonaDir = raw.personaDir;
  if (rawPersonaDir !== undefined && typeof rawPersonaDir !== "string") {
    throw invalid("personaDir must be a string");
  }

  const optionalString = (key: (typeof STRING_FIELDS)[number]): string | undefined => {
    const value = raw[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw invalid(`${key} must be a string`);
    }
    return value.trim() ? value : undefined;
  };

  const localProvider = optionalString("localProvider");
  const localModel = optionalString("localModel");

  return {
    ownerIds,
    lockedDown: lockedDown === true,
    ...(typeof rawPersonaDir === "string" && rawPersonaDir.trim()
      ? { personaDir: rawPersonaDir }
      : {}),
    ...(localProvider ? { localProvider } : {}),
    ...(localModel ? { localModel } : {}),
  };
}

/**
 * Read the live config for this plugin.
 *
 * Prefers the running Gateway config so a chat-issued /lockdown or /owner takes effect on
 * the next turn without a restart; falls back to the startup snapshot in tests and CLI.
 */
export function readFridayConfig(
  runtimeConfigLoader: (() => unknown) | undefined,
  startupPluginConfig: unknown,
): FridayConfig {
  const live = resolveLivePluginConfigObject(
    runtimeConfigLoader as (() => never) | undefined,
    "friday",
    isRecord(startupPluginConfig) ? startupPluginConfig : undefined,
  );
  return parseFridayConfig(live);
}
