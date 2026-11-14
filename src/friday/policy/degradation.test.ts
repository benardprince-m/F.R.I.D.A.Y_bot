// Tests for the degradation ladder (§7.9). Invariant: FRIDAY reports the true tier and
// status, and never says "healthy" when a component is not up.
import { describe, expect, it } from "vitest";
import { capabilityTier, healthReport, type ComponentHealth } from "./degradation.js";

const allUp: ComponentHealth[] = [
  { name: "model", state: "up" },
  { name: "telegram", state: "up" },
  { name: "memory", state: "up" },
];

describe("degradation ladder", () => {
  it("is full and healthy when all components are up", () => {
    const r = healthReport(allUp);
    expect(r.tier).toBe("full");
    expect(r.status).toBe("healthy");
    expect(r.summary).toContain("Healthy");
  });

  it("is reduced when one non-core component degrades", () => {
    const r = healthReport([...allUp, { name: "sandbox", state: "degraded" }]);
    expect(r.tier).toBe("reduced");
    expect(r.status).toBe("degraded");
  });

  it("is low-power and an incident when a core component is down", () => {
    const r = healthReport([
      { name: "model", state: "down" },
      { name: "telegram", state: "up" },
      { name: "memory", state: "up" },
    ]);
    expect(r.tier).toBe("low-power");
    expect(r.status).toBe("incident");
    expect(r.summary).toContain("model=down");
  });

  it("is offline when every core component is down", () => {
    const r = healthReport([
      { name: "model", state: "down" },
      { name: "telegram", state: "down" },
      { name: "memory", state: "down" },
    ]);
    expect(r.tier).toBe("offline");
    expect(r.status).toBe("incident");
  });

  it("keeps messaging available unless telegram is down", () => {
    expect(healthReport(allUp).messagingAvailable).toBe(true);
    expect(
      healthReport([
        { name: "model", state: "down" },
        { name: "telegram", state: "down" },
        { name: "memory", state: "up" },
      ]).messagingAvailable,
    ).toBe(false);
  });

  it("never reports healthy when something is not up", () => {
    const r = healthReport([{ name: "model", state: "degraded" }, ...allUp.slice(1)]);
    expect(r.status).not.toBe("healthy");
  });

  it("names the degraded component and its note in the summary", () => {
    const r = healthReport([
      { name: "model", state: "degraded", note: "failover to local" },
      { name: "telegram", state: "up" },
      { name: "memory", state: "up" },
    ]);
    expect(r.summary).toContain("model=degraded");
    expect(r.summary).toContain("failover to local");
  });

  it("treats an empty component list as full", () => {
    expect(capabilityTier([])).toBe("full");
  });
});
