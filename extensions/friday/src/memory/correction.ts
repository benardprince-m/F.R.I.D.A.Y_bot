// FRIDAY memory: the correction path. When the owner corrects a fact, the current value is
// replaced, the previous value is retained in an audit trail, and the old value is never
// revived as current truth (Product Specification §7.4; Constitution Article IV.6).
//
// Contract: see docs/contracts/friday-core.md (B-05). Pure: it transforms a record and
// returns the new record plus the audit entry. It does not persist anything.

import type { Provenance } from "./librarian.js";

export interface RevisionEntry {
  /** The value that was current before this correction. */
  text: string;
  provenance: Provenance;
  /** When this value stopped being current. */
  supersededAt: string;
  /** Why it was replaced. */
  reason: string;
}

export interface MemoryRecord {
  id: string;
  /** The current, authoritative value. */
  text: string;
  provenance: Provenance;
  /** Append-only: every superseded value, oldest first. */
  history: RevisionEntry[];
}

export interface CorrectionResult {
  record: MemoryRecord;
  /** The audit entry appended, for the caller's log/evidence. */
  audit: RevisionEntry;
}

/**
 * Apply an owner correction to a memory record.
 *
 * The new text and provenance become current; the previous value is appended to the
 * record's history with a timestamp and reason. Because the old value lives only in
 * `history`, a later read of `record.text` returns the correction, never the stale value —
 * the old value is not revived.
 */
export function correct(
  existing: MemoryRecord,
  newText: string,
  newProvenance: Provenance,
  now: string,
  reason = "owner correction",
): CorrectionResult {
  const audit: RevisionEntry = {
    text: existing.text,
    provenance: existing.provenance,
    supersededAt: now,
    reason,
  };
  return {
    record: {
      id: existing.id,
      text: newText,
      provenance: newProvenance,
      history: [...existing.history, audit],
    },
    audit,
  };
}

/** The value that is current truth for a record. Never reads history. */
export function currentValue(record: MemoryRecord): string {
  return record.text;
}

/** Whether a record was ever corrected (has audit history). */
export function wasCorrected(record: MemoryRecord): boolean {
  return record.history.length > 0;
}
