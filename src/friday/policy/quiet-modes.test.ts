// Tests for quiet modes and the escalation ceiling (MSG-06, §5.3). Invariant: quiet modes
// queue non-emergencies; only an emergency overrides; follow-ups are capped at one.
import { describe, expect, it } from "vitest";
import { decideDelivery, mayFollowUp, type OwnerMode } from "./quiet-modes.js";

describe("quiet modes", () => {
  it("delivers everything when the owner is free", () => {
    expect(decideDelivery("free", "routine").action).toBe("deliver");
    expect(decideDelivery("free", "urgent").action).toBe("deliver");
  });

  it("queues routine and urgent items in school mode", () => {
    expect(decideDelivery("school", "routine").action).toBe("queue");
    expect(decideDelivery("school", "urgent").action).toBe("queue");
  });

  it("queues non-emergencies in focus, dnd, and sleep", () => {
    for (const mode of ["focus", "dnd", "sleep"] as OwnerMode[]) {
      expect(decideDelivery(mode, "routine").action).toBe("queue");
      expect(decideDelivery(mode, "urgent").action).toBe("queue");
    }
  });

  it("lets an emergency override every quiet mode", () => {
    for (const mode of ["school", "focus", "dnd", "sleep"] as OwnerMode[]) {
      const d = decideDelivery(mode, "emergency");
      expect(d.action).toBe("deliver");
      expect(d.allowFollowUp).toBe(true);
    }
  });

  it("does not allow a follow-up for a queued routine item", () => {
    expect(decideDelivery("school", "routine").allowFollowUp).toBe(false);
  });

  it("caps follow-ups at one (two pings total)", () => {
    expect(mayFollowUp({ pingsSent: 0 })).toBe(true);
    expect(mayFollowUp({ pingsSent: 1 })).toBe(true);
    expect(mayFollowUp({ pingsSent: 2 })).toBe(false);
    expect(mayFollowUp({ pingsSent: 5 })).toBe(false);
  });
});
