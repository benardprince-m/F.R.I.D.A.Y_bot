import {
  createPluginStateKeyedStoreForTests,
  openOpenClawStateDatabase,
  resetPluginStateStoreForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import { closeOpenClawStateDatabaseAsync } from "openclaw/plugin-sdk/sqlite-runtime-testing";
import { useAutoCleanupTempDirTracker } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearCheckpoint,
  continuityKey,
  continuityStoreOptions,
  isCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
} from "./continuity-store.js";
import { emptyCheckpoint, foldCheckpoint, type Checkpoint, type Turn } from "./continuity.js";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    await closeOpenClawStateDatabaseAsync();
    resetPluginStateStoreForTests();
    cleanup();
  }),
);

/** A real bounded-state-backed store over a fresh state dir, with its host admission installed. */
function openFixture(root: string) {
  const env = { OPENCLAW_STATE_DIR: root };
  const database = openOpenClawStateDatabase({ env });
  const store = createPluginStateKeyedStoreForTests<Checkpoint>("friday", {
    ...continuityStoreOptions(),
    env,
  });
  return { store, database };
}

const T = (role: "owner" | "friday", text: string, at: string): Turn => ({ role, text, at });

describe("continuity store", () => {
  it("round-trips a checkpoint through a real store", async () => {
    const { store } = openFixture(tempDirs.make("friday-continuity-"));
    const cp = foldCheckpoint(emptyCheckpoint("2026-11-16T10:00:00Z"), [
      T("owner", "hi", "2026-11-16T10:00:00Z"),
      T("friday", "hello", "2026-11-16T10:00:01Z"),
    ]);
    await saveCheckpoint(store, "telegram:owner", cp);
    expect(await loadCheckpoint(store, "telegram:owner")).toEqual(cp);
  });

  it("returns undefined for a session with no checkpoint", async () => {
    const { store } = openFixture(tempDirs.make("friday-continuity-"));
    expect(await loadCheckpoint(store, "telegram:nobody")).toBeUndefined();
  });

  it("treats a malformed stored value as absent, not trusted (trust boundary)", async () => {
    const { store } = openFixture(tempDirs.make("friday-continuity-"));
    await store.register(continuityKey("telegram:owner"), { version: 2, nope: true } as never);
    expect(await loadCheckpoint(store, "telegram:owner")).toBeUndefined();
  });

  it("survives a restart: a fresh store over the same state dir still sees the checkpoint", async () => {
    const root = tempDirs.make("friday-continuity-");
    const first = openFixture(root);
    const cp = foldCheckpoint(emptyCheckpoint("2026-11-16T10:00:00Z"), [
      T("owner", "remember this", "2026-11-16T10:00:00Z"),
    ]);
    await saveCheckpoint(first.store, "telegram:owner", cp);

    // Simulate a process restart: close the state DB, reopen a new store over the same dir.
    await closeOpenClawStateDatabaseAsync();
    const second = openFixture(root);
    expect(await loadCheckpoint(second.store, "telegram:owner")).toEqual(cp);
  });

  it("clears a checkpoint on request", async () => {
    const { store } = openFixture(tempDirs.make("friday-continuity-"));
    await saveCheckpoint(store, "telegram:owner", emptyCheckpoint("2026-11-16T10:00:00Z"));
    expect(await clearCheckpoint(store, "telegram:owner")).toBe(true);
    expect(await loadCheckpoint(store, "telegram:owner")).toBeUndefined();
  });

  it("validates the checkpoint shape", () => {
    const good = emptyCheckpoint("2026-11-16T10:00:00Z");
    expect(isCheckpoint(good)).toBe(true);
    expect(isCheckpoint({ ...good, recent: [{ role: "x", text: 1, at: 2 }] })).toBe(false);
    expect(isCheckpoint({ ...good, pinned: [1] })).toBe(false);
    expect(isCheckpoint(null)).toBe(false);
  });
});
