// FRIDAY core tests: owner admission (A-01). Proves fail-closed behaviour for MSG-01.
import { describe, expect, it } from "vitest";
import { decideAdmission } from "./owner-auth.js";

const owner = [{ channel: "telegram", senderId: "12345" }];

describe("decideAdmission", () => {
  it("admits the exact owner with tools and memory", () => {
    const d = decideAdmission({ channel: "telegram", senderId: "12345" }, owner);
    expect(d.admission).toBe("owner");
    expect(d.allowTools).toBe(true);
    expect(d.allowMemory).toBe(true);
  });

  it("denies an unknown sender with no tools and no memory", () => {
    const d = decideAdmission({ channel: "telegram", senderId: "99999" }, owner);
    expect(d.admission).toBe("denied");
    expect(d.allowTools).toBe(false);
    expect(d.allowMemory).toBe(false);
  });

  it("denies the same id on a different channel", () => {
    const d = decideAdmission({ channel: "discord", senderId: "12345" }, owner);
    expect(d.admission).toBe("denied");
  });

  it("fails closed when no owner is configured", () => {
    const d = decideAdmission({ channel: "telegram", senderId: "12345" }, []);
    expect(d.admission).toBe("denied");
    expect(d.allowTools).toBe(false);
  });

  it("does not leak the sender id into the reason", () => {
    const d = decideAdmission({ channel: "telegram", senderId: "99999" }, owner);
    expect(d.reason).not.toContain("99999");
  });
});
