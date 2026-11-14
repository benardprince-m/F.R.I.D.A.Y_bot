// Tests for the protected-file integrity check (§7.5). The invariant: any unexpected change
// to a protected file produces a violation and an alert; a matching baseline is clean.
import { describe, expect, it } from "vitest";
import { buildBaseline, checkIntegrity, hashContent, renderIntegrityReport } from "./integrity.js";

const CONSTITUTION = "# FRIDAY Constitution\nnever lie\n";
const PERSONA = "# FRIDAY Persona\naddress as sir\n";

describe("integrity", () => {
  it("reports clean when files match the baseline", () => {
    const files = [
      { path: "CONSTITUTION.md", content: CONSTITUTION },
      { path: "PERSONA.md", content: PERSONA },
    ];
    const baseline = buildBaseline(files);
    const report = checkIntegrity(files, baseline);
    expect(report.clean).toBe(true);
    expect(report.violations).toEqual([]);
    expect(renderIntegrityReport(report)).toContain("clean");
  });

  it("flags a changed protected file as a violation", () => {
    const baseline = buildBaseline([{ path: "CONSTITUTION.md", content: CONSTITUTION }]);
    const report = checkIntegrity(
      [{ path: "CONSTITUTION.md", content: CONSTITUTION + "tampered line\n" }],
      baseline,
    );
    expect(report.clean).toBe(false);
    expect(report.violations[0]?.status).toBe("changed");
    expect(renderIntegrityReport(report)).toContain("VIOLATION");
  });

  it("flags a missing protected file", () => {
    const baseline = buildBaseline([{ path: "CONSTITUTION.md", content: CONSTITUTION }]);
    const report = checkIntegrity([], baseline);
    expect(report.clean).toBe(false);
    expect(report.violations[0]?.status).toBe("missing");
  });

  it("flags a file not present in the baseline as unexpected", () => {
    const baseline = buildBaseline([{ path: "CONSTITUTION.md", content: CONSTITUTION }]);
    const report = checkIntegrity(
      [
        { path: "CONSTITUTION.md", content: CONSTITUTION },
        { path: "SNEAKY.md", content: "hidden instruction" },
      ],
      baseline,
    );
    expect(report.clean).toBe(false);
    expect(report.violations.map((v) => v.path)).toContain("SNEAKY.md");
  });

  it("never includes file contents in the alert, only hashes", () => {
    const baseline = buildBaseline([{ path: "CONSTITUTION.md", content: CONSTITUTION }]);
    const report = checkIntegrity(
      [{ path: "CONSTITUTION.md", content: "secret tamper" }],
      baseline,
    );
    const msg = renderIntegrityReport(report);
    expect(msg).not.toContain("secret tamper");
    expect(msg).toContain("CONSTITUTION.md");
  });

  it("hashing is deterministic", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });
});
