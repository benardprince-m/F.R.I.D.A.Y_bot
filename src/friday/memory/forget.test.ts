// FRIDAY core tests: forget-with-evidence (B-04).
import { describe, expect, it } from "vitest";
import { forget, renderForgetReport, type MemoryLayer } from "./forget.js";

function layers(): MemoryLayer[] {
  return [
    {
      name: "core",
      entries: [
        { id: "c1", text: "Owner is Benard Prince." },
        { id: "c2", text: "Likes math." },
      ],
    },
    { name: "episodic", entries: [{ id: "e1", text: "Talked about Benard's project." }] },
    { name: "semantic", entries: [{ id: "s1", text: "Benard attends a boarding school." }] },
  ];
}

describe("forget", () => {
  it("purges matches across every layer and reports completeness", () => {
    const { layers: after, report } = forget(layers(), "Benard");
    expect(report.totalPurged).toBe(3);
    expect(report.complete).toBe(true);
    expect(report.remainingMatches).toHaveLength(0);
    expect(after.every((l) => l.entries.every((e) => !e.text.includes("Benard")))).toBe(true);
  });

  it("reports nothing purged for a non-matching query", () => {
    const { report } = forget(layers(), "zebra");
    expect(report.totalPurged).toBe(0);
    expect(report.complete).toBe(true);
  });

  it("renders a truthful completion message", () => {
    const { report } = forget(layers(), "Benard");
    const text = renderForgetReport(report);
    expect(text).toContain("Purged 3 record(s)");
    expect(text).toContain("Verified: no matches remain");
  });

  it("is case-insensitive", () => {
    const { report } = forget(layers(), "benard");
    expect(report.totalPurged).toBe(3);
  });
});
