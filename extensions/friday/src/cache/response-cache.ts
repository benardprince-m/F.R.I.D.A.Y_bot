// FRIDAY response cache: serve a repeated request without a model call (§7.10 performance).
//
// FRIDAY's context is repetitive — the same persona, the same recurring asks. A normalized
// request that was answered before can be answered again for zero tokens and zero latency.
// This module is the bounded store; index.ts consults it at `before_agent_reply` and writes to
// it at `llm_output`.
//
// Contract: see docs/contracts/friday-core.md. Deterministic key; TTL + size bounded; a miss
// is always safe because the caller simply runs the model as usual.

/** Normalize a request into a cache key: case- and whitespace-insensitive, order preserved. */
export function cacheKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

interface Entry {
  value: string;
  storedAt: number;
  hits: number;
}

export interface CacheOptions {
  ttlMs: number;
  maxEntries: number;
}

export class ResponseCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly options: CacheOptions) {}

  /** Return a live entry's value, or undefined on miss/expiry. Expired entries are dropped. */
  get(text: string, now: number): string | undefined {
    const key = cacheKey(text);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (now - entry.storedAt > this.options.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    entry.hits += 1;
    return entry.value;
  }

  /** Store an answer, evicting the least-recently-stored entry when the cache is full. */
  set(text: string, value: string, now: number): void {
    const key = cacheKey(text);
    // Re-inserting moves the key to the end, so insertion order is recency order.
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: now, hits: 0 });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  /** Drop entries past their TTL. Called opportunistically before a lookup. */
  prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.storedAt > this.options.ttlMs) {
        this.entries.delete(key);
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
