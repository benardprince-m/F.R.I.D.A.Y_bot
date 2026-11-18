// FRIDAY memory: the record model behind `/remember`, `/forget`, and prompt retrieval (B-04).
//
// FRIDAY's memory is the semantic layer (see `./layers.ts`). The engine has no plugin-facing
// memory read/write/delete API, so FRIDAY owns a small, bounded store of its own — the same
// plugin-state store the continuity checkpoint uses, never a JSON sidecar. Every record carries
// provenance (source + date + confidence, B-03), and every operation here is pure: it maps
// records to and from the Librarian's decision and the forget report, and the caller persists.
//
// Contract: see docs/contracts/friday-core.md (B-02/B-03/B-04).

import type { ForgetReport, MemoryEntry, MemoryLayer } from "./forget.js";
import { forget } from "./forget.js";
import {
  classify,
  type CandidateMemory,
  type ExistingMemory,
  type LibrarianDecision,
  type MemoryOp,
  type Provenance,
} from "./librarian.js";

/** The FRIDAY memory store holds the semantic layer. */
export const MEMORY_LAYER_NAME = "semantic";

export interface StoredMemory {
  id: string;
  text: string;
  provenance: Provenance;
  /** Caller-assessed importance in [0, 1]. */
  importance: number;
  /** How often the record has been retrieved (B-02 "use" factor). */
  useCount: number;
  /** ISO date the record was last retrieved. */
  lastUsed: string;
  /** ISO date the record was created. */
  createdAt: string;
}

/** Validate a value read back from the store before trusting it (the read is a trust boundary). */
export function isStoredMemory(value: unknown): value is StoredMemory {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  const p = v.provenance as Record<string, unknown> | undefined;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.importance === "number" &&
    typeof v.useCount === "number" &&
    typeof v.lastUsed === "string" &&
    typeof v.createdAt === "string" &&
    typeof p === "object" &&
    p !== null &&
    typeof p.source === "string" &&
    typeof p.date === "string" &&
    typeof p.confidence === "string"
  );
}

