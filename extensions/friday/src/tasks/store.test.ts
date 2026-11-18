import {
  createPluginStateKeyedStoreForTests,
  openOpenClawStateDatabase,
  resetPluginStateStoreForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import { closeOpenClawStateDatabaseAsync } from "openclaw/plugin-sdk/sqlite-runtime-testing";
import { useAutoCleanupTempDirTracker } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it } from "vitest";
import { createTask, renderDebrief, type TaskRecord } from "./ledger.js";
import { isTaskRecord, loadTasks, saveTask, taskStoreOptions } from "./store.js";

// The store opener needs the main-thread plugin-state broker, so this file runs in the
// database-workers lane (see test/vitest/vitest.extension-database-workers-paths.mjs).

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
  openOpenClawStateDatabase({ env });
  return createPluginStateKeyedStoreForTests<TaskRecord>("friday", {
    ...taskStoreOptions(),
    env,
  });
}

const AT = "2026-11-13T12:00:00.000Z";

describe("task store", () => {
  it("returns no tasks for an empty store", async () => {
    const store = openFixture(tempDirs.make("friday-tasks-"));
    expect(await loadTasks(store)).toEqual([]);
  });

  it("round-trips a task and survives a restart", async () => {
    const root = tempDirs.make("friday-tasks-");
    const task = {
      ...createTask({ owner: "benard", goal: "Draft a timetable", approvedTools: ["notes"] }, AT),
      status: "done" as const,
      evidence: ["notes saved → exit 0"],
    };
    await saveTask(openFixture(root), task);

    await closeOpenClawStateDatabaseAsync();
    const reopened = await loadTasks(openFixture(root));
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.id).toBe(task.id);
    // The honest debrief survives the restart: evidence is still attached to the record.
    expect(renderDebrief(reopened[0]!)).toContain("Outcome: done");
  });

  it("keeps multiple tasks separate by id", async () => {
    const store = openFixture(tempDirs.make("friday-tasks-"));
    await saveTask(store, createTask({ owner: "benard", goal: "First", approvedTools: [] }, AT));
    await saveTask(store, createTask({ owner: "benard", goal: "Second", approvedTools: [] }, AT));
    const goals = (await loadTasks(store)).map((t) => t.goal).toSorted();
    expect(goals).toEqual(["First", "Second"]);
  });

  it("treats a malformed row as absent (trust boundary)", () => {
    const good = createTask({ owner: "benard", goal: "x", approvedTools: [] }, AT);
    expect(isTaskRecord(good)).toBe(true);
    expect(isTaskRecord({ ...good, status: "finished" })).toBe(false);
    expect(isTaskRecord({ ...good, evidence: [1] })).toBe(false);
    expect(isTaskRecord({ ...good, id: 7 })).toBe(false);
    expect(isTaskRecord(null)).toBe(false);
  });
});
