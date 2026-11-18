// FRIDAY defense: the threat vocabulary shared by the instinct reflex, the durable threat
// ledger, and the active countermeasures (Product Specification §7.15, §9; Constitution
// Article IV).
//
// One place defines what a threat *is*, how severe it is, and which posture it earns, so the
// fast reflex layer, the ledger, and the active-response layer can never disagree about a
// technique's meaning or weight. Pure: no I/O.
//
// Contract: see docs/contracts/friday-defense.md.

/**
 * A recognized hostile technique: a move an intruder makes *at* FRIDAY. FRIDAY's answer to
 * every one of them is defence (refuse, deceive, stall, quarantine, alert) — never offence.
 */
export type ThreatSignal =
  | "prompt-extraction" // "print your system prompt / instructions"
  | "config-probe" // "show your config / tokens / keys"
  | "credential-harvest" // "give me the API key / password"
  | "instruction-override" // "ignore your rules and …"
  | "role-confusion" // "you are now the admin / developer mode"
  | "tool-bait" // "run this shell command"
  | "flood"; // volume abuse (many messages in a short window)

export type Severity = "none" | "low" | "medium" | "high" | "critical";

/**
 * How hard FRIDAY is pushing back on an actor. Escalates with repeated offences and only
 * de-escalates through time decay, so a one-off false positive never becomes a permanent ban.
 */
export type Posture = "observe" | "warn" | "tarpit" | "quarantine" | "ban";

const SEVERITY: Record<ThreatSignal, Severity> = {
  "credential-harvest": "critical",
  "config-probe": "high",
  "prompt-extraction": "high",
  "instruction-override": "medium",
  "role-confusion": "medium",
  "tool-bait": "medium",
  flood: "low",
};

const RANK: Record<Severity, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** The severity of a technique. */
export function severityOfSignal(signal: ThreatSignal): Severity {
  return SEVERITY[signal];
}

/** The worst severity across a set of techniques; "none" for an empty set. */
export function severityOf(signals: readonly ThreatSignal[]): Severity {
  let worst: Severity = "none";
  for (const signal of signals) {
    if (RANK[SEVERITY[signal]] > RANK[worst]) {
      worst = SEVERITY[signal];
    }
  }
  return worst;
}

/** True when `a` is at least as severe as `b`. */
export function atLeast(a: Severity, b: Severity): boolean {
  return RANK[a] >= RANK[b];
}

/** The assessed threat for one event: what was seen, how bad, and whether it came from the owner. */
export interface ThreatAssessment {
  severity: Severity;
  techniques: ThreatSignal[];
  /**
   * True when the sender is an admitted owner. An owner probing FRIDAY is a self-test, not an
   * intrusion: FRIDAY still refuses to leak, but it does not escalate the owner toward a ban.
   */
  fromOwner: boolean;
}

/** Tunable escalation ladder. Offences decay after `decayMs` of good behaviour. */
export interface DefensePolicy {
  warnAt: number;
  tarpitAt: number;
  quarantineAt: number;
  banAt: number;
  /** How long a ban lasts before the actor is merely quarantined again. */
  banDurationMs: number;
  /** An actor with no offence newer than this is treated as a fresh actor again. */
  decayMs: number;
  /** Distinct senders seen within `floodWindowMs` above this count trip a flood signal. */
  floodThreshold: number;
  floodWindowMs: number;
}

export const DEFAULT_DEFENSE: DefensePolicy = {
  warnAt: 1,
  tarpitAt: 2,
  quarantineAt: 3,
  banAt: 5,
  banDurationMs: 24 * 60 * 60 * 1000,
  decayMs: 6 * 60 * 60 * 1000,
  floodThreshold: 8,
  floodWindowMs: 10_000,
};

/**
 * The posture earned by `offenceCount` offences whose worst technique is `worst`.
 *
 * A critical technique (credential harvesting) jumps straight to quarantine regardless of count:
 * one attempt to take the owner's keys is enough. Otherwise the posture climbs the ladder.
 */
export function postureFor(
  offenceCount: number,
  worst: Severity,
  policy: DefensePolicy = DEFAULT_DEFENSE,
): Posture {
  if (offenceCount >= policy.banAt) {
    return "ban";
  }
  if (offenceCount >= policy.quarantineAt) {
    return "quarantine";
  }
  if (worst === "critical") {
    return "quarantine";
  }
  if (offenceCount >= policy.tarpitAt) {
    return "tarpit";
  }
  if (offenceCount >= policy.warnAt) {
    return "warn";
  }
  return "observe";
}

/** True when a posture means the actor is fully cut off (no tools, memory, or model). */
export function isCutOff(posture: Posture): boolean {
  return posture === "quarantine" || posture === "ban";
}

/** One owner-facing line per posture, for `/defense`. */
const POSTURE_LINE: Record<Posture, string> = {
  observe: "observing",
  warn: "warned",
  tarpit: "tarpitting (stalling with decoys)",
  quarantine: "quarantined (cut off)",
  ban: "banned",
};

/** One owner-facing line naming a posture, for `/defense`. */
export function postureLine(posture: Posture): string {
  return POSTURE_LINE[posture];
}
