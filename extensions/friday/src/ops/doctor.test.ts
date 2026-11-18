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

  it("omits the integrity line when no integrity result is supplied", () => {
    expect(buildDoctorReport(healthy).lines.join("\n")).not.toContain("integrity:");
  });

  it("reports an integrity violation as down and incident", () => {
    const report = buildDoctorReport({ ...healthy, integrity: "violation" });
    expect(report.lines.join("\n")).toContain("integrity: VIOLATION");
    expect(report.components.find((c) => c.name === "integrity")?.state).toBe("down");
  });

  it("reports integrity unverified as degraded with the baseline hint", () => {
    const report = buildDoctorReport({ ...healthy, integrity: "unverified" });
    expect(report.lines.join("\n")).toContain("integrity: unverified");
    expect(report.lines.join("\n")).toContain("/trust-persona");
  });

  it("omits the heartbeat line until a liveness result is supplied", () => {
    expect(buildDoctorReport(healthy).lines.join("\n")).not.toContain("heartbeat:");
  });

  it("reports a beating heartbeat as up and a stopped one as down", () => {
    expect(buildDoctorReport({ ...healthy, heartbeat: true }).lines.join("\n")).toContain(
      "heartbeat: beating",
    );
    const down = buildDoctorReport({ ...healthy, heartbeat: false });
    expect(down.lines.join("\n")).toContain("heartbeat: DOWN");
    expect(down.components.find((c) => c.name === "heartbeat")?.state).toBe("down");
  });

  it("omits the model lines until a chain is supplied", () => {
    expect(buildDoctorReport(healthy).lines.join("\n")).not.toContain("fallbacks:");
  });

  it("shows the model chain in force, primary then fallbacks", () => {
    const report = buildDoctorReport({
      ...healthy,
      model: { primary: "deepseek/deepseek-v4.1-flash", fallbacks: ["google/gemini-2.5-flash"] },
    });
    const text = report.lines.join("\n");
    expect(text).toContain("model: deepseek/deepseek-v4.1-flash (primary)");
    expect(text).toContain("fallbacks: google/gemini-2.5-flash");
  });

  it("says 'none' when the chain has no fallbacks", () => {
    const report = buildDoctorReport({
      ...healthy,
      model: { primary: "deepseek/deepseek-v4.1-flash", fallbacks: [] },
    });
    expect(report.lines.join("\n")).toContain("fallbacks: none");
  });
});
