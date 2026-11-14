// Tests for the phone-only secret-intake parser. The invariant under test: a pasted
// credential is captured for storage, the reply NEVER contains the value, and the caller is
// told to delete the message.
import { describe, expect, it } from "vitest";
import { parseSecretIntake } from "./secret-intake.js";

describe("parseSecretIntake", () => {
  it("captures a simple name and value, and asks for message deletion", () => {
    const r = parseSecretIntake("/secret TELEGRAM_BOT_TOKEN 123456:ABC-DEF");
    expect(r.kind).toBe("store");
    if (r.kind !== "store") {
      return;
    }
    expect(r.name).toBe("TELEGRAM_BOT_TOKEN");
    expect(r.value).toBe("123456:ABC-DEF");
    expect(r.deleteMessage).toBe(true);
  });

  it("never echoes the value in the reply", () => {
    const secret = "123456:ABC-DEF_very_secret";
    const r = parseSecretIntake(`/secret TELEGRAM_BOT_TOKEN ${secret}`);
    expect(r.kind).toBe("store");
    if (r.kind !== "store") {
      return;
    }
    expect(r.reply).not.toContain(secret);
    expect(r.reply).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("accepts a multi-line value (e.g. a PEM key)", () => {
    const pem = "-----BEGIN KEY-----\nabc\n-----END KEY-----";
    const r = parseSecretIntake(`/secret MY_KEY ${pem}`);
    expect(r.kind).toBe("store");
    if (r.kind !== "store") {
      return;
    }
    expect(r.value).toBe(pem);
  });

  it("accepts the 'set' keyword", () => {
    const r = parseSecretIntake("/secret set OPENAI_API_KEY sk-abc");
    expect(r.kind).toBe("store");
    if (r.kind !== "store") {
      return;
    }
    expect(r.name).toBe("OPENAI_API_KEY");
    expect(r.value).toBe("sk-abc");
  });

  it("returns help for a bare /secret", () => {
    expect(parseSecretIntake("/secret").kind).toBe("help");
  });

  it("rejects a lower-case or invalid name with guidance", () => {
    const r = parseSecretIntake("/secret telegram_token abc");
    expect(r.kind).toBe("help");
  });

  it("asks for a value when only a name is given", () => {
    const r = parseSecretIntake("/secret TELEGRAM_BOT_TOKEN");
    expect(r.kind).toBe("help");
    if (r.kind !== "help") {
      return;
    }
    expect(r.reply).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("ignores ordinary messages", () => {
    expect(parseSecretIntake("hello FRIDAY").kind).toBe("ignore");
    expect(parseSecretIntake("what's my schedule?").kind).toBe("ignore");
  });

  it("does not treat a mid-message mention as a command", () => {
    expect(parseSecretIntake("can you run /secret for me").kind).toBe("ignore");
  });
});
