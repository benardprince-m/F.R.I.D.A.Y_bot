// Tests for the response cache (§7.10). Invariant: keys are normalized, TTL and size bound the
// store, and an evicted entry is a plain miss.
import { describe, expect, it } from "vitest";
import { cacheKey, ResponseCache } from "./response-cache.js";

describe("cacheKey", () => {
  it("normalizes case and whitespace", () => {
    expect(cacheKey("  Hello   World ")).toBe("hello world");
  });
});

describe("ResponseCache", () => {
  it("returns a stored value for a normalized-equivalent request", () => {
    const cache = new ResponseCache({ ttlMs: 1000, maxEntries: 8 });
    cache.set("Good morning", "Morning! Here is your brief.", 0);
    expect(cache.get("  good   MORNING ", 10)).toBe("Morning! Here is your brief.");
  });

  it("misses on an unknown request", () => {
    const cache = new ResponseCache({ ttlMs: 1000, maxEntries: 8 });
    expect(cache.get("never stored", 0)).toBeUndefined();
  });

  it("drops an entry past its TTL", () => {
    const cache = new ResponseCache({ ttlMs: 100, maxEntries: 8 });
    cache.set("q", "a", 0);
    expect(cache.get("q", 50)).toBe("a");
    expect(cache.get("q", 101)).toBeUndefined();
  });

  it("evicts the oldest entry when full", () => {
    const cache = new ResponseCache({ ttlMs: 1000, maxEntries: 2 });
    cache.set("a", "1", 0);
    cache.set("b", "2", 1);
    cache.set("c", "3", 2);
    expect(cache.size).toBe(2);
    expect(cache.get("a", 3)).toBeUndefined();
    expect(cache.get("c", 3)).toBe("3");
  });

  it("re-inserting refreshes recency", () => {
    const cache = new ResponseCache({ ttlMs: 1000, maxEntries: 2 });
    cache.set("a", "1", 0);
    cache.set("b", "2", 1);
    cache.set("a", "1b", 2);
    cache.set("c", "3", 3);
    expect(cache.get("b", 4)).toBeUndefined();
    expect(cache.get("a", 4)).toBe("1b");
  });

  it("prunes expired entries", () => {
    const cache = new ResponseCache({ ttlMs: 100, maxEntries: 8 });
    cache.set("a", "1", 0);
    cache.set("b", "2", 200);
    cache.prune(250);
    expect(cache.size).toBe(1);
  });
});
