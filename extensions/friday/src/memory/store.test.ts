import {
  createPluginStateKeyedStoreForTests,
  openOpenClawStateDatabase,
  resetPluginStateStoreForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import { closeOpenClawStateDatabaseAsync } from "openclaw/plugin-sdk/sqlite-runtime-testing";
import { useAutoCleanupTempDirTracker } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it } from "vitest";
import { applyCandidate, ownerCandidate, type StoredMemory } from "./records.js";
import { deleteMemories, loadMemories, memoryStoreOptions, saveMemory } from "./store.js";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    await closeOpenClawStateDatabaseAsync();
    resetPluginStateStoreForTests();
    cleanup();
  }),
);

/** A real bounded-state-backed store over a fresh state dir. */
function openFixture(root: string) {
  const env = { OPENCLAW_STATE_DIR: root };
  const database = openOpenClawStateDatabase({ env });
  const store = createPluginStateKeyedStoreForTests<StoredMemory>("friday", {
    ...memoryStoreOptions(),
    env,
  });
  return { store, database };
}

const NOW = "2026-11-17T09:00:00Z";

function added(text: string): StoredMemory {
  return applyCandidate([], ownerCandidate(text, NOW), NOW).records[0]!;
}

describe("memory store", () => {
  it("round-trips a record through a real store", async () => {
    const { store } = openFixture(tempDirs.make("friday-memory-"));
    const record = added("Prince likes espresso");
    await saveMemory(store, record);
    expect(await loadMemories(store)).toEqual([record]);
  });

  it("treats a malformed stored value as absent, not trusted (trust boundary)", async () => {
    const { store } = openFixture(tempDirs.make("friday-memory-"));
    await store.register("m_bad", { id: "m_bad", nope: true } as never);
    expect(await loadMemories(store)).toEqual([]);
  });

  it("survives a restart: a fresh store over the same state dir still sees the record", async () => {
    const root = tempDirs.make("friday-memory-");
    const first = openFixture(root);
    const record = added("Prince lives in Lagos");
    await saveMemory(first.store, record);

    await closeOpenClawStateDatabaseAsync();
    const second = openFixture(root);
    expect(await loadMemories(second.store)).toEqual([record]);
  });

  it("deletes exactly the matching records", async () => {
    const { store } = openFixture(tempDirs.make("friday-memory-"));
    const keep = added("Prince likes espresso");
    const drop = added("Prince lives in Lagos");
    await saveMemory(store, keep);
    await saveMemory(store, drop);
    expect(await deleteMemories(store, [drop.id])).toBe(1);
    expect((await loadMemories(store)).map((r) => r.id)).toEqual([keep.id]);
  });
});
