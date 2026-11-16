// Tests for the cheap-first router and verifier (C-01, C-03). Invariant: with no local provider
// nothing changes; escalation never happens under lockdown or a spent budget.
import { describe, expect, it } from "vitest";
import { classifyTurn, routeTurn, verifyLocalAnswer, type RouterState } from "./router.js";

const LOCAL = { localProvider: "ollama", localModel: "llama3.3:8b" };
const FULL = {
  ...LOCAL,
  escalateProvider: "openai",
  escalateModel: "gpt-4o",
};
const FREE: RouterState = { lockedDown: false, budgetAllowed: true };

describe("classifyTurn", () => {
  it("treats a short greeting as trivial", () => {
    expect(classifyTurn("hi")).toBe("trivial");
  });
  it("treats a hard keyword as hard", () => {
    expect(classifyTurn("debug this failure")).toBe("hard");
  });
  it("treats a long prompt as hard", () => {
    expect(classifyTurn("word ".repeat(130))).toBe("hard");
  });
});

describe("routeTurn", () => {
  it("uses the engine default when no local provider is configured", () => {
    const d = routeTurn("hello", {}, FREE);
    expect(d.tier).toBe("default");
    expect(d.provider).toBeUndefined();
  });

  it("serves a trivial turn locally", () => {
    const d = routeTurn("hi", LOCAL, FREE);
    expect(d.tier).toBe("local");
    expect(d.provider).toBe("ollama");
  });

  it("escalates a hard turn when allowed and a target exists", () => {
    const d = routeTurn("debug this", FULL, FREE);
    expect(d.tier).toBe("escalate");
    expect(d.model).toBe("gpt-4o");
  });

  it("keeps a hard turn local under lockdown", () => {
    const d = routeTurn("debug this", FULL, { lockedDown: true, budgetAllowed: true });
    expect(d.tier).toBe("local");
    expect(d.reason).toContain("lockdown");
  });

  it("keeps a hard turn local when the budget is spent", () => {
    const d = routeTurn("debug this", FULL, { lockedDown: false, budgetAllowed: false });
    expect(d.tier).toBe("local");
    expect(d.reason).toContain("budget");
  });
});

describe("verifyLocalAnswer", () => {
  it("accepts a normal answer", () => {
    expect(verifyLocalAnswer("Here is the answer.").accepted).toBe(true);
  });
  it("rejects an empty answer", () => {
    expect(verifyLocalAnswer("   ").accepted).toBe(false);
  });
  it("rejects an answer that admits uncertainty", () => {
    expect(verifyLocalAnswer("I'm not sure about that.").accepted).toBe(false);
  });
  it("rejects a truncated answer", () => {
    expect(verifyLocalAnswer("The result is...").accepted).toBe(false);
  });
});
