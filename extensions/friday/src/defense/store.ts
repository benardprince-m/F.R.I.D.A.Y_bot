// FRIDAY defense: durable persistence for the threat ledger (Product Specification §7.15).
//
// One row per actor, so the namespace is bounded by the number of distinct hostile actors seen —
// a handful, not a growing list. A value that fails `isThreatLedger` is treated as absent rather
// than trusted (the store read is a trust boundary), so a corrupt row cannot crash a turn.
//
// Contract: see docs/contracts/friday-defense.md.

import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import type { OpenAsyncKeyedStoreOptions } from "openclaw/plugin-sdk/plugin-state-runtime";
import { createThreatLedger, isThreatLedger, type ThreatLedger } from "./ledger.js";

export interface ThreatStore {
  register(key: string, value: ThreatLedger): Promise<void>;
  lookup(key: string): Promise<ThreatLedger | undefined>;
}

export const THREAT_NAMESPACE = "friday-threats";
const LEDGER_KEY = "ledger";

/**
 * Bounded namespace with `reject-new`: the ledger is one row, so the cap is never hit in
 * practice; if it ever were, the store rejects the write loudly rather than silently dropping
 * the threat history — the honest choice for a security record.
 */
export function threatStoreOptions(): OpenAsyncKeyedStoreOptions {
  return { namespace: THREAT_NAMESPACE, maxEntries: 1_000, overflowPolicy: "reject-new" };
}

type StateApi = {
  openKeyedStoreV2?: <T>(options: OpenAsyncKeyedStoreOptions) => {
    lookup(key: string): Promise<T | undefined>;
    register(key: string, value: T): Promise<void>;
  };
};

/** Open the threat store, or undefined when the host has no plugin-state store. */
export function openThreatStore(runtime: PluginRuntime | undefined): ThreatStore | undefined {
  const open = (runtime?.state as StateApi | undefined)?.openKeyedStoreV2;
  if (typeof open !== "function") {
    return undefined;
  }
  return open<ThreatLedger>(threatStoreOptions());
}

/** The stored ledger, or an empty one when none exists or the row is invalid. */
export async function loadThreats(store: ThreatStore): Promise<ThreatLedger> {
  const value = await store.lookup(LEDGER_KEY);
  return isThreatLedger(value) ? value : createThreatLedger();
}

/** Persist the ledger. */
export async function saveThreats(store: ThreatStore, ledger: ThreatLedger): Promise<void> {
  await store.register(LEDGER_KEY, ledger);
}
