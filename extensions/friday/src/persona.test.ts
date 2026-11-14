import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeSystemContext, loadSystemContext } from "./persona.js";

describe("composeSystemContext", () => {
  it("orders persona before constitution and joins with a blank line", () => {
    expect(composeSystemContext({ persona: "P", constitution: "C" })).toBe("P\n\nC");
  });

  it("omits empty sections", () => {
    expect(composeSystemContext({ persona: "P" })).toBe("P");
    expect(composeSystemContext({})).toBe("");
  });

  it("is deterministic for the same inputs", () => {
    const a = composeSystemContext({ persona: "P", constitution: "C" });
    const b = composeSystemContext({ persona: "P", constitution: "C" });
    expect(a).toBe(b);
  });
});

describe("loadSystemContext", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "friday-persona-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loads PERSONA.md and CONSTITUTION.md when present", () => {
    writeFileSync(path.join(dir, "PERSONA.md"), "persona body");
    writeFileSync(path.join(dir, "CONSTITUTION.md"), "constitution body");
    expect(loadSystemContext(dir)).toBe("persona body\n\nconstitution body");
  });

  it("returns empty text when the files are missing", () => {
    expect(loadSystemContext(dir)).toBe("");
  });
});
