// FRIDAY ops: persist the owner-approved protected-file baseline (F-05, §7.5).
//
// The baseline is state, so it lives in the engine's SQLite plugin-state store — not a JSON
// sidecar. The owner records it once from chat (`/trust-persona`); `/doctor` (and, in Phase 1,
// the heartbeat) compares the live protected files against it. Reading is best-effort: a host
// without the store, or no baseline recorded yet, yields "unverified" rather than an error.
//
// Contract: see docs/contracts/friday-core.md (F-05).

import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import {
  buildBaseline,
  checkIntegrity,
  type IntegrityBaseline,
  type IntegrityReport,
  type ProtectedFile,
} from "../policy/integrity.js";

const NAMESPACE = "friday-integrity";
const BASELINE_KEY = "protected-baseline";
const MAX_ENTRIES = 4;

type StateApi = {
  openKeyedStoreV2?: <T>(options: { namespace: string; maxEntries: number }) => {
    lookup(key: string): Promise<T | undefined>;
    register(key: string, value: T): Promise<void>;
  };
};

function openBaselineStore(runtime: PluginRuntime | undefined) {
  const open = (runtime?.state as StateApi | undefined)?.openKeyedStoreV2;
  if (typeof open !== "function") {
    return undefined;
  }
  return open<IntegrityBaseline>({ namespace: NAMESPACE, maxEntries: MAX_ENTRIES });
}

/** The owner-approved baseline, or undefined when none has been recorded. */
export async function loadBaseline(
  runtime: PluginRuntime | undefined,
): Promise<IntegrityBaseline | undefined> {
  const store = openBaselineStore(runtime);
  return store ? store.lookup(BASELINE_KEY) : undefined;
}

/**
 * Record the current protected files as the owner-approved baseline. Returns false when the
 * host has no plugin-state store (nothing was recorded).
 */
export async function recordBaseline(
  runtime: PluginRuntime | undefined,
  files: ProtectedFile[],
): Promise<boolean> {
  const store = openBaselineStore(runtime);
  if (!store) {
    return false;
  }
  await store.register(BASELINE_KEY, buildBaseline(files));
  return true;
}

/** Result of checking the live protected files against the recorded baseline. */
export type IntegrityCheck =
  | { status: "ok" }
  | { status: "unverified"; reason: string }
  | { status: "violation"; report: IntegrityReport };

/**
 * Compare the live protected files against the recorded baseline. A host without the store,
 * or no baseline, is "unverified" — never reported as "ok", which would be a false assurance.
 */
export async function checkProtectedIntegrity(
  runtime: PluginRuntime | undefined,
  files: ProtectedFile[],
): Promise<IntegrityCheck> {
  const store = openBaselineStore(runtime);
  if (!store) {
    return { status: "unverified", reason: "plugin-state store unavailable on this host" };
  }
  const baseline = await store.lookup(BASELINE_KEY);
  if (!baseline) {
    return { status: "unverified", reason: "no owner-approved baseline recorded" };
  }
  const report = checkIntegrity(files, baseline);
  return report.clean ? { status: "ok" } : { status: "violation", report };
}
