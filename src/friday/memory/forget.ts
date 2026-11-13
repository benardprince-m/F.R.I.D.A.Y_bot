// FRIDAY memory: "Forget X" with evidence. Purges matching records across every active
// layer and returns a report that IS the proof, not a claim (Product Specification §7.4,
// §14; Constitution Article IV.6).
//
// Contract: see docs/contracts/friday-core.ts (B-04). `complete` is true only when no
// layer retains a match afterwards.

export interface MemoryEntry {
  id: string;
  text: string;
}

export interface MemoryLayer {
  name: string;
  entries: MemoryEntry[];
}

export interface ForgetReport {
  query: string;
  purged: { layer: string; ids: string[] }[];
  totalPurged: number;
  /** Must be empty for `complete` to be true. */
  remainingMatches: { layer: string; ids: string[] }[];
  complete: boolean;
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

/**
 * Remove every entry whose text contains `query`, across all layers.
 *
 * Returns the mutated layers (callers persist them) and an evidence report. The report
 * re-scans the result so `complete` reflects the actual post-purge state.
 */
export function forget(
  layers: MemoryLayer[],
  query: string,
): { layers: MemoryLayer[]; report: ForgetReport } {
  const purged: { layer: string; ids: string[] }[] = [];
  const next: MemoryLayer[] = layers.map((layer) => {
    const kept: MemoryEntry[] = [];
    const ids: string[] = [];
    for (const entry of layer.entries) {
      if (matches(entry.text, query)) {
        ids.push(entry.id);
      } else {
        kept.push(entry);
      }
    }
    if (ids.length > 0) {
      purged.push({ layer: layer.name, ids });
    }
    return { name: layer.name, entries: kept };
  });

  const remainingMatches = next
    .map((layer) => ({
      layer: layer.name,
      ids: layer.entries.filter((e) => matches(e.text, query)).map((e) => e.id),
    }))
    .filter((r) => r.ids.length > 0);

  const totalPurged = purged.reduce((sum, p) => sum + p.ids.length, 0);
  return {
    layers: next,
    report: {
      query,
      purged,
      totalPurged,
      remainingMatches,
      complete: remainingMatches.length === 0,
    },
  };
}

/** Render the forget report as the owner-facing evidence message. */
export function renderForgetReport(report: ForgetReport): string {
  if (report.totalPurged === 0) {
    return `Nothing matched "${report.query}". Nothing was purged.`;
  }
  const lines = [`Purged ${report.totalPurged} record(s) matching "${report.query}":`];
  for (const p of report.purged) {
    lines.push(`- ${p.layer}: ${p.ids.length} record(s)`);
  }
  lines.push(
    report.complete
      ? "Verified: no matches remain in any layer."
      : `WARNING: ${report.remainingMatches.length} layer(s) still contain matches. Purge incomplete.`,
  );
  return lines.join("\n");
}
