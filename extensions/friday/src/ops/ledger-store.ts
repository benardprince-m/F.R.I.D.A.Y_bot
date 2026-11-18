// FRIDAY ledger store: durable persistence for the monthly spend snapshot (C-04/C-05, §7.10).
//
// The pure ledger (./ledger.ts) is plain JSON; this module is the only place it is read from or
// written to the engine's plugin-state store. One row per month, so the namespace is bounded by
// the number of months FRIDAY has run — a year of history is twelve rows, not a growing list.
// A value that does not match the expected shape is treated as absent rather than trusted, so a
// corrupt row cannot crash a turn — the store read is a trust boundary.
//
// Contract: see docs/contracts/friday-core.md (C-05).

import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import type { OpenAsyncKeyedStoreOptions } from "openclaw/plugin-sdk/plugin-state-runtime";
import { monthKey, type LedgerSnapshot } from "./ledger.js";

/** The minimal store surface this module needs; a PluginStateKeyedStore satisfies it. */
export interface LedgerStore {
  register(key: string, value: LedgerSnapshot): Promise<void>;
  lookup(key: string): Promise<LedgerSnapshot | undefined>;
}

export const LEDGER_NAMESPACE = "friday-ledger";

/**
 * Bounded namespace with `reject-new`: the key is the month, so the cap is hit only after ~250
 * years. If it ever is hit the store rejects the write loudly rather than silently dropping
 * another month's spend — the honest choice for a money ledger.
 */
export function ledgerStoreOptions(): OpenAsyncKeyedStoreOptions {
  return { namespace: LEDGER_NAMESPACE, maxEntries: 3_000, overflowPolicy: "reject-new" };
}

type StateApi = {
  openKeyedStoreV2?: <T>(options: OpenAsyncKeyedStoreOptions) => {
    lookup(key: string): Promise<T | undefined>;
    register(key: string, value: T): Promise<void>;
  };
};

/** Open the ledger store, or undefined when the host has no plugin-state store. */
export function openLedgerStore(runtime: PluginRuntime | undefined): LedgerStore | undefined {
  const open = (runtime?.state as StateApi | undefined)?.openKeyedStoreV2;
  if (!open) {
    return undefined;
  }
  return open<LedgerSnapshot>(ledgerStoreOptions());
}

/** Validate a snapshot read back from the store before trusting it. */
export function isLedgerSnapshot(value: unknown): value is LedgerSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.month === "string" &&
    Array.isArray(v.entries) &&
    v.entries.every((e) => {
      if (typeof e !== "object" || e === null) {
        return false;
      }
      const entry = e as Record<string, unknown>;
      return (
        typeof entry.at === "string" &&
        typeof entry.provider === "string" &&
        typeof entry.model === "string" &&
        typeof entry.costUsd === "number"
      );
    })
  );
}

/** The stored snapshot for the month containing `at`, or an empty snapshot for that month. */
export async function loadMonth(store: LedgerStore, at: string): Promise<LedgerSnapshot> {
  const month = monthKey(at);
  const value = await store.lookup(month);
  return isLedgerSnapshot(value) ? value : { month, entries: [] };
}

/** Persist a month's snapshot under its month key. */
export async function saveMonth(store: LedgerStore, snapshot: LedgerSnapshot): Promise<void> {
  await store.register(snapshot.month, snapshot);
}
