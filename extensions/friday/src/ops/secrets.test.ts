// Tests for the chat-driven secret store (G-06, F-04). Invariant: a secret name can never
// escape the secret directory, and a value is never echoed.
import { describe, expect, it } from "vitest";
import { planSecretWrite, secretStoredReply } from "./secrets.js";

describe("planSecretWrite", () => {
  it("resolves a valid name to a file inside the secret directory", () => {
    const plan = planSecretWrite("/srv/friday/.secrets", "TELEGRAM_BOT_TOKEN", "123:ABC");
    expect(plan).toEqual({
      ok: true,
      name: "TELEGRAM_BOT_TOKEN",
      filePath: "/srv/friday/.secrets/TELEGRAM_BOT_TOKEN.secret",
      content: "123:ABC\n",
    });
  });

  it("preserves a multi-line value verbatim (PEM keys)", () => {
    const pem = "-----BEGIN KEY-----\nAAAA\n-----END KEY-----";
    const plan = planSecretWrite("/s", "VAULT_KEY", pem);
    expect(plan.ok && plan.content).toBe(`${pem}\n`);
  });

  it("rejects a name with path separators or traversal", () => {
    for (const name of ["../evil", "a/b", "A.B", ".HIDDEN", "1BAD", "lower", "A"]) {
      const plan = planSecretWrite("/s", name, "v");
      expect(plan.ok).toBe(false);
    }
  });

  it("rejects an empty value", () => {
    expect(planSecretWrite("/s", "TOKEN", "").ok).toBe(false);
  });

  it("never includes the value in the confirmation", () => {
    expect(secretStoredReply("TOKEN")).not.toContain("secret-value");
    expect(secretStoredReply("TOKEN")).toContain("TOKEN");
  });
});
