// FRIDAY core tests: task ledger + honest debrief (E-01/E-04).
import { describe, expect, it } from "vitest";
import { createTask, renderDebrief, renderTaskList, resume } from "./ledger.js";

const now = "2026-11-13T12:00:00Z";

describe("task ledger", () => {
  it("creates a planned record with approved tools", () => {
    const t = createTask(
      { owner: "benard", goal: "Draft a revision timetable", approvedTools: ["notes"] },
      now,
    );
    expect(t.status).toBe("planned");
    expect(t.approvedTools).toEqual(["notes"]);
    expect(t.startedAt).toBe(now);
    expect(t.id).toMatch(/^task-/);
  });

  it("resumes from a checkpoint after restart", () => {
    const t = createTask({ owner: "benard", goal: "Long job", approvedTools: [] }, now);
    const r = resume(t, "step-3");
    expect(r.status).toBe("running");
    expect(r.checkpoint).toBe("step-3");
  });

  it("renders a done task with proof as done", () => {
    const t = {
      ...createTask({ owner: "benard", goal: "Check the build", approvedTools: [] }, now),
      status: "done" as const,
      evidence: ["pnpm build → exit 0"],
    };
    const text = renderDebrief(t);
    expect(text).toContain("Outcome: done");
    expect(text).toContain("pnpm build → exit 0");
  });

  it("demotes a done task with no evidence to partial", () => {
    const t = {
      ...createTask({ owner: "benard", goal: "Do the thing", approvedTools: [] }, now),
      status: "done" as const,
    };
    const text = renderDebrief(t);
    expect(text).toContain("Outcome: partial");
    expect(text).toContain("marked done without evidence");
  });

  it("asks for the owner's decision when waiting", () => {
    const t = {
      ...createTask({ owner: "benard", goal: "Publish post", approvedTools: [] }, now),
      status: "waiting-owner" as const,
    };
    expect(renderDebrief(t)).toContain("your decision");
  });

  it("reports cost against budget", () => {
    const t = {
      ...createTask({ owner: "benard", goal: "Research", approvedTools: [], budgetUsd: 2 }, now),
      costUsd: 0.35,
    };
    expect(renderDebrief(t)).toContain("$0.35 of $2.00 budget");
  });

  it("lists tasks newest first with status and id", () => {
    const older = createTask({ owner: "benard", goal: "Older", approvedTools: [] }, now);
    const newer = {
      ...createTask({ owner: "benard", goal: "Newer", approvedTools: [] }, "2026-11-14T12:00:00Z"),
      status: "done" as const,
      evidence: ["x"],
    };
    const text = renderTaskList([older, newer]);
    expect(text.split("\n")).toEqual([
      `[done] Newer — ${newer.id}`,
      `[planned] Older — ${older.id}`,
    ]);
  });

  it("says so when there are no tasks", () => {
    expect(renderTaskList([])).toBe("No tasks recorded.");
  });
});
