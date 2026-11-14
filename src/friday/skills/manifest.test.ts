// Tests for the skill manifest validation (§6.3). Invariant: an incomplete or unsafe
// manifest cannot be registered; customer and credential data classes are rejected.
import { describe, expect, it } from "vitest";
import { validateManifest, type SkillManifest } from "./manifest.js";

const good: SkillManifest = {
  name: "rss-reader",
  version: "1.0.0",
  description: "Read public RSS feeds",
  permissions: ["network:read"],
  dataClasses: ["public"],
  egress: ["example.com"],
  costUsdPerMonth: 0,
  failureBehavior: "retry-backoff",
  disablePath: "remove skills/rss-reader",
};

describe("skill manifest", () => {
  it("accepts a complete, safe manifest", () => {
    const r = validateManifest(good);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a missing name or bad name format", () => {
    expect(validateManifest({ ...good, name: undefined }).valid).toBe(false);
    expect(validateManifest({ ...good, name: "RSS_Reader" }).valid).toBe(false);
  });

  it("rejects an undeclared permission set", () => {
    expect(validateManifest({ ...good, permissions: [] }).valid).toBe(false);
  });

  it("rejects a customer data class (DeepMark boundary open)", () => {
    const r = validateManifest({ ...good, dataClasses: ["customer"] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("DeepMark");
  });

  it("rejects a credential data class", () => {
    const r = validateManifest({ ...good, dataClasses: ["credential"] });
    expect(r.valid).toBe(false);
  });

  it("warns on a paid skill but does not block registration", () => {
    const r = validateManifest({ ...good, costUsdPerMonth: 5 });
    expect(r.valid).toBe(true);
    expect(r.warnings.join(" ")).toContain("owner approval");
  });

  it("requires a disable path", () => {
    expect(validateManifest({ ...good, disablePath: "" }).valid).toBe(false);
  });

  it("requires a valid failure behavior", () => {
    expect(validateManifest({ ...good, failureBehavior: undefined }).valid).toBe(false);
  });

  it("treats an empty egress array as a valid local skill", () => {
    expect(validateManifest({ ...good, egress: [] }).valid).toBe(true);
  });
});
