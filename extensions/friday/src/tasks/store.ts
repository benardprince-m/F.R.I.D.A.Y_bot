// FRIDAY task store: durable persistence for the task ledger (E-01/E-02, AUT-01/AUT-02).
//
// The pure record (./ledger.ts) is plain JSON; this module is the only place it is read from or
// written to the engine's plugin-state store. One row per task, keyed by id, so a restart re-reads
// every accepted task rather than losing it (the "no silent loss" guarantee of E-02). A value that
// fails `isTaskRecord` is treated as absent rather than trusted — the store read is a trust
// boundary, and a corrupt row must not crash a turn.
//
// Contract: see docs/contracts/friday-core.md (E-01/E-02).

import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import type { OpenAsyncKeyedStoreOptions } from "openclaw/plugin-sdk/plugin-state-runtime";
import { isTaskStatus, type TaskRecord } from "./ledger.js";

/** The minimal store surface this module needs; a PluginStateKeyedStore satisfies it. */
export interface TaskStore {
  register(key: string, value: TaskRecord): Promise<void>;
  lookup(key: string): Promise<TaskRecord | undefined>;
  entries(): Promise<{ key: string; value: TaskRecord }[]>;
}

export const TASK_NAMESPACE = "friday-tasks";

/**
 * Bounded namespace with `reject-new`: an owner runs a handful of tasks at a time, so the cap is
 * never hit in practice, and if it ever is the store rejects the write loudly rather than silently
 * evicting another task's record — the "no silent loss" guarantee of E-02.
 */
export function taskStoreOptions(): OpenAsyncKeyedStoreOptions {
  return { namespace: TASK_NAMESPACE, maxEntries: 10_000, overflowPolicy: "reject-new" };
}

type StateApi = {
  openKeyedStoreV2?: <T>(options: OpenAsyncKeyedStoreOptions) => {
    lookup(key: string): Promise<T | undefined>;
    entries(): Promise<{ key: string; value: T }[]>;
    register(key: string, value: T): Promise<void>;
  };
};

/** Open the task store, or undefined when the host has no plugin-state store. */
export function openTaskStore(runtime: PluginRuntime | undefined): TaskStore | undefined {
  const open = (runtime?.state as StateApi | undefined)?.openKeyedStoreV2;
  if (typeof open !== "function") {
    return undefined;
  }
  return open<TaskRecord>(taskStoreOptions());
}

/** Validate a record read back from the store before trusting it. */
export function isTaskRecord(value: unknown): value is TaskRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.owner === "string" &&
    typeof v.goal === "string" &&
    typeof v.status === "string" &&
    isTaskStatus(v.status) &&
    typeof v.startedAt === "string" &&
    Array.isArray(v.approvedTools) &&
    v.approvedTools.every((t) => typeof t === "string") &&
    Array.isArray(v.evidence) &&
    v.evidence.every((e) => typeof e === "string") &&
    (v.checkpoint === undefined || typeof v.checkpoint === "string") &&
    (v.budgetUsd === undefined || typeof v.budgetUsd === "number") &&
    (v.costUsd === undefined || typeof v.costUsd === "number") &&
    (v.nextWake === undefined || typeof v.nextWake === "string")
  );
}

/** All live task records, dropping any row that fails validation. */
export async function loadTasks(store: TaskStore): Promise<TaskRecord[]> {
  const entries = await store.entries();
  return entries.map((e) => e.value).filter(isTaskRecord);
}

/** Persist one task record (by id). */
export async function saveTask(store: TaskStore, record: TaskRecord): Promise<void> {
  await store.register(record.id, record);
}
