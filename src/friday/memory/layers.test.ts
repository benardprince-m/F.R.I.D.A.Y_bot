// Tests for the five-layer memory map (§7.4). Invariant: the vault is never a purgeable
// memory layer, and the four real memory layers are the ones "forget" targets.
import { describe, expect, it } from "vitest";
import { layerSpec, MEMORY_LAYERS, purgeableLayers } from "./layers.js";

describe("memory layers", () => {
  it("declares exactly the five spec layers", () => {
    expect(MEMORY_LAYERS.map((l) => l.name)).toEqual([
      "core-identity",
      "working",
      "episodic",
      "semantic",
      "vault",
    ]);
  });

  it("excludes the vault from forget-purge", () => {
    const purgeable = purgeableLayers();
    expect(purgeable).not.toContain("vault");
    expect(purgeable).toEqual(["core-identity", "working", "episodic", "semantic"]);
  });

  it("maps each layer to an engine surface, never a second store", () => {
    for (const l of MEMORY_LAYERS) {
      expect(l.engineSurface.length).toBeGreaterThan(0);
      expect(l.engineSurface).not.toBe("none");
    }
  });

  it("loads only core-identity and working every session", () => {
    expect(MEMORY_LAYERS.filter((l) => l.loadedEverySession).map((l) => l.name)).toEqual([
      "core-identity",
      "working",
    ]);
  });

  it("looks up a layer by name", () => {
    expect(layerSpec("semantic")?.purgeOnForget).toBe(true);
    expect(layerSpec("vault")?.purgeOnForget).toBe(false);
  });
});
