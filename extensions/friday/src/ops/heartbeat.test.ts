// Tests for the heartbeat and night-shift window (G-01). Invariant: a paused heartbeat never
// fires, and the window wraps past midnight.
import { describe, expect, it, vi } from "vitest";
import { decideHeartbeat, heartbeatTick, inNightShift, NIGHT_SHIFT_TASKS } from "./heartbeat.js";

const WINDOW = { startHour: 23, endHour: 6 };

describe("inNightShift", () => {
  it("includes hours inside a wrapping window", () => {
    expect(inNightShift(23, WINDOW)).toBe(true);
    expect(inNightShift(0, WINDOW)).toBe(true);
    expect(inNightShift(5, WINDOW)).toBe(true);
  });
  it("excludes hours outside the window", () => {
    expect(inNightShift(6, WINDOW)).toBe(false);
    expect(inNightShift(12, WINDOW)).toBe(false);
    expect(inNightShift(22, WINDOW)).toBe(false);
  });
  it("handles a same-day window", () => {
    expect(inNightShift(9, { startHour: 8, endHour: 12 })).toBe(true);
    expect(inNightShift(13, { startHour: 8, endHour: 12 })).toBe(false);
  });
  it("treats an empty window as never active", () => {
    expect(inNightShift(5, { startHour: 5, endHour: 5 })).toBe(false);
  });
});

describe("decideHeartbeat", () => {
  it("fires the first beat", () => {
    const d = decideHeartbeat({ paused: false }, 1_000, 60_000, 12, WINDOW);
    expect(d.due).toBe(true);
    expect(d.kind).toBe("liveness");
  });

  it("does not fire before the interval elapses", () => {
    const d = decideHeartbeat({ lastBeatAt: 0, paused: false }, 30_000, 60_000, 12, WINDOW);
    expect(d.due).toBe(false);
  });

  it("fires a night-shift beat inside the window", () => {
    const d = decideHeartbeat({ lastBeatAt: 0, paused: false }, 60_000, 60_000, 2, WINDOW);
    expect(d.due).toBe(true);
    expect(d.kind).toBe("night-shift");
  });

  it("never fires while paused", () => {
    const d = decideHeartbeat({ lastBeatAt: 0, paused: true }, 999_999, 60_000, 2, WINDOW);
    expect(d.due).toBe(false);
  });
});

describe("NIGHT_SHIFT_TASKS", () => {
  it("lists consolidation first", () => {
    expect(NIGHT_SHIFT_TASKS[0]).toContain("consolidate memory");
  });
});

describe("heartbeatTick", () => {
  const deps = (overrides: Partial<Parameters<typeof heartbeatTick>[2]> = {}) => {
    const liveness = vi.fn(async () => {});
    const nightShift = vi.fn(async () => {});
    const onError = vi.fn();
    return {
      liveness,
      nightShift,
      onError,
      deps: {
        localHour: () => 12,
        window: WINDOW,
        runLiveness: liveness,
        runNightShift: nightShift,
        onError,
        ...overrides,
      },
    };
  };

  it("runs a liveness beat and advances the clock", async () => {
    const { deps: d, liveness } = deps();
    const next = await heartbeatTick({ paused: false }, 1_000, d);
    expect(liveness).toHaveBeenCalledOnce();
    expect(next.lastBeatAt).toBe(1_000);
  });

  it("does not beat before the interval elapses", async () => {
    const { deps: d, liveness } = deps();
    const next = await heartbeatTick({ lastBeatAt: 1_000, paused: false }, 30_000, d);
    expect(liveness).not.toHaveBeenCalled();
    expect(next.lastBeatAt).toBe(1_000);
  });

  it("runs a night-shift beat inside the window", async () => {
    const { deps: d, nightShift, liveness } = deps({ localHour: () => 2 });
    await heartbeatTick({ lastBeatAt: 0, paused: false }, 60_000, d);
    expect(nightShift).toHaveBeenCalledOnce();
    expect(liveness).not.toHaveBeenCalled();
  });

  it("never beats while paused", async () => {
    const { deps: d, liveness } = deps();
    const next = await heartbeatTick({ lastBeatAt: 0, paused: true }, 999_999, d);
    expect(liveness).not.toHaveBeenCalled();
    expect(next.lastBeatAt).toBe(0);
  });

  it("reports a failed beat and retries next tick instead of skipping", async () => {
    const { deps: d, onError } = deps({
      runLiveness: async () => {
        throw new Error("boom");
      },
    });
    const next = await heartbeatTick({ lastBeatAt: 0, paused: false }, 60_000, d);
    expect(onError).toHaveBeenCalledOnce();
    expect(next.lastBeatAt).toBe(0);
  });
});
