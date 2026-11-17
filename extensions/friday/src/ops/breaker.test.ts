import { describe, expect, it } from "vitest";
import {
  admit,
  breakerLine,
  DEFAULT_BREAKER,
  newBreaker,
  recordOutcome,
  type BreakerState,
} from "./breaker.js";

const P = { failureThreshold: 3, cooldownMs: 1000 };

function trip(): BreakerState {
  let s = newBreaker();
  s = recordOutcome(s, false, 0, P);
  s = recordOutcome(s, false, 0, P);
  s = recordOutcome(s, false, 0, P);
  return s;
}

describe("circuit breaker", () => {
  it("admits while closed and resets failures on success", () => {
    let s = newBreaker();
    expect(admit(s, 0, P).allowed).toBe(true);
    s = recordOutcome(s, false, 0, P);
    expect(s).toMatchObject({ status: "closed", consecutiveFailures: 1 });
    s = recordOutcome(s, true, 0, P);
    expect(s).toEqual({ status: "closed", consecutiveFailures: 0 });
  });

  it("opens after the failure threshold", () => {
    expect(trip()).toMatchObject({ status: "open", openedAt: 0 });
  });

  it("refuses calls while open, before the cooldown", () => {
    const decision = admit(trip(), 500, P);
    expect(decision.allowed).toBe(false);
    expect(decision.state.status).toBe("open");
  });

  it("moves to half-open and admits one probe after the cooldown", () => {
    const decision = admit(trip(), 1000, P);
    expect(decision.allowed).toBe(true);
    expect(decision.state).toMatchObject({ status: "half-open", probeInFlight: true });
  });

  it("admits only one probe at a time while half-open", () => {
    const probing = admit(trip(), 1000, P).state;
    expect(admit(probing, 1100, P).allowed).toBe(false);
  });

  it("closes on a successful probe", () => {
    const probing = admit(trip(), 1000, P).state;
    expect(recordOutcome(probing, true, 1000, P)).toEqual({
      status: "closed",
      consecutiveFailures: 0,
    });
  });

  it("reopens and restarts the cooldown on a failed probe", () => {
    const probing = admit(trip(), 1000, P).state;
    const reopened = recordOutcome(probing, false, 1200, P);
    expect(reopened).toMatchObject({ status: "open", openedAt: 1200 });
    expect(admit(reopened, 1500, P).allowed).toBe(false);
  });

  it("ignores outcomes while open (no call was admitted)", () => {
    const open = trip();
    expect(recordOutcome(open, true, 10, P)).toBe(open);
  });

  it("names a tripped provider, and stays silent when closed", () => {
    expect(breakerLine("ollama", newBreaker())).toBeUndefined();
    expect(breakerLine("ollama", trip())).toContain("open");
    expect(breakerLine("ollama", admit(trip(), 1000, P).state)).toContain("half-open");
  });

  it("uses a sane default policy", () => {
    expect(DEFAULT_BREAKER.failureThreshold).toBeGreaterThan(1);
    expect(DEFAULT_BREAKER.cooldownMs).toBeGreaterThan(0);
  });
});
