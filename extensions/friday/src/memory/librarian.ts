// FRIDAY memory: the Librarian. After a conversation or task, candidate memories are
// compared against existing records and classified ADD / UPDATE / MERGE / NOOP, scored by
// importance × recency × use (Product Specification §7.4).
//
// Contract: see docs/contracts/friday-core.md (B-02). An ambiguous statement is never
// promoted to certain fact: the Librarian refuses to ADD an "uncertain" candidate as a
// durable fact unless the caller passes an explicit confirmation.

export type Confidence = "verified" | "inference" | "uncertain" | "failed" | "opinion";

export interface Provenance {
  source: string;
  date: string;
  confidence: Confidence;
}

export interface CandidateMemory {
  text: string;
  provenance: Provenance;
  /** Caller-assessed importance in [0, 1]. */
  importance: number;
}

export interface ExistingMemory {
  id: string;
  text: string;
  provenance: Provenance;
  useCount: number;
  lastUsed: string;
}

export type MemoryOp = "ADD" | "UPDATE" | "MERGE" | "NOOP";

export interface LibrarianDecision {
  op: MemoryOp;
  targetId?: string;
  score: number;
  reason: string;
}

export interface ClassifyOptions {
  /** Set only when the owner has confirmed an otherwise-uncertain candidate. */
  confirmed?: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Token overlap ratio (Jaccard) in [0, 1]; a cheap, deterministic near-duplicate check. */
function similarity(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const setA = words(a);
  const setB = words(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) {
      inter += 1;
    }
  }
  return inter / (setA.size + setB.size - inter);
}

/** Recency in [0, 1]: 1.0 today, decaying to ~0 at 365 days. */
function recency(lastUsed: string, now: string): number {
  const days = Math.max(0, (Date.parse(now) - Date.parse(lastUsed)) / MS_PER_DAY);
  return 1 / (1 + days / 30);
}

/** Use in [0, 1]: saturating count of how often a memory has been retrieved. */
function use(useCount: number): number {
  return 1 - 1 / (1 + Math.max(0, useCount));
}

export function classify(
  candidate: CandidateMemory,
  existing: ExistingMemory[],
  now: string,
  opts: ClassifyOptions = {},
): LibrarianDecision {
  if (candidate.provenance.confidence === "uncertain" && !opts.confirmed) {
    return {
      op: "NOOP",
      score: 0,
      reason: "uncertain candidate not stored as durable fact without owner confirmation",
    };
  }

  // Find the closest existing memory.
  let best: ExistingMemory | undefined;
  let bestSim = 0;
  for (const e of existing) {
    const sim = similarity(candidate.text, e.text);
    if (sim > bestSim) {
      bestSim = sim;
      best = e;
    }
  }

  const candScore = candidate.importance;
  if (!best || bestSim < 0.34) {
    return { op: "ADD", score: candScore, reason: "no sufficiently similar existing memory" };
  }

  const existingScore = Math.max(
    0,
    Math.min(1, 0.5 * recency(best.lastUsed, now) + 0.5 * use(best.useCount)),
  );

  if (bestSim >= 0.8) {
    // Near-duplicate: keep the stronger record.
    if (candScore > existingScore) {
      return {
        op: "UPDATE",
        targetId: best.id,
        score: candScore,
        reason: `near-duplicate (${bestSim.toFixed(2)}); candidate is stronger`,
      };
    }
    return {
      op: "NOOP",
      targetId: best.id,
      score: existingScore,
      reason: `near-duplicate (${bestSim.toFixed(2)}); existing record is at least as strong`,
    };
  }

  // Related but distinct: merge into one consolidated record.
  return {
    op: "MERGE",
    targetId: best.id,
    score: Math.max(candScore, existingScore),
    reason: `related (${bestSim.toFixed(2)}); merge to avoid duplicate facts`,
  };
}
