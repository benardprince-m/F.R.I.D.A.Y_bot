import {
  createPluginStateKeyedStoreForTests,
  openOpenClawStateDatabase,
  resetPluginStateStoreForTests,
} from "openclaw/plugin-sdk/plugin-state-test-runtime";
import { closeOpenClawStateDatabaseAsync } from "openclaw/plugin-sdk/sqlite-runtime-testing";
import { useAutoCleanupTempDirTracker } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it } from "vitest";
import { isLedgerSnapshot, ledgerStoreOptions, loadMonth, saveMonth } from "./ledger-store.js";
import { monthToDateUsd, recordUsage, type LedgerSnapshot } from "./ledger.js";

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
  return createPluginStateKeyedStoreForTests<LedgerSnapshot>("friday", {
    ...ledgerStoreOptions(),
    env,
  });
}

const AT = "2026-11-13T12:00:00.000Z";

describe("ledger store", () => {
  it("returns an empty snapshot for a month with no rows", async () => {
    const store = openFixture(tempDirs.make("friday-ledger-"));
    expect(await loadMonth(store, AT)).toEqual({ month: "2026-11", entries: [] });
  });

  it("round-trips a month's spend and survives a restart", async () => {
    const root = tempDirs.make("friday-ledger-");
    const first = openFixture(root);
    const usage = {
      provider: "google",
      model: "gemini-2.5-flash",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    };
    await saveMonth(first, recordUsage({ month: "2026-11", entries: [] }, usage, AT));

    await closeOpenClawStateDatabaseAsync();
    const reopened = await loadMonth(openFixture(root), AT);
    expect(reopened.month).toBe("2026-11");
    expect(reopened.entries).toHaveLength(1);
    expect(monthToDateUsd(reopened)).toBeCloseTo(2.8, 5);
  });

  it("keeps months separate", async () => {
    const store = openFixture(tempDirs.make("friday-ledger-"));
    await saveMonth(
      store,
      recordUsage(
        { month: "2026-11", entries: [] },
        { provider: "google", model: "gemini-2.5-flash", inputTokens: 1_000_000 },
        AT,
      ),
    );
    expect(await loadMonth(store, "2026-12-01T00:00:00.000Z")).toEqual({
      month: "2026-12",
      entries: [],
    });
  });

  it("treats a malformed row as absent (trust boundary)", () => {
    expect(isLedgerSnapshot({ month: "2026-11", entries: [{ at: 1 }] })).toBe(false);
    expect(isLedgerSnapshot({ month: "2026-11", entries: [] })).toBe(true);
    expect(isLedgerSnapshot(null)).toBe(false);
  });
});
