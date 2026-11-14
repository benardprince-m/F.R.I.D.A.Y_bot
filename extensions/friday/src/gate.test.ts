import type { AgentMessage } from "openclaw/plugin-sdk/agent-core";
import { describe, expect, it } from "vitest";
import type { FridayConfig } from "./config.js";
import { evaluateGate, isAdmittedOwner, redactUserMessage } from "./gate.js";

const OPEN: FridayConfig = { ownerIds: [], lockedDown: false };

function ownerTurn(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "hello",
    channelId: "telegram",
    senderId: "123",
    senderIsOwner: true,
    ...overrides,
  };
}

describe("isAdmittedOwner", () => {
  it("denies when the host does not vouch for the sender", () => {
    expect(isAdmittedOwner({ channel: "telegram", senderId: "123" }, false, [])).toBe(false);
  });

  it("admits any host-vouched sender when no pin is configured", () => {
    expect(isAdmittedOwner({ channel: "telegram", senderId: "123" }, true, [])).toBe(true);
  });

  it("narrows to the pinned owner set when configured", () => {
    const pin = [{ channel: "telegram", senderId: "123" }];
    expect(isAdmittedOwner({ channel: "telegram", senderId: "123" }, true, pin)).toBe(true);
    expect(isAdmittedOwner({ channel: "telegram", senderId: "999" }, true, pin)).toBe(false);
    expect(isAdmittedOwner({ channel: "discord", senderId: "123" }, true, pin)).toBe(false);
  });
});

describe("evaluateGate", () => {
  it("passes an owner channel turn", () => {
    expect(evaluateGate(ownerTurn(), OPEN)).toEqual({ outcome: "pass" });
  });

  it("blocks a channel turn the host does not vouch for", () => {
    const decision = evaluateGate(ownerTurn({ senderIsOwner: false }), OPEN);
    expect(decision).toMatchObject({ outcome: "block", category: "admission" });
  });

  it("blocks a non-owner when an owner pin is configured", () => {
    const cfg: FridayConfig = {
      ownerIds: [{ channel: "telegram", senderId: "123" }],
      lockedDown: false,
    };
    expect(evaluateGate(ownerTurn({ senderId: "999" }), cfg)).toMatchObject({
      outcome: "block",
      category: "admission",
    });
  });

  it("blocks an owner message that contains a hard credential", () => {
    const decision = evaluateGate(ownerTurn({ prompt: "my key is sk-abcdefghijklmnop" }), OPEN);
    expect(decision).toMatchObject({ outcome: "block", category: "credential" });
  });

  it("passes a system turn when not locked down", () => {
    expect(evaluateGate({ prompt: "heartbeat" }, OPEN)).toEqual({ outcome: "pass" });
  });

  it("blocks a system turn under lockdown", () => {
    const decision = evaluateGate({ prompt: "heartbeat" }, { ...OPEN, lockedDown: true });
    expect(decision).toMatchObject({ outcome: "block", category: "lockdown" });
  });

  it("still passes owner messaging under lockdown", () => {
    expect(evaluateGate(ownerTurn(), { ...OPEN, lockedDown: true })).toEqual({ outcome: "pass" });
  });
});

describe("redactUserMessage", () => {
  it("scrubs PII from an owner user message", () => {
    const message = {
      role: "user",
      content: "mail me at bob@example.com",
      timestamp: 0,
    } as AgentMessage;
    const next = redactUserMessage(message);
    expect(next).not.toBe(message);
    expect(next.content).toBe("mail me at [[EMAIL_1]]");
  });

  it("scrubs text parts of a multi-part user message", () => {
    const message = {
      role: "user",
      content: [{ type: "text", text: "bob@example.com" }],
      timestamp: 0,
    } as unknown as AgentMessage;
    const next = redactUserMessage(message);
    expect((next.content as { text: string }[])[0]!.text).toBe("[[EMAIL_1]]");
  });

  it("leaves an assistant message untouched", () => {
    const message = {
      role: "assistant",
      content: "bob@example.com",
      timestamp: 0,
    } as unknown as AgentMessage;
    expect(redactUserMessage(message)).toBe(message);
  });

  it("returns the same message when there is nothing to scrub", () => {
    const message = { role: "user", content: "no pii here", timestamp: 0 } as AgentMessage;
    expect(redactUserMessage(message)).toBe(message);
  });
});
