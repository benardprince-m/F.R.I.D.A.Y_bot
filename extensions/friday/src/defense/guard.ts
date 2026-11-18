// FRIDAY defense: the composed per-turn guard. One call runs the reflex, records the offence in
// the durable ledger, and returns the active countermeasure (Product Specification §7.15, §9).
//
// This is the seam `index.ts` calls at `before_agent_run`, *around* the deliberate gate: the
// reflex is fast and runs first, so a known-bad actor is cut off before the model is ever
// reached, while the deliberate gate still decides admission and credential policy. Composition
// lives here so the wiring layer stays thin and this whole decision is unit-testable.
//
// Pure: it takes the ledger and the clock and returns the next ledger plus the decision. The
// caller owns persistence. Nothing here performs I/O or reaches the network.
//
// Contract: see docs/contracts/friday-defense.md.

import { alertLine, countermeasure, type Countermeasure } from "./countermeasures.js";
import { instinct, type InstinctResult } from "./instinct.js";
import { actorTag, offencesFor, postureOf, recordOffence, type ThreatLedger } from "./ledger.js";
import { isCutOff, type DefensePolicy } from "./threat.js";

export interface DefenseInput {
  prompt: string;
  /** Channel-scoped actor key, e.g. "telegram:6666666"; undefined for non-channel turns. */
  actor?: string;
  /** True when the host resolved the sender as the owner. */
  fromOwner: boolean;
  now: number;
  /** A flood flag the caller computes from recent-arrival timing. */
  flood?: boolean;
  policy?: DefensePolicy;
}

export interface DefenseDecision {
  /** The ledger after this event (unchanged when nothing was recorded). */
  ledger: ThreatLedger;
  /** What the reflex saw. */
  instinct: InstinctResult;
  /** The active response to apply. */
  countermeasure: Countermeasure;
  /** True when the turn may continue to the deliberate gate. */
  proceed: boolean;
  /** Owner-facing alert text when the owner should be told; "" otherwise. */
  alert: string;
  /** Short, log-safe summary (never echoes the message text or the raw actor id). */
  reason: string;
}

/**
 * Run the reflex for one inbound turn and, for a hostile non-owner, record the offence and
 * escalate the actor's posture.
 *
 * The owner is never recorded: an owner testing FRIDAY sees it resist but is not escalated. A
 * non-owner with no recognized technique is not recorded either — a plain stranger is denied by
 * the deliberate gate, not by the ledger.
 */
export function defendTurn(input: DefenseInput, ledger: ThreatLedger): DefenseDecision {
  const policy = input.policy;
  const prior = input.actor ? offencesFor(ledger, input.actor, input.now, policy).length : 0;
  const reflex = instinct({
    prompt: input.prompt,
    trust: "untrusted",
    fromOwner: input.fromOwner,
    priorOffences: prior,
    ...(input.flood !== undefined ? { flood: input.flood } : {}),
    ...(policy ? { policy } : {}),
  });

  // A hostile non-owner is recorded and escalated. Everyone else is passed through with the
  // reflex's own posture (owner: observe; clean stranger: observe).
  if (!input.fromOwner && input.actor && reflex.techniques.length > 0) {
    const recorded = recordOffence(
      ledger,
      input.actor,
      reflex.techniques,
      reflex.severity,
      input.now,
      policy,
    );
    const posture = postureOf(recorded.ledger, input.actor, input.now, policy);
    const cm = countermeasure(posture, input.now);
    const alert = cm.alertOwner
      ? alertLine(actorTag(input.actor), posture, reflex.techniques, recorded.offences)
      : "";
    return {
      ledger: recorded.ledger,
      instinct: { ...reflex, posture },
      countermeasure: cm,
      proceed: !isCutOff(posture) && cm.allowModel,
      alert,
      reason: `${reflex.reason} → recorded (${recorded.offences} offence(s))`,
    };
  }

  const cm = countermeasure(reflex.posture, input.now);
  return {
    ledger,
    instinct: reflex,
    countermeasure: cm,
    proceed: reflex.proceed,
    alert: "",
    reason: reflex.reason,
  };
}

/** One owner-facing line for `/defense`: the current posture of a single actor. */
export function actorSummary(ledger: ThreatLedger, actor: string, now: number): string {
  const posture = postureOf(ledger, actor, now);
  const offences = offencesFor(ledger, actor, now).length;
  return `${actorTag(actor)}: ${posture} (${offences} offence(s))`;
}
