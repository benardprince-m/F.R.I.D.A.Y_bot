// FRIDAY ops: `/doctor` in chat — the owner's health window from a phone (§7.8, §9; G-03).
//
// The owner is often away from a terminal, so "is FRIDAY well?" must be answerable in the chat
// they already have. This module turns the signals the plugin can actually verify into an
// owner-facing report: healthy / degraded / incident, with the evidence behind it.
//
// Honesty rule (Constitution Article I): we never claim a surface healthy that we did not
// verify. The ladder runs over the components the plugin can check (owner config, persona,
// durable continuity). Engine-owned surfaces (model, channels, memory, sandbox, vault, disk)
// are listed as "not verified from chat", and their presence caps the status at "degraded" —
// we cannot honestly say "healthy" while core surfaces are unverified.
//
// Contract: see docs/contracts/friday-core.md (G-03). Pure and deterministic.

import {
  healthReport,
  type CapabilityTier,
  type ComponentHealth,
  type HealthStatus,
} from "../policy/degradation.js";

/** Signals the plugin can verify at the chat boundary. */
export interface DoctorInput {
  /** True when at least one owner identity is configured (fail-closed when empty). */
  ownerConfigured: boolean;
  /** True when PERSONA.md / CONSTITUTION.md loaded as non-empty system context. */
  personaPresent: boolean;
  /** True when the durable continuity store opener is available (restart-resume can persist). */
  continuityStoreAvailable: boolean;
  /** True while the owner has engaged the kill switch. */
  lockedDown: boolean;
  /** True when a local provider+model are configured for cheap-first routing. */
  localRoutingConfigured: boolean;
  /**
   * F-05 result: "ok" when protected files match the baseline, "violation" when they changed,
   * "unverified" when the baseline or store is unavailable. Omitted means not checked.
   */
  integrity?: "ok" | "violation" | "unverified";
  /**
   * G-01 liveness: true when the heartbeat service is running. Omitted when the service has not
   * been started (so we never falsely claim it down before it starts).
   */
  heartbeat?: boolean;
  /**
   * C-02 model chain actually in force: the primary ref and the ordered fallbacks. Omitted when
   * not resolved (so we never print a chain the engine is not using).
   */
  model?: { primary: string; fallbacks: string[] };
  /**
   * C-04 spend line: month-to-date spend and remaining budget. Omitted when the ledger store is
   * unavailable (so we never print a spend figure we could not read).
   */
  spend?: string;
}

export interface DoctorReport {
  status: HealthStatus;
  tier: CapabilityTier;
  /** One-line, phone-readable status. */
  summary: string;
  /** The evidence, one line per component, owner-facing. */
  lines: string[];
  components: ComponentHealth[];
  /** Engine surfaces this plugin cannot verify from chat. */
  unverified: string[];
}

/** Engine-owned surfaces not verifiable from a chat command; checked by the host `doctor`. */
const UNVERIFIED_SURFACES = ["model", "telegram", "memory", "sandbox", "vault", "disk"] as const;

export function buildDoctorReport(input: DoctorInput): DoctorReport {
  const components: ComponentHealth[] = [
    {
      name: "owner",
      state: input.ownerConfigured ? "up" : "down",
      ...(input.ownerConfigured
        ? {}
        : { note: "no owner identity configured; nobody is admitted" }),
    },
    {
      name: "persona",
      state: input.personaPresent ? "up" : "degraded",
      ...(input.personaPresent ? {} : { note: "PERSONA.md/CONSTITUTION.md missing" }),
    },
    {
      name: "continuity",
      state: input.continuityStoreAvailable ? "up" : "degraded",
      ...(input.continuityStoreAvailable
        ? {}
        : { note: "durable store unavailable; continuity not persisted across restarts" }),
    },
  ];

  if (input.integrity) {
    components.push({
      name: "integrity",
      state:
        input.integrity === "ok" ? "up" : input.integrity === "violation" ? "down" : "degraded",
      ...(input.integrity === "ok"
        ? {}
        : {
            note:
              input.integrity === "violation"
                ? "protected files changed; run /trust-persona only if the change is yours"
                : "no baseline recorded; run /trust-persona to record one",
          }),
    });
  }

  if (input.heartbeat !== undefined) {
    components.push({
      name: "heartbeat",
      state: input.heartbeat ? "up" : "down",
      ...(input.heartbeat ? {} : { note: "heartbeat service not running" }),
    });
  }

  const base = healthReport(components);
  const unverified = [...UNVERIFIED_SURFACES];
  // Cap: unverified engine surfaces mean we cannot honestly claim "healthy".
  const capped = base.status === "healthy" && unverified.length > 0;
  const status: HealthStatus = capped ? "degraded" : base.status;
  const summary = capped
    ? `Degraded (${base.tier}): core engine surfaces not verified from chat`
    : base.summary;

  const lines = [
    `FRIDAY doctor — ${status} (${base.tier})`,
    `- owner: ${input.ownerConfigured ? "up" : "down"}${input.ownerConfigured ? "" : " (not configured)"}`,
    `- persona: ${input.personaPresent ? "up" : "degraded (missing PERSONA.md/CONSTITUTION.md)"}`,
    `- continuity: ${input.continuityStoreAvailable ? "up" : "degraded (no durable store)"}`,
    ...(input.integrity
      ? [
          `- integrity: ${
            input.integrity === "ok"
              ? "ok (protected files match the baseline)"
              : input.integrity === "violation"
                ? "VIOLATION (protected files changed unexpectedly)"
                : "unverified (no baseline — run /trust-persona)"
          }`,
        ]
      : []),
    ...(input.heartbeat !== undefined
      ? [`- heartbeat: ${input.heartbeat ? "beating (60s)" : "DOWN (service not running)"}`]
      : []),
    ...(input.model
      ? [
          `- model: ${input.model.primary} (primary)`,
          `- fallbacks: ${
            input.model.fallbacks.length > 0 ? input.model.fallbacks.join(" → ") : "none"
          }`,
        ]
      : []),
    ...(input.spend ? [`- ${input.spend}`] : []),
    `- lockdown: ${input.lockedDown ? "on (non-essential outbound paused)" : "off"}`,
    `- routing: ${input.localRoutingConfigured ? "cheap-first (local provider set)" : "default"}`,
    `- not verified from chat: ${unverified.join(", ")} — run \`openclaw doctor\` on the host`,
  ];

  return { status, tier: base.tier, summary, lines, components, unverified };
}
