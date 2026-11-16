// Tests for the debrief-to-skill loop (§5.1 -> §7.6). Invariant: a task with no evidence never
// becomes a skill — the loop must not learn from unverified work.
import { describe, expect, it } from "vitest";
import { createTask, type TaskRecord } from "../tasks/ledger.js";
import { decidePromotion } from "./promotion.js";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    ...createTask(
      { owner: "owner", goal: "summarize inbox", approvedTools: ["mail"] },
      "2026-11-13T00:00:00Z",
    ),
    ...overrides,
  };
}

describe("decidePromotion", () => {
  it("promotes a done task with evidence and tools", () => {
    const t = task({ status: "done", evidence: ["brief sent at 08:00"] });
    const d = decidePromotion(t);
    expect(d.promote).toBe(true);
    expect(d.candidate?.goal).toBe("summarize inbox");
    expect(d.candidate?.tools).toEqual(["mail"]);
    expect(d.candidate?.stage).toBe("detected");
  });

  it("refuses a task that is not done", () => {
    expect(decidePromotion(task({ status: "running", evidence: ["x"] })).promote).toBe(false);
  });

  it("refuses a done task with no evidence", () => {
    const d = decidePromotion(task({ status: "done", evidence: [] }));
    expect(d.promote).toBe(false);
    expect(d.reason).toContain("no evidence");
  });

  it("refuses a task that used no tools", () => {
    const t = task({ status: "done", evidence: ["x"], approvedTools: [] });
    expect(decidePromotion(t).promote).toBe(false);
  });
});
