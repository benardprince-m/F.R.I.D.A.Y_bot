import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTINUITY_LIMITS,
  emptyCheckpoint,
  foldCheckpoint,
  renderCheckpoint,
  withOpenThreads,
  withPinned,
  type Checkpoint,
  type Turn,
} from "./continuity.js";

const T = (role: "owner" | "friday", text: string, at = "2026-11-16T10:00:00Z"): Turn => ({
  role,
  text,
  at,
});

describe("continuity checkpoint", () => {
  it("starts empty and bounded", () => {
    const cp = emptyCheckpoint("2026-11-16T10:00:00Z");
    expect(cp).toEqual({
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      turnCount: 0,
      recent: [],
      pinned: [],
      openThreads: [],
    });
  });

  it("folds turns in order and counts every turn", () => {
    const cp = foldCheckpoint(emptyCheckpoint("2026-11-16T10:00:00Z"), [
      T("owner", "hi"),
      T("friday", "hello", "2026-11-16T10:00:01Z"),
    ]);
    expect(cp.turnCount).toBe(2);
    expect(cp.recent.map((t) => t.role)).toEqual(["owner", "friday"]);
    expect(cp.updatedAt).toBe("2026-11-16T10:00:01Z");
  });

  it("caps the verbatim tail but keeps the true turn count (no silent loss)", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      T("owner", `m${i}`, `2026-11-16T10:00:${i}Z`),
    );
    const cp = foldCheckpoint(emptyCheckpoint("2026-11-16T10:00:00Z"), many, {
      ...DEFAULT_CONTINUITY_LIMITS,
      maxTurns: 5,
    });
    expect(cp.recent).toHaveLength(5);
    expect(cp.recent.at(-1)!.text).toBe("m19");
    expect(cp.turnCount).toBe(20);
  });

  it("never grows the tail past the cap across repeated folds", () => {
    let cp = emptyCheckpoint("2026-11-16T10:00:00Z");
    for (let i = 0; i < 30; i += 1) {
      cp = foldCheckpoint(cp, [T("owner", `m${i}`)], { ...DEFAULT_CONTINUITY_LIMITS, maxTurns: 4 });
    }
    expect(cp.recent).toHaveLength(4);
    expect(cp.turnCount).toBe(30);
  });

  it("pins facts, newest-wins, de-duplicated, bounded", () => {
    const cp = withPinned(emptyCheckpoint("2026-11-16T10:00:00Z"), ["a", "b", "a", "c", "d"], {
      ...DEFAULT_CONTINUITY_LIMITS,
      maxPinned: 3,
    });
    // Newest 3 distinct values win; the older "a" is the same value as the newer one.
    expect(cp.pinned).toEqual(["a", "c", "d"]);
  });

  it("tracks open threads the same way", () => {
    const cp = withOpenThreads(emptyCheckpoint("2026-11-16T10:00:00Z"), ["taxes", "taxes", "car"], {
      ...DEFAULT_CONTINUITY_LIMITS,
      maxOpenThreads: 5,
    });
    expect(cp.openThreads).toEqual(["taxes", "car"]);
  });

  it("renders a compact, model-facing checkpoint with pinned facts and threads", () => {
    let cp = emptyCheckpoint("2026-11-16T10:00:00Z");
    cp = foldCheckpoint(cp, [T("owner", "what is on my plate?"), T("friday", "two tasks")]);
    cp = withPinned(cp, ["Owner timezone: EAT"]);
    cp = withOpenThreads(cp, ["submit the tax form"]);
    const text = renderCheckpoint(cp);
    expect(text).toContain("2 turns");
    expect(text).toContain("Pinned:\n- Owner timezone: EAT");
    expect(text).toContain("Open threads:\n- submit the tax form");
    expect(text).toContain("Owner: what is on my plate?");
    expect(text).toContain("FRIDAY: two tasks");
  });

  it("states how many earlier turns were omitted once the tail is capped", () => {
    const many = Array.from({ length: 20 }, (_, i) => T("owner", `m${i}`));
    const cp = foldCheckpoint(emptyCheckpoint("2026-11-16T10:00:00Z"), many, {
      ...DEFAULT_CONTINUITY_LIMITS,
      maxTurns: 5,
    });
    expect(renderCheckpoint(cp)).toContain("15 earlier omitted");
  });

  it("honours the char cap and reports the turns the cap itself dropped", () => {
    const many = Array.from({ length: 40 }, (_, i) => T("owner", `x`.repeat(50) + i));
    const cp = foldCheckpoint(emptyCheckpoint("2026-11-16T10:00:00Z"), many, {
      ...DEFAULT_CONTINUITY_LIMITS,
      maxTurns: 40,
      maxChars: 300,
    });
    const text = renderCheckpoint(cp, {
      ...DEFAULT_CONTINUITY_LIMITS,
      maxTurns: 40,
      maxChars: 300,
    });
    expect(text.length).toBeLessThanOrEqual(300);
    // The newest turn survives; earlier ones are explicitly counted, not silently dropped.
    expect(text).toContain("39");
  });

  it("is a no-op when there are no new turns", () => {
    const cp = emptyCheckpoint("2026-11-16T10:00:00Z");
    expect(foldCheckpoint(cp, [])).toBe(cp);
  });

  it("does not mutate its input", () => {
    const before: Checkpoint = emptyCheckpoint("2026-11-16T10:00:00Z");
    const snapshot = structuredClone(before);
    foldCheckpoint(before, [T("owner", "hi")]);
    withPinned(before, ["x"]);
    expect(before).toEqual(snapshot);
  });
});