/** A short, stable-enough id from the text and creation time (FNV-1a, hex). */
export function newMemoryId(text: string, now: string): string {
  const input = `${text}\u0000${now}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `m_${hash.toString(16).padStart(8, "0")}`;
}

/** Project records into the Librarian's `ExistingMemory` view. */
export function toExisting(records: StoredMemory[]): ExistingMemory[] {
  return records.map((r) => ({
    id: r.id,
    text: r.text,
    provenance: r.provenance,
    useCount: r.useCount,
    lastUsed: r.lastUsed,
  }));
}

export interface ApplyResult {
  /** The full record set after the operation. */
  records: StoredMemory[];
  /** Only the rows the caller must persist (created or modified); empty for NOOP. */
  changed: StoredMemory[];
  op: MemoryOp;
  reason: string;
}

/** Build a candidate from an owner `/remember`, defaulting to a verified owner-chat fact. */
export function ownerCandidate(text: string, now: string, importance = 0.7): CandidateMemory {
  return {
    text: text.trim(),
    provenance: { source: "owner chat", date: now, confidence: "verified" },
    importance,
  };
}

/**
 * Fold a candidate into the record set through the Librarian (B-02).
 *
 * ADD appends; UPDATE replaces the target's text/provenance/importance; MERGE keeps the longer
 * text and the higher importance; NOOP changes nothing. Pure — returns the new record set.
 */
export function applyCandidate(
  records: StoredMemory[],
  candidate: CandidateMemory,
  now: string,
  confirmed = false,
): ApplyResult {
  const decision: LibrarianDecision = classify(
    candidate,
    toExisting(records),
    now,
    confirmed ? { confirmed: true } : {},
  );
  switch (decision.op) {
    case "ADD": {
      const created: StoredMemory = {
        id: newMemoryId(candidate.text, now),
        text: candidate.text,
        provenance: candidate.provenance,
        importance: candidate.importance,
        useCount: 0,
        lastUsed: now,
        createdAt: now,
      };
      return {
        records: [...records, created],
        changed: [created],
        op: "ADD",
        reason: decision.reason,
      };
    }
    case "UPDATE": {
      let changed: StoredMemory | undefined;
      const next = records.map((r) => {
        if (r.id !== decision.targetId) {
          return r;
        }
        changed = {
          ...r,
          text: candidate.text,
          provenance: candidate.provenance,
          importance: candidate.importance,
        };
        return changed;
      });
      return {
        records: next,
        changed: changed ? [changed] : [],
        op: "UPDATE",
        reason: decision.reason,
      };
    }
    case "MERGE": {
      let changed: StoredMemory | undefined;
      const next = records.map((r) => {
        if (r.id !== decision.targetId) {
          return r;
        }
        changed = {
          ...r,
          text: candidate.text.length > r.text.length ? candidate.text : r.text,
          importance: Math.max(r.importance, candidate.importance),
        };
        return changed;
      });
      return {
        records: next,
        changed: changed ? [changed] : [],
        op: "MERGE",
        reason: decision.reason,
      };
    }
    default:
      return { records, changed: [], op: "NOOP", reason: decision.reason };
  }
}

/** Purge every record matching `query`, reusing the tested `forget` report (B-04). */
export function forgetMemories(
  records: StoredMemory[],
  query: string,
): { records: StoredMemory[]; report: ForgetReport } {
  const layer: MemoryLayer = {
    name: MEMORY_LAYER_NAME,
    entries: records.map((r): MemoryEntry => ({ id: r.id, text: r.text })),
  };
  const { layers, report } = forget([layer], query);
  const kept = new Set(layers[0]!.entries.map((e) => e.id));
  return { records: records.filter((r) => kept.has(r.id)), report };
}

/** Records whose text best matches `prompt`, ranked by overlap then importance (bounded). */
export function selectForContext(
  records: StoredMemory[],
  prompt: string,
  limit = 5,
): StoredMemory[] {
  const promptWords = new Set(words(prompt));
  const scored = records.map((r) => {
    const textWords = new Set(words(r.text));
    let overlap = 0;
    for (const w of textWords) {
      if (promptWords.has(w)) {
        overlap += 1;
      }
    }
    return { record: r, overlap, score: overlap * 2 + r.importance };
  });
  return scored
    .filter((s) => s.overlap > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((s) => s.record);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const MAX_CONTEXT_CHARS = 200;

/** Render retrieved records as a bounded, provenance-labelled context block. */
export function renderMemoryContext(records: StoredMemory[]): string | undefined {
  if (records.length === 0) {
    return undefined;
  }
  const lines = records.map((r) => {
    const text =
      r.text.length > MAX_CONTEXT_CHARS ? `${r.text.slice(0, MAX_CONTEXT_CHARS)}…` : r.text;
    return `- ${text} (source: ${r.provenance.source}, ${r.provenance.date}, ${r.provenance.confidence})`;
  });
  return ["FRIDAY memory (owner facts; cite source and date, never invent):", ...lines].join("\n");
}

/** The owner-facing acknowledgement for a `/remember`. */
export function renderRememberAck(result: ApplyResult): string {
  switch (result.op) {
    case "ADD":
      return "Stored.";
    case "UPDATE":
      return "Updated an existing memory with that.";
    case "MERGE":
      return "Merged that into a related memory.";
    default:
      return `Not stored: ${result.reason}.`;
  }
}

/** The owner-facing listing for `/memory`, newest first, bounded. */
export function renderMemoryList(records: StoredMemory[], limit = 20): string {
  if (records.length === 0) {
    return "No memories stored yet. Use /remember <text> to add one.";
  }
  const recent = records
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
  const lines = recent.map(
    (r) => `- ${r.text} (source: ${r.provenance.source}, ${r.provenance.date})`,
  );
  const more =
    records.length > recent.length ? `\n…and ${records.length - recent.length} more.` : "";
  return [`${records.length} memory record(s):`, ...lines].join("\n") + more;
}
