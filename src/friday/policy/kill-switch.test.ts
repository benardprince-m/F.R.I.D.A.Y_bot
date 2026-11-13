// FRIDAY core tests: lockdown kill switch (F-03).
import { describe, expect, it } from "vitest";
import { decideEgress } from "./kill-switch.js";

describe("decideEgress", () => {
  it("allows everything when not locked down", () => {
    expect(decideEgress("non-essential", { lockedDown: false })).toBe("allow");
    expect(decideEgress("owner-messaging", { lockedDown: false })).toBe("allow");
  });

  it("blocks non-essential traffic when locked down", () => {
    expect(decideEgress("non-essential", { lockedDown: true })).toBe("block");
  });

  it("keeps owner messaging open when locked down", () => {
    expect(decideEgress("owner-messaging", { lockedDown: true })).toBe("allow");
  });

  it("keeps essential system traffic open when locked down", () => {
    expect(decideEgress("essential", { lockedDown: true })).toBe("allow");
  });
});
