// FRIDAY continuity: conversation continuity via a bounded checkpoint, not a transcript dump
// (Product Specification MSG-02, §7.4).
//
// The working context is rebuilt each turn from a compact checkpoint plus a bounded recent
// tail — never the full raw history. Keeping it small and structured does two things: the
// model sees a stable, cheap context, and restart-resume is trivial because the checkpoint is
// plain JSON the caller can persist (E-02).
//
// This module bounds, orders, and carries facts forward. It does not summarise semantically
// (that needs a model); it drops the oldest turns with an explicit count so the loss is
// visible rather than silent.
//
// Contract: see docs/contracts/friday-core.md (A-04). Pure: no I/O; every output is a bounded,
// deterministic function of its inputs.

export type TurnRole = "owner" | "friday";

export interface Turn {
  role: TurnRole;
  /** Already redacted and trust-labelled by `turn.ts` before it lands here. */
  text: string;
  at: string;
}

export interface Checkpoint {
  version: 1;
  /** Timestamp of the most recent folded turn (or the seed time for an empty checkpoint). */
  updatedAt: string;
  /**
   * Total turns ever folded in. Kept even when the tail is capped, so "how much conversation
   * happened" stays truthful after the verbatim tail has been trimmed.
   */
  turnCount: number;
  /** Recent turns kept verbatim, oldest first, capped by `maxTurns`. */
  recent: Turn[];
  /** Stable facts pinned for continuity — come from the memory layers, never the transcript. */
  pinned: string[];
  /** Open threads the owner is waiting on. */
  openThreads: string[];
}

export interface ContinuityLimits {
  maxTurns: number;
  maxPinned: number;
  maxOpenThreads: number;
  /** Upper bound on a rendered checkpoint, in characters. */
  maxChars: number;
}

export const DEFAULT_CONTINUITY_LIMITS: ContinuityLimits = {
  maxTurns: 12,
  maxPinned: 8,
  maxOpenThreads: 6,
  maxChars: 1800,
};

export function emptyCheckpoint(at: string): Checkpoint {
  return { version: 1, updatedAt: at, turnCount: 0, recent: [], pinned: [], openThreads: [] };
}

/** Keep the newest `max` entries, de-duplicated with the newest occurrence winning. */
function bound(entries: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (let i = entries.length - 1; i >= 0 && kept.length < max; i -= 1) {
    const entry = entries[i]!;
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    kept.push(entry);
  }
  return kept.toReversed();
}

/**
 * Fold new turns into a checkpoint.
 *
 * The verbatim tail keeps only the newest `maxTurns`; older turns are dropped from the tail
 * but still counted in `turnCount`, so nothing about volume is lost even as the tail is
 * trimmed.
 */
export function foldCheckpoint(
  prev: Checkpoint,
  turns: readonly Turn[],
  limits: ContinuityLimits = DEFAULT_CONTINUITY_LIMITS,
): Checkpoint {
  if (turns.length === 0) {
    return prev;
  }
  const recent = [...prev.recent, ...turns].slice(-Math.max(0, limits.maxTurns));
  const last = turns[turns.length - 1]!;
  return { ...prev, updatedAt: last.at, turnCount: prev.turnCount + turns.length, recent };
}

/** Replace the pinned facts, keeping the newest `maxPinned` and dropping duplicates. */
export function withPinned(
  cp: Checkpoint,
  facts: readonly string[],
  limits: ContinuityLimits = DEFAULT_CONTINUITY_LIMITS,
): Checkpoint {
  return { ...cp, pinned: bound(facts, Math.max(0, limits.maxPinned)) };
}

/** Replace the open threads, keeping the newest `maxOpenThreads` and dropping duplicates. */
export function withOpenThreads(
  cp: Checkpoint,
  threads: readonly string[],
  limits: ContinuityLimits = DEFAULT_CONTINUITY_LIMITS,
): Checkpoint {
  return { ...cp, openThreads: bound(threads, Math.max(0, limits.maxOpenThreads)) };
}

/**
 * Render the checkpoint as compact, model-facing text, bounded by `maxChars`.
 *
 * The newest turns are the most valuable, so when the render exceeds the cap the oldest tail
 * lines are dropped first — and the omitted count is stated, never hidden.
 */
export function renderCheckpoint(
  cp: Checkpoint,
  limits: ContinuityLimits = DEFAULT_CONTINUITY_LIMITS,
): string {
  const header = `Conversation checkpoint (${cp.turnCount} turns, updated ${cp.updatedAt}).`;

  const sections: string[] = [header];
  if (cp.pinned.length > 0) {
    sections.push(`Pinned:\n${cp.pinned.map((f) => `- ${f}`).join("\n")}`);
  }
  if (cp.openThreads.length > 0) {
    sections.push(`Open threads:\n${cp.openThreads.map((t) => `- ${t}`).join("\n")}`);
  }

  const tail = cp.recent.map((t) => `${t.role === "owner" ? "Owner" : "FRIDAY"}: ${t.text}`);
  if (tail.length > 0) {
    const kept = [...tail];
    // Omitted = turns dropped from the verbatim tail + turns dropped by the char cap. Both are
    // reported, so trimming the tail is never a silent loss.
    const render = (): string => {
      const parts = [...sections];
      const omitted = cp.turnCount - kept.length;
      if (kept.length > 0) {
        const head = omitted > 0 ? `Recent (${omitted} earlier omitted):` : "Recent:";
        parts.push(`${head}\n${kept.join("\n")}`);
      } else if (omitted > 0) {
        parts.push(`Recent: (${omitted} earlier omitted)`);
      }
      return parts.join("\n\n");
    };
    let text = render();
    while (text.length > limits.maxChars && kept.length > 0) {
      kept.shift();
      text = render();
    }
    return text;
  }

  return sections.join("\n\n");
}
