// FRIDAY continuity store: durable persistence for the conversation checkpoint (E-02, AUT-02).
//
// The pure checkpoint (./continuity.ts) is plain JSON; this module is the only place it is read
// from or written to the engine's plugin-state store, keyed by session. Restart-resume is then a
// serialise/parse: load the checkpoint, fold the new turn, save it back. A value that does not
// match the expected shape is treated as absent rather than trusted, so a corrupt or
// version-mismatched row cannot crash a turn — the store read is a trust boundary.
//
// Contract: see docs/contracts/friday-core.md (E-02).

import type { OpenAsyncKeyedStoreOptions } from "openclaw/plugin-sdk/plugin-state-runtime";
import type { Checkpoint, Turn } from "./continuity.js";

/** The minimal store surface this module needs; a PluginStateKeyedStore satisfies it. */
export interface ContinuityStore {
  register(key: string, value: Checkpoint): Promise<void>;
  lookup(key: string): Promise<Checkpoint | undefined>;
  delete(key: string): Promise<boolean>;
}

export const CONTINUITY_NAMESPACE = "friday-continuity";

/**
 * Bounded namespace with `reject-new`: an owner has few concurrent sessions, so the cap is never
 * hit in practice, and if it ever is the store rejects the write loudly instead of silently
 * evicting another session's checkpoint — which is exactly the "no silent loss" guarantee of E-02.
 */
export function continuityStoreOptions(): OpenAsyncKeyedStoreOptions {
  return { namespace: CONTINUITY_NAMESPACE, maxEntries: 10_000, overflowPolicy: "reject-new" };
}

/** Normalise a session key to a non-empty store key. */
export function continuityKey(sessionKey: string): string {
  const key = sessionKey.trim();
  return key.length > 0 ? key : "default";
}

function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const t = value as Record<string, unknown>;
  return (
    (t.role === "owner" || t.role === "friday") &&
    typeof t.text === "string" &&
    typeof t.at === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Validate a value read back from the store before trusting it. */
export function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.updatedAt === "string" &&
    typeof v.turnCount === "number" &&
    Array.isArray(v.recent) &&
    v.recent.every(isTurn) &&
    isStringArray(v.pinned) &&
    isStringArray(v.openThreads)
  );
}

export async function loadCheckpoint(
  store: ContinuityStore,
  sessionKey: string,
): Promise<Checkpoint | undefined> {
  const value = await store.lookup(continuityKey(sessionKey));
  return isCheckpoint(value) ? value : undefined;
}

export async function saveCheckpoint(
  store: ContinuityStore,
  sessionKey: string,
  checkpoint: Checkpoint,
): Promise<void> {
  await store.register(continuityKey(sessionKey), checkpoint);
}

/** Drop a session's checkpoint (used by an explicit reset/"forget"). */
export async function clearCheckpoint(
  store: ContinuityStore,
  sessionKey: string,
): Promise<boolean> {
  return store.delete(continuityKey(sessionKey));
}
