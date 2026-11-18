// Tests for the FRIDAY model chain (C-02). Invariant: the chain always has a primary and a
// self-consistent ordered fallback list; a tripped breaker's provider drops out of the chain.
import { describe, expect, it } from "vitest";
import { newBreaker, type BreakerState } from "./breaker.js";
import {
  admittingRefs,
  DEFAULT_FALLBACK_CHAIN,
  DEFAULT_PRIMARY_MODEL,
  effectiveChain,
  providerOf,
  resolveModelChain,
  splitModelRef,
} from "./model-chain.js";

describe("resolveModelChain", () => {
  it("defaults to DeepSeek v4.1 Flash with the free-tier chain behind it", () => {
    const chain = resolveModelChain();
    expect(chain.primary).toBe(DEFAULT_PRIMARY_MODEL);
    expect(chain.fallbacks).toEqual([...DEFAULT_FALLBACK_CHAIN]);
  });

  it("honors an owner override and never repeats the primary as a fallback", () => {
    const chain = resolveModelChain({
      model: "deepseek/deepseek-v4-flash",
      modelChain: ["deepseek/deepseek-v4-flash", "google/gemini-2.5-flash", "  "],
    });
    expect(chain.primary).toBe("deepseek/deepseek-v4-flash");
    expect(chain.fallbacks).toEqual(["google/gemini-2.5-flash"]);
  });
});

describe("splitModelRef / providerOf", () => {
  it("splits a provider/model ref", () => {
    expect(splitModelRef("deepseek/deepseek-v4.1-flash")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4.1-flash",
    });
    expect(providerOf("google/gemini-2.5-flash")).toBe("google");
  });

  it("treats a bare model name as having no provider", () => {
    expect(splitModelRef("llama3.3:8b")).toEqual({ provider: "", model: "llama3.3:8b" });
    expect(providerOf("llama3.3:8b")).toBe("");
  });
});

describe("admittingRefs / effectiveChain", () => {
  const now = 1_000_000;
  const open: BreakerState = { status: "open", consecutiveFailures: 0, openedAt: now };

  it("keeps every ref when all breakers are closed", () => {
    const chain = resolveModelChain();
    const breakers = new Map([["groq", newBreaker()]]);
    expect(admittingRefs([chain.primary, ...chain.fallbacks], breakers, now)).toEqual([
      chain.primary,
      ...chain.fallbacks,
    ]);
  });

  it("drops a fallback whose provider breaker is open", () => {
    const chain = resolveModelChain();
    const breakers = new Map([["groq", open]]);
    const available = admittingRefs(chain.fallbacks, breakers, now);
    expect(available).not.toContain("groq/llama-3.3-70b-versatile");
    expect(available).toContain("google/gemini-2.5-flash");
  });

  it("keeps a providerless ref (no breaker can be matched)", () => {
    expect(admittingRefs(["llama3.3:8b"], new Map(), now)).toEqual(["llama3.3:8b"]);
  });

  it("promotes the first admitting ref to primary when the primary provider is down", () => {
    const chain = resolveModelChain();
    const breakers = new Map([["deepseek", open]]);
    const effective = effectiveChain(chain, breakers, now);
    expect(effective.primary).toBe("google/gemini-2.5-flash");
    expect(effective.fallbacks).not.toContain("google/gemini-2.5-flash");
    expect(effective.fallbacks).toContain("groq/llama-3.3-70b-versatile");
  });

  it("falls back to a strict chain when every provider breaker is open", () => {
    const chain = resolveModelChain();
    const breakers = new Map([
      ["deepseek", open],
      ["google", open],
      ["groq", open],
      ["mistral", open],
      ["cohere", open],
      ["cloudflare-ai-gateway", open],
    ]);
    const effective = effectiveChain(chain, breakers, now);
    expect(effective.primary).toBe(chain.primary);
    expect(effective.fallbacks).toEqual([]);
  });
});
