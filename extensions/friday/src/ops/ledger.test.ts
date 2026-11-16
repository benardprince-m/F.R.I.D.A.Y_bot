// Tests for the spend ledger and budget ceiling (C-04, C-05). Invariant: cost is derived from
// reported tokens only, and the ceiling refuses the next call exactly at the limit.
import { describe, expect, it } from "vitest";
import {
  costOf,
  decideBudget,
  monthKey,
  monthToDateUsd,
  recordUsage,
  spendLine,
  type LedgerSnapshot,
} from "./ledger.js";

const EMPTY: LedgerSnapshot = { month: "2026-11", entries: [] };

describe("cost ledger", () => {
  it("derives cost from reported tokens for a known model", () => {
    // gemini-2.5-flash: $0.30/M input, $2.50/M output.
    const cost = costOf({
      provider: "gemini",
      model: "gemini-2.5-flash",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2.8, 6);
  });

  it("charges zero for an unknown model rather than guessing", () => {
    expect(costOf({ provider: "x", model: "mystery-1", inputTokens: 1000 })).toBe(0);
  });

  it("matches a versioned id against its base price", () => {
    const versioned = costOf({
      provider: "g",
      model: "gemini-2.5-flash-001",
      inputTokens: 1_000_000,
    });
    expect(versioned).toBeCloseTo(0.3, 6);
  });

  it("accumulates and rolls over on month change", () => {
    let s = recordUsage(
      EMPTY,
      { provider: "g", model: "gemini-2.5-flash", inputTokens: 1_000_000 },
      "2026-11-02T00:00:00Z",
    );
    expect(monthToDateUsd(s)).toBeCloseTo(0.3, 6);
    s = recordUsage(
      s,
      { provider: "g", model: "gemini-2.5-flash", inputTokens: 1_000_000 },
      "2026-12-01T00:00:00Z",
    );
    expect(s.month).toBe("2026-12");
    expect(monthToDateUsd(s)).toBeCloseTo(0.3, 6);
  });

  it("allows every call when no ceiling is configured", () => {
    expect(decideBudget(EMPTY, undefined).allowed).toBe(true);
  });

  it("refuses the next call at the ceiling and names the spend", () => {
    const s: LedgerSnapshot = {
      month: "2026-11",
      entries: [{ at: "2026-11-01T00:00:00Z", provider: "g", model: "m", costUsd: 10 }],
    };
    const decision = decideBudget(s, 10);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("10.00");
  });

  it("allows a call with headroom and reports what remains", () => {
    const s: LedgerSnapshot = {
      month: "2026-11",
      entries: [{ at: "2026-11-01T00:00:00Z", provider: "g", model: "m", costUsd: 4 }],
    };
    const decision = decideBudget(s, 10);
    expect(decision.allowed).toBe(true);
    expect(decision.remainingUsd).toBeCloseTo(6, 6);
  });

  it("renders the month key and the spend line", () => {
    expect(monthKey("2026-11-13T12:00:00Z")).toBe("2026-11");
    expect(spendLine(EMPTY, 10)).toContain("of $10.00");
    expect(spendLine(EMPTY, undefined)).toContain("no ceiling");
  });
});
