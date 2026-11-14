// Tests for idempotency keys (§6.3, AUT-06). Invariant: a retried intent does not perform
// the side effect twice; the first recorded outcome is authoritative.
import { describe, expect, it } from "vitest";
import { claim, createLedger, idempotencyKey, record } from "./idempotency.js";

describe("idempotency", () => {
  it("derives a stable key from the same intent", () => {
    const a = idempotencyKey("stripe", "charge", "order-42");
    const b = idempotencyKey("stripe", "charge", "order-42");
    expect(a).toBe(b);
    expect(idempotencyKey("stripe", "charge", "order-43")).not.toBe(a);
  });

  it("claims an unused key, then blocks a retry of the same key", () => {
    let ledger = createLedger();
    const key = idempotencyKey("stripe", "charge", "order-42");
    expect(claim(ledger, key).status).toBe("claimed");
    ledger = record(ledger, key, "charge", "paid", "2026-11-14T00:00:00Z");
    const retry = claim(ledger, key);
    expect(retry.status).toBe("already-performed");
    if (retry.status === "already-performed") {
      expect(retry.record.outcome).toBe("paid");
    }
  });

  it("recording the same key twice is a NOOP (append-only)", () => {
    let ledger = createLedger();
    const key = idempotencyKey("x", "post", "tweet-1");
    ledger = record(ledger, key, "post", "posted", "t0");
    const after = record(ledger, key, "post", "posted-again", "t1");
    expect(after.records).toHaveLength(1);
    expect(after.records[0]?.outcome).toBe("posted");
  });

  it("treats distinct intents as independent", () => {
    let ledger = createLedger();
    ledger = record(ledger, idempotencyKey("x", "post", "a"), "post", "posted-a", "t0");
    expect(claim(ledger, idempotencyKey("x", "post", "b")).status).toBe("claimed");
  });
});
