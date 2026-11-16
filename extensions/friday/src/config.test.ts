import { describe, expect, it } from "vitest";
import manifest from "../openclaw.plugin.json" with { type: "json" };
import { parseFridayConfig } from "./config.js";

function sampleValue(key: string): unknown {
  if (key === "ownerIds") {
    return ["telegram:1"];
  }
  if (key === "lockedDown") {
    return true;
  }
  return "value";
}

describe("parseFridayConfig", () => {
  it("defaults to fail-closed: no owners, not locked down", () => {
    expect(parseFridayConfig(undefined)).toEqual({ ownerIds: [], lockedDown: false });
    expect(parseFridayConfig({})).toEqual({ ownerIds: [], lockedDown: false });
  });

  it("parses owner ids as channel:senderId pairs", () => {
    expect(parseFridayConfig({ ownerIds: ["telegram:12345", "discord:abc:def"] })).toEqual({
      ownerIds: [
        { channel: "telegram", senderId: "12345" },
        { channel: "discord", senderId: "abc:def" },
      ],
      lockedDown: false,
    });
  });

  it("rejects a malformed owner id rather than silently dropping it", () => {
    expect(() => parseFridayConfig({ ownerIds: ["telegram"] })).toThrow(/channel:senderId/);
    expect(() => parseFridayConfig({ ownerIds: [":123"] })).toThrow(/channel:senderId/);
    expect(() => parseFridayConfig({ ownerIds: [123] })).toThrow(/string/);
  });

  it("rejects unknown fields so a typo cannot weaken policy", () => {
    expect(() => parseFridayConfig({ ownerId: ["telegram:1"] })).toThrow(/unknown/);
  });

  it("carries lockedDown and personaDir through", () => {
    expect(parseFridayConfig({ lockedDown: true, personaDir: "/srv/friday" })).toEqual({
      ownerIds: [],
      lockedDown: true,
      personaDir: "/srv/friday",
    });
  });

  it("carries the local routing pair through and drops blank values", () => {
    expect(parseFridayConfig({ localProvider: "ollama", localModel: "llama3.3:8b" })).toEqual({
      ownerIds: [],
      lockedDown: false,
      localProvider: "ollama",
      localModel: "llama3.3:8b",
    });
    expect(parseFridayConfig({ localProvider: "  " })).toEqual({ ownerIds: [], lockedDown: false });
  });

  it("accepts exactly the fields the manifest schema declares", () => {
    const declared = Object.keys(manifest.configSchema.properties).toSorted();
    expect(declared).toEqual([
      "localModel",
      "localProvider",
      "lockedDown",
      "ownerIds",
      "personaDir",
    ]);
    for (const key of declared) {
      expect(() => parseFridayConfig({ [key]: sampleValue(key) })).not.toThrow();
    }
  });
});
