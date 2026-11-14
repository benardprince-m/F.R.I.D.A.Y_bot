// FRIDAY tasks: idempotency keys for money and public writes.
//
// A retry must never duplicate a charge, a public post, an email, or an API write (Product
// Specification §6.3, AUT-06; Constitution Article V.5). The caller derives a stable key
// from the intent, checks it before performing the side effect, and records it after.
//
// Contract: see docs/contracts/friday-core.md (E-03). Pure: an in-memory ledger with an
// explicit, serialisable record so the caller can persist it across restarts.

export interface IdempotencyRecord {
  key: string;
  /** The side effect that was performed for this key. */
  effect: string;
  /** When it was first performed. */
  performedAt: string;
  /** The recorded outcome, so a retry returns the same result instead of re-performing. */
  outcome: string;
}

export interface IdempotencyLedger {
  records: IdempotencyRecord[];
}

export function createLedger(): IdempotencyLedger {
  return { records: [] };
}

/**
 * Derive a stable idempotency key from an intent.
 *
 * Deterministic: the same (scope, action, target) always yields the same key, so a retry of
 * the same intent collides with the recorded one. Include a caller-chosen nonce only when
 * the owner genuinely intends a second, distinct action.
 */
export function idempotencyKey(scope: string, action: string, target: string): string {
  return `${scope}:${action}:${target}`;
}

export type ClaimResult =
  | { status: "claimed" }
  | { status: "already-performed"; record: IdempotencyRecord };

/**
 * Claim a key before performing a side effect.
 *
 * If the key was already performed, the caller must NOT perform the effect again; it should
 * return the recorded outcome. Otherwise the key is claimed and the effect may proceed.
 */
export function claim(ledger: IdempotencyLedger, key: string): ClaimResult {
  const existing = ledger.records.find((r) => r.key === key);
  if (existing) {
    return { status: "already-performed", record: existing };
  }
  return { status: "claimed" };
}

/**
 * Record a completed side effect against its key.
 *
 * Recording the same key twice is a NOOP: the first outcome is authoritative. This keeps
 * the ledger append-only and stable across retries.
 */
export function record(
  ledger: IdempotencyLedger,
  key: string,
  effect: string,
  outcome: string,
  now: string,
): IdempotencyLedger {
  if (ledger.records.some((r) => r.key === key)) {
    return ledger;
  }
  return {
    records: [...ledger.records, { key, effect, performedAt: now, outcome }],
  };
}
