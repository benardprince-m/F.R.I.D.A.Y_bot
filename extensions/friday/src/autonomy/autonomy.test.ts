// FRIDAY autonomy tests: self-critique, the night-shift mission planner, and memory
// consolidation. These prove FRIDAY works its own queue and polices its own output.

import { describe, expect, it } from "vitest";
import { consolidateMemory, renderConsolidation } from "../memory/consolidate.js";
import type { StoredMemory } from "../memory/records.js";
import { critiqueAnswer, critiqueLine, mayShip } from "./critique.js";
import { planNightShift, renderPlan } from "./missions.js";

const NOW = Date.parse("2026-11-18T12:00:00Z");

function mem(over: Partial<StoredMemory> & { id: string; text: string }): StoredMemory {
  return {
    provenance: { source: "owner chat", date: "2026-01-01T00:00:00Z", confidence: "verified" },
    importance: 0.7,
    useCount: 0,
    lastUsed: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("autonomy self-critique", () => {
  it("ships a clean, evidenced answer", () => {
    const c = critiqueAnswer("Deployed. 3 files changed, 12 tests passed.");
    expect(c.verdict).toBe("ship");
    expect(mayShip(c)).toBe(true);
  });

  it("escalates an unsupported success claim (no evidence)", () => {
    const c = critiqueAnswer("Done — everything is fixed and deployed.");
    expect(c.verdict).toBe("escalate");
    expect(c.issues.map((i) => i.kind)).toContain("unsupported-success");
  });

  it("forces a revision when the draft leaks a credential", () => {
    const key = ["sk-", "abcdef0123456789abcdef"].join("");
    const c = critiqueAnswer(`here is the key ${key}`);
    expect(c.verdict).toBe("revise");
    expect(c.issues.map((i) => i.kind)).toContain("leak");
  });

  it("does not force a revision for benign PII (a date or an email)", () => {
    // A dated, evidenced answer is legitimate: generic PII must not trip the leak gate.
    expect(critiqueAnswer("Deployed on 2026-11-18. 12 tests passed.").verdict).toBe("ship");
    expect(critiqueAnswer("I emailed prince@example.com. 3 tests passed.").verdict).toBe("ship");
  });

  it("forces a revision on an empty draft", () => {
    expect(critiqueAnswer("").verdict).toBe("revise");
  });

  it("escalates when the model hedges", () => {
    const c = critiqueAnswer("I'm not sure about that one.");
    expect(c.verdict).toBe("escalate");
  });

  it("renders a one-line verdict", () => {
    expect(critiqueLine(critiqueAnswer("Deployed. 1 test passed."))).toContain("clean");
  });
});

describe("autonomy night-shift missions", () => {
  it("orders a running task above a planned one", () => {
    const plan = planNightShift({
      openTasks: [
        {
          id: "t1",
          owner: "o",
          goal: "planned thing",
          status: "planned",
          startedAt: "",
          approvedTools: [],
          evidence: [],
        },
        {
          id: "t2",
          owner: "o",
          goal: "running thing",
          status: "running",
          startedAt: "",
          approvedTools: [],
          evidence: [],
        },
      ],
      memoryNeedsConsolidation: false,
      openAcquisitions: [],
      wantsBrief: false,
      maxMissions: 5,
    });
    expect(plan[0]!.subject).toBe("running thing");
  });

  it("caps the plan at maxMissions", () => {
    const openTasks = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      owner: "o",
      goal: `goal ${i}`,
      status: "planned" as const,
      startedAt: "",
      approvedTools: [],
      evidence: [],
    }));
    const plan = planNightShift({
      openTasks,
      memoryNeedsConsolidation: true,
      openAcquisitions: [{ id: "a1", gap: "pdf parsing" }],
      wantsBrief: true,
      maxMissions: 3,
    });
    expect(plan).toHaveLength(3);
  });

  it("plans nothing when there is nothing to advance", () => {
    const plan = planNightShift({
      openTasks: [],
      memoryNeedsConsolidation: false,
      openAcquisitions: [],
      wantsBrief: false,
      maxMissions: 5,
    });
    expect(plan).toEqual([]);
    expect(renderPlan(plan)).toContain("nothing to advance");
  });
});

describe("autonomy memory consolidation", () => {
  it("merges near-duplicate facts, keeping the longer text", () => {
    const { records, report } = consolidateMemory(
      [
        mem({ id: "m1", text: "owner lives in London" }),
        mem({ id: "m2", text: "Owner lives in London, near the river" }),
      ],
      NOW,
    );
    expect(records).toHaveLength(1);
    expect(report.mergedAway).toBe(1);
    expect(records[0]!.text).toContain("near the river");
  });

  it("decays a stale, low-importance record but never an important one", () => {
    const stale = "2026-01-01T00:00:00Z"; // far more than 90 days before NOW
    const { records, report } = consolidateMemory(
      [
        mem({ id: "m1", text: "trivia", importance: 0.1, lastUsed: stale, createdAt: stale }),
        mem({ id: "m2", text: "important", importance: 0.9, lastUsed: stale, createdAt: stale }),
      ],
      NOW,
    );
    expect(report.decayed).toBe(1);
    expect(records.map((r) => r.id)).toEqual(["m2"]);
  });

  it("caps the store by score when over the limit", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      mem({ id: `m${i}`, text: `fact number ${i}`, importance: i / 10 }),
    );
    const { records: kept } = consolidateMemory(records, NOW, {
      decayAfterMs: 10 ** 12,
      decayImportance: 0,
      maxRecords: 2,
    });
    expect(kept).toHaveLength(2);
    expect(kept[0]!.importance).toBeGreaterThanOrEqual(kept[1]!.importance);
  });

  it("reports a no-op honestly", () => {
    const { report } = consolidateMemory([mem({ id: "m1", text: "one fact" })], NOW);
    expect(renderConsolidation(report)).toContain("nothing to consolidate");
  });
});
