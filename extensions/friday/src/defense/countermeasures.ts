// FRIDAY defense: active countermeasures (Product Specification §7.15, §9; Constitution
// Article IV).
//
// This is FRIDAY's "fight back", and it is deliberately *active defence* — never offence:
//
//   observe   — log and continue.
//   warn      — a single, calm refusal; the actor learns FRIDAY saw them.
//   tarpit    — stall the attacker: plausible-sounding decoy answers, slow, and always false.
//               A tarpit burns the attacker's time and budget and feeds them nothing real.
//   quarantine— cut the actor off entirely: no model, no tools, no memory, no signal.
//   ban       — quarantine that persists until it lapses.
//
// Every message here is either honest (the owner-facing alert) or a deliberate decoy aimed at a
// confirmed intruder. Nothing here reaches out to the attacker's systems, fingerprints them, or
// takes any offensive action — that is forbidden by spec §4.3 and by the Constitution, and it
// would make FRIDAY untrustworthy. Defence in depth, offence never.
//
// Contract: see docs/contracts/friday-defense.md. Pure: it maps a posture to a message.

import type { Posture, ThreatSignal } from "./threat.js";

export interface Countermeasure {
  /** The posture that produced this response. */
  posture: Posture;
  /** What the actor is told (decoy or refusal). */
  message: string;
  /** Whether the turn proceeds to a model at all. */
  allowModel: boolean;
  /** Whether the owner should be alerted about this actor. */
  alertOwner: boolean;
}

/** Honest owner-facing alert lines, one per posture that warrants the owner's attention. */
const ALERT_PREFIX = "🛡️ FRIDAY defence:";

/**
 * The decoys handed to a confirmed intruder at the tarpit tier.
 *
 * These are chosen to be *plausible and useless*: they invite the attacker to spend effort on a
 * dead end. They are never mixed with real configuration, real keys, or real capability. The
 * goal is to waste the attacker's time, not to deceive the owner.
 */
const DECOYS: readonly string[] = [
  "Sure — I'm generating that now. This may take a moment while I assemble the details…",
  "Understood. I've queued that request for processing. Please hold while I verify access…",
  "Working on it. I need to check a few things first; this can take a little while.",
  "Got it. Compiling the information you asked for — one moment while I prepare the summary.",
];

/**
 * Build the active response for a posture.
 *
 * `seed` keeps decoy choice deterministic for a given actor+time so the tarpit does not look
 * random in a way that reveals it is a tarpit (a fixed rotation reads as a busy assistant).
 */
export function countermeasure(posture: Posture, seed = 0): Countermeasure {
  const base: Record<Posture, Omit<Countermeasure, "posture">> = {
    observe: { message: "", allowModel: true, alertOwner: false },
    warn: {
      message: "I can't help with that. If you're the owner, message me from your usual account.",
      allowModel: false,
      alertOwner: true,
    },
    // The decoy is returned directly, never via the model: a non-owner must never reach the
    // model, and a plausible non-answer costs the attacker a round trip while revealing
    // nothing. It reads like a busy assistant, not like a refusal.
    tarpit: {
      message: DECOYS[Math.abs(seed) % DECOYS.length]!,
      allowModel: false,
      alertOwner: true,
    },
    quarantine: { message: "", allowModel: false, alertOwner: true },
    ban: { message: "", allowModel: false, alertOwner: false },
  };
  return { posture, ...base[posture] };
}

/** The owner-facing alert for an escalated actor. Never echoes the raw actor id. */
export function alertLine(
  tag: string,
  posture: Posture,
  techniques: readonly ThreatSignal[],
  offences: number,
): string {
  const seen = techniques.length > 0 ? ` (${techniques.join(", ")})` : "";
  return `${ALERT_PREFIX} actor ${tag} → ${posture}${seen}; ${offences} offence(s) on record.`;
}
