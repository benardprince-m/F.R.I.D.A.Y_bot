// FRIDAY memory: the five-layer model and its mapping onto the engine.
//
// The spec names five memory layers (Product Specification §7.4). The engine already stores
// memory; this module is the FRIDAY-side contract that names each layer, its rule, and the
// engine surface it maps to — so the Librarian, correction, and forget logic target a known
// set of layers rather than ad-hoc stores. It builds no storage of its own (§6.1).
//
// Contract: see docs/contracts/friday-core.md (B-01) and docs/contracts/oss-adoption.md.

export type MemoryLayerName = "core-identity" | "working" | "episodic" | "semantic" | "vault";

export interface MemoryLayerSpec {
  name: MemoryLayerName;
  /** What this layer holds. */
  holds: string;
  /** The storage / loading rule from the spec. */
  rule: string;
  /** The engine surface this layer maps to (or "none" — the vault is not memory). */
  engineSurface: string;
  /** Whether "forget X" must purge this layer. The vault is excluded by design. */
  purgeOnForget: boolean;
  /** Whether the layer is loaded every session. */
  loadedEverySession: boolean;
}

/** The five layers, in spec order. */
export const MEMORY_LAYERS: readonly MemoryLayerSpec[] = [
  {
    name: "core-identity",
    holds: "Owner goals, stable preferences, people map, persona state, day counter",
    rule: "Plain, versioned Markdown; loaded every session; edits reviewable and revertible",
    engineSurface: "workspace files (CONSTITUTION.md, PERSONA.md) + core memory state",
    purgeOnForget: true,
    loadedEverySession: true,
  },
  {
    name: "working",
    holds: "Current conversation and the relevant retrieved memories",
    rule: "Rebuilt per session; bounded context, not the full raw history",
    engineSurface: "session context assembly + rolling summary",
    purgeOnForget: true,
    loadedEverySession: true,
  },
  {
    name: "episodic",
    holds: "Append-only record of sessions, tasks, actions, and results",
    rule: "Relational store; retrieved for debriefs and audit",
    engineSurface: "session/event store (SQLite)",
    purgeOnForget: true,
    loadedEverySession: false,
  },
  {
    name: "semantic",
    holds: "Extracted facts, lessons, and preferences searchable by meaning",
    rule: "Vector store; each fact has source, date, importance, and decay metadata",
    engineSurface: "memory-core sqlite-vec index + the Librarian's classify policy",
    purgeOnForget: true,
    loadedEverySession: false,
  },
  {
    name: "vault",
    holds: "Passwords, API keys, PATs, and other secrets",
    rule: "Encrypted, separately permissioned; fetched only when acting; NEVER memory",
    engineSurface: "src/secrets/store + extensions/vault",
    // The vault is not memory: it must never be written into a memory layer, and "forget X"
    // does not touch it. Secrets are purged only by explicit secret deletion.
    purgeOnForget: false,
    loadedEverySession: false,
  },
] as const;

/** The layers "forget X" must purge, in order. */
export function purgeableLayers(): MemoryLayerName[] {
  return MEMORY_LAYERS.filter((l) => l.purgeOnForget).map((l) => l.name);
}

/** Look up a layer spec by name. */
export function layerSpec(name: MemoryLayerName): MemoryLayerSpec | undefined {
  return MEMORY_LAYERS.find((l) => l.name === name);
}
