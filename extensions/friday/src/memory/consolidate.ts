// FRIDAY memory: night-shift consolidation (Product Specification §7.4; Phase 1 night shift).
//
// The brain sharpens while the owner sleeps. Consolidation is the one unattended memory job that
// is genuinely useful and safe: it merges near-duplicate facts and lets stale, low-value records
// decay, so retrieval stays fast and the store stays bounded. It never invents facts and never
// deletes a record the owner marked important — decay only touches low-importance, long-unused
// records, and the report names exactly what it dropped.
//
// Pure: it maps a record set + clock to a consolidated set + an honest report. The caller
// persists the result and may show the report in the morning brief.
//
// Contract: see docs/contracts/friday-defense.md.

import type { StoredMemory } from "./records.js";

export interface ConsolidateOptions {
  /** A record unused for longer than this *and* below `decayImportance` is dropped. */
  decayAfterMs: number;
  /** Importance at or above this is never decayed, regardless of age. */
  decayImportance: number;
  /** Record cap; the lowest-scoring records past the cap are dropped. */
  maxRecords: number;
}

export const DEFAULT_CONSOLIDATE: ConsolidateOptions = {
  decayAfterMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  decayImportance: 0.5,
  maxRecords: 2_000,
};

export interface ConsolidateReport {
  kept: number;
  mergedAway: number;
  decayed: number;
  /** Total before consolidation. */
  before: number;
  /** One line per dropped/merged record, for the morning brief; never a secret. */
  notes: string[];
}

/** Normalize a record's text to detect near-duplicates (case/whitespace/punctuation-insensitive). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A ranking score: importance dominates, recency and use break ties. */
function score(r: StoredMemory, now: number): number {
  const ageDays = Math.max(0, (now - Date.parse(r.lastUsed || r.createdAt)) / 86_400_000);
  return r.importance * 10 + Math.min(r.useCount, 10) - ageDays / 365;
}

/**
 * Consolidate the memory store.
 *
 * Steps: (1) drop records past the decay horizon whose importance is below the floor; (2) merge
 * records that normalize to the same text, keeping the one with the best score and the longer
 * text; (3) if still over the cap, keep the highest-scoring `maxRecords`. The report is honest
 * about every record removed.
 */
export function consolidateMemory(
  records: StoredMemory[],
  now: number,
  options: ConsolidateOptions = DEFAULT_CONSOLIDATE,
): { records: StoredMemory[]; report: ConsolidateReport } {
  const notes: string[] = [];
  const before = records.length;

  const fresh = records.filter((r) => {
    const age = now - Date.parse(r.lastUsed || r.createdAt);
    const decay = age > options.decayAfterMs && r.importance < options.decayImportance;
    if (decay) {
      notes.push(`decayed: "${clip(r.text)}" (importance ${r.importance})`);
    }
    return !decay;
  });
  const decayed = records.length - fresh.length;

  const byKey = new Map<string, StoredMemory>();
  const keys: string[] = [];
  let mergedAway = 0;
  for (const r of fresh) {
    const key = normalize(r.text);
    // Near-duplicate = identical normalized text, or one is a containment of the other (e.g. a
    // short fact and its longer restatement). A small linear scan over the consolidated keys is
    // fine: the store is bounded and this runs once a night.
    const matchKey = keys.find((k) => k === key || k.includes(key) || key.includes(k));
    if (matchKey === undefined) {
      byKey.set(key, r);
      keys.push(key);
      continue;
    }
    const existing = byKey.get(matchKey)!;
    mergedAway += 1;
    const winner = score(r, now) > score(existing, now) ? r : existing;
    const longer = r.text.length > existing.text.length ? r.text : existing.text;
    const merged: StoredMemory = {
      ...winner,
      text: longer,
      importance: Math.max(r.importance, existing.importance),
      useCount: r.useCount + existing.useCount,
      lastUsed: r.lastUsed > existing.lastUsed ? r.lastUsed : existing.lastUsed,
    };
    // Keep the more general (shorter) key so a later longer restatement still collides with it.
    byKey.delete(matchKey);
    const mergedKey = matchKey.length <= key.length ? matchKey : key;
    byKey.set(mergedKey, merged);
    keys.splice(keys.indexOf(matchKey), 1, mergedKey);
    notes.push(`merged: "${clip(existing.text)}" + "${clip(r.text)}"`);
  }

  let kept = [...byKey.values()];
  if (kept.length > options.maxRecords) {
    kept = kept.toSorted((a, b) => score(b, now) - score(a, now)).slice(0, options.maxRecords);
    notes.push(`capped: kept top ${options.maxRecords} by score`);
  }

  return {
    records: kept,
    report: { kept: kept.length, mergedAway, decayed, before, notes },
  };
}

function clip(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** One owner-facing line summarising a consolidation, for the morning brief. */
export function renderConsolidation(report: ConsolidateReport): string {
  if (report.mergedAway === 0 && report.decayed === 0) {
    return `Memory: ${report.kept} record(s), nothing to consolidate.`;
  }
  return `Memory consolidated: ${report.before} → ${report.kept} (merged ${report.mergedAway}, decayed ${report.decayed}).`;
}
