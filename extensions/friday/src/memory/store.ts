// FRIDAY memory store: durable persistence for the record set (B-04).
//
// The pure record model (./records.ts) is JSON; this module is the only place it is read from or
// written to the engine's plugin-state store. Each record is one row keyed by its id, so `/forget`
// deletes exactly the matching rows and the namespace stays bounded. A value that fails
// `isStoredMemory` is treated as absent rather than trusted — the store read is a trust boundary.

import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import type { OpenAsyncKeyedStoreOptions } from "openclaw/plugin-sdk/plugin-state-runtime";
import { isStoredMemory, type StoredMemory } from "./records.js";

/** The minimal store surface this module needs; a PluginStateKeyedStore satisfies it. */
export interface MemoryStore {
  register(key: string, value: StoredMemory): Promise<void>;
  lookup(key: string): Promise<StoredMemory | undefined>;
  entries(): Promise<{ key: string; value: StoredMemory }[]>;
  delete(key: string): Promise<boolean>;
}

export const MEMORY_NAMESPACE = "friday-memory";

/**
 * Bounded namespace. `reject-new` refuses a write past the cap loudly instead of silently
 * evicting a record, so a full store is a visible condition the owner can clear, not silent loss.
 */
export function memoryStoreOptions(): OpenAsyncKeyedStoreOptions {
  return { namespace: MEMORY_NAMESPACE, maxEntries: 5_000, overflowPolicy: "reject-new" };
}

type StateApi = {
  openKeyedStoreV2?: <T>(options: OpenAsyncKeyedStoreOptions) => {
    lookup(key: string): Promise<T | undefined>;
    entries(): Promise<{ key: string; value: T }[]>;
    register(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
  };
};

/** Open the memory store, or undefined when the host has no plugin-state store. */
export function openMemoryStore(runtime: PluginRuntime | undefined): MemoryStore | undefined {
  const open = (runtime?.state as StateApi | undefined)?.openKeyedStoreV2;
  if (typeof open !== "function") {
    return undefined;
  }
  return open<StoredMemory>(memoryStoreOptions());
}

/** All live records, dropping any row that fails validation. */
export async function loadMemories(store: MemoryStore): Promise<StoredMemory[]> {
  const entries = await store.entries();
  return entries.map((e) => e.value).filter(isStoredMemory);
}

/** Persist one record (by id). */
export async function saveMemory(store: MemoryStore, record: StoredMemory): Promise<void> {
  await store.register(record.id, record);
}

/** Persist a whole record set (used after a fold or a merge). */
export async function saveMemories(store: MemoryStore, records: StoredMemory[]): Promise<void> {
  for (const record of records) {
    await store.register(record.id, record);
  }
}

/** Delete one record by id. Returns true when a row was removed. */
export async function deleteMemory(store: MemoryStore, id: string): Promise<boolean> {
  return store.delete(id);
}

/** Delete every record whose id is in `ids`. Returns the number removed. */
export async function deleteMemories(store: MemoryStore, ids: string[]): Promise<number> {
  let removed = 0;
  for (const id of ids) {
    if (await deleteMemory(store, id)) {
      removed += 1;
    }
  }
  return removed;
}
