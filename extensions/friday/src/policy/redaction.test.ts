// FRIDAY core tests: PII/secret filter (F-01). Proves redaction before egress and that
// raw secrets never survive into the output.
import { describe, expect, it } from "vitest";
import { redactForEgress } from "./redaction.js";

describe("redactForEgress", () => {
  it("redacts an email and reports the finding", () => {
    const result = redactForEgress("contact me at benard@example.com please");
    expect(result.text).not.toContain("benard@example.com");
    expect(result.text).toContain("[[EMAIL_1]]");
    expect(result.findings).toEqual([{ kind: "email", token: "[[EMAIL_1]]" }]);
    expect(result.blocked).toBe(false);
  });

  it("blocks and redacts a hard credential (API key)", () => {
    const result = redactForEgress("use key sk-abcdef0123456789abcdef for the call");
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("sk-abcdef0123456789abcdef");
    expect(result.findings.some((f) => f.kind === "api-key")).toBe(true);
  });

  it("redacts a PEM private key block entirely", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    const result = redactForEgress(`here it is:\n${pem}`);
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("MIIEowIBAAKCAQEA");
    expect(result.text).toContain("[[PRIVATE_KEY_1]]");
  });

  it("redacts a GitHub token", () => {
    const result = redactForEgress("token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  });

  it("is deterministic: identical input yields identical tokens", () => {
    const a = redactForEgress("a@b.com and c@d.com");
    const b = redactForEgress("a@b.com and c@d.com");
    expect(a.text).toBe(b.text);
    expect(a.findings).toEqual(b.findings);
  });

  it("assigns distinct tokens to distinct values in one call", () => {
    const result = redactForEgress("first a@b.com then c@d.com");
    expect(result.text).toContain("[[EMAIL_1]]");
    expect(result.text).toContain("[[EMAIL_2]]");
  });

  it("honours an explicit allow for a non-hard kind", () => {
    const result = redactForEgress("reach me at keep@example.com", { allow: ["email"] });
    expect(result.text).toContain("keep@example.com");
    expect(result.findings).toHaveLength(0);
  });

  it("does not let an allow bypass a hard credential", () => {
    const result = redactForEgress("key sk-abcdef0123456789abcdef", { allow: ["api-key"] });
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("sk-abcdef0123456789abcdef");
  });

  it("leaves ordinary prose untouched", () => {
    const result = redactForEgress("Remind me to revise for the biology test tomorrow.");
    expect(result.text).toBe("Remind me to revise for the biology test tomorrow.");
    expect(result.findings).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });

  it("does not mistake an ISO date for a phone number", () => {
    const text = "remind me on 2026-11-18 to submit 12 forms";
    const result = redactForEgress(text);
    expect(result.text).toBe(text);
    expect(result.findings).toHaveLength(0);
  });

  it("still redacts a real phone number (with or without a country code)", () => {
    expect(redactForEgress("call me on 0801 234 5678").findings).toEqual([
      { kind: "phone", token: "[[PHONE_1]]" },
    ]);
    expect(redactForEgress("reach me at +1 (555) 123-4567").findings).toEqual([
      { kind: "phone", token: "[[PHONE_1]]" },
    ]);
  });
});
