import { describe, expect, it } from "vitest";
import { buildDoctorReport, type DoctorInput } from "./doctor.js";

const healthy: DoctorInput = {
  ownerConfigured: true,
  personaPresent: true,
  continuityStoreAvailable: true,
  lockedDown: false,
  localRoutingConfigured: true,
};

describe("buildDoctorReport", () => {
  it("never claims healthy while core engine surfaces are unverified", () => {
    const report = buildDoctorReport(healthy);
    expect(report.status).toBe("degraded");
    expect(report.summary).toContain("not verified from chat");
    expect(report.unverified).toContain("model");
  });

  it("names the missing owner identity as down and incident", () => {
    const report = buildDoctorReport({ ...healthy, ownerConfigured: false });
    expect(report.status).toBe("incident");
    expect(report.lines.join("\n")).toContain("owner: down");
  });

  it("reports missing persona and continuity as degraded", () => {
    const report = buildDoctorReport({
      ...healthy,
      personaPresent: false,
      continuityStoreAvailable: false,
    });
    const text = report.lines.join("\n");
    expect(text).toContain("persona: degraded");
    expect(text).toContain("continuity: degraded");
    expect(report.status).toBe("degraded");
  });

  it("surfaces lockdown and routing state honestly", () => {
    const report = buildDoctorReport({
      ...healthy,
      lockedDown: true,
      localRoutingConfigured: false,
    });
    const text = report.lines.join("\n");
    expect(text).toContain("lockdown: on");
    expect(text).toContain("routing: default");
  });

  it("always points the owner to the host doctor for unverified surfaces", () => {
    expect(buildDoctorReport(healthy).lines.join("\n")).toContain("openclaw doctor");
  });
});
