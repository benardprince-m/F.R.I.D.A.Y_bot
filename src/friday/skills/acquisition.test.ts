// Tests for the acquisition protocol (§7.6). Invariant: no stage can be skipped, and
// production/paid access is impossible without explicit owner approval.
import { describe, expect, it } from "vitest";
import { mayAdvance, type AcquisitionRecord } from "./acquisition.js";

const base: AcquisitionRecord = {
  id: "acq-1",
  gap: "read a public RSS feed",
  stage: "detected",
  existingIntegrationPreferred: false,
  assessmentPassed: false,
  sandboxClean: false,
  ownerApprovedProduction: false,
};

describe("acquisition protocol", () => {
  it("forbids skipping a stage", () => {
    expect(mayAdvance(base, "sandbox-tested").allowed).toBe(false);
  });

  it("forbids sandbox-testing before the assessment passes", () => {
    const r = mayAdvance({ ...base, stage: "researched" }, "assessed");
    expect(r.allowed).toBe(true);
    const blocked = mayAdvance({ ...base, stage: "assessed" }, "sandbox-tested");
    expect(blocked.allowed).toBe(false);
  });

  it("forbids registration without a clean sandbox test", () => {
    const r = mayAdvance(
      { ...base, stage: "sandbox-tested", sandboxClean: false, disablePath: "rm -rf skills/x" },
      "registered",
    );
    expect(r.allowed).toBe(false);
  });

  it("forbids registration without a disable path", () => {
    const r = mayAdvance(
      { ...base, stage: "sandbox-tested", sandboxClean: true, disablePath: "" },
      "registered",
    );
    expect(r.allowed).toBe(false);
  });

  it("permits registration with a clean sandbox and a disable path", () => {
    const r = mayAdvance(
      { ...base, stage: "sandbox-tested", sandboxClean: true, disablePath: "disable skill x" },
      "registered",
    );
    expect(r.allowed).toBe(true);
  });

  it("forbids production without explicit owner approval", () => {
    const r = mayAdvance(
      { ...base, stage: "registered", ownerApprovedProduction: false },
      "production-approved",
    );
    expect(r.allowed).toBe(false);
  });

  it("permits production with owner approval", () => {
    const r = mayAdvance(
      { ...base, stage: "registered", ownerApprovedProduction: true },
      "production-approved",
    );
    expect(r.allowed).toBe(true);
  });
});
