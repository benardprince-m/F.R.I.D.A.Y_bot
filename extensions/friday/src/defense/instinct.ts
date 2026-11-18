// FRIDAY instincts: the fast reflex layer that runs before the deliberate gate (Product
// Specification §7.15, §9; Constitution Article IV).
//
// The turn gate (`turn.ts`) is deliberate and complete, but it is also the same path for every
// message. Instincts are the part that reacts first and cheaply: a single pass that (a) tags the
// hostile technique(s) in the text, (b) decides the immediate posture, and (c) says whether the
// turn may even proceed. It is pure and allocation-light, so it can run on every inbound message
// without a measurable cost.
//
// This module never *acts* — it assesses. The durable consequences (recording an offence,
// escalating a ban) live in the threat ledger; the visible consequences (a refusal, a decoy)
// live in the countermeasures. Instincts only answer "what is this, and how do I feel about it".
//
// Contract: see docs/contracts/friday-defense.md.

import type { TrustLevel } from "../policy/injection-guard.js";
import {
  postureFor,
  severityOf,
  type DefensePolicy,
  type Posture,
  type Severity,
  type ThreatSignal,
} from "./threat.js";

/** One hostile-technique detector. Ordered most-specific first so overlaps read correctly. */
interface Detector {
  signal: ThreatSignal;
  regex: RegExp;
}

const DETECTORS: readonly Detector[] = [
  // Taking the keys is the most serious move: detect it before the generic config probe.
  {
    signal: "credential-harvest",
    regex:
      /\b(give|send|share|tell|show|reveal|what(?:'s| is))\b[^.\n]{0,30}\b(api[ _-]?key|token|password|passwd|secret|credential|private key)\b/i,
  },
  {
    signal: "config-probe",
    regex:
      /\b(show|print|dump|reveal|display|list|what(?:'s| is))\b[^.\n]{0,30}\b(config|configuration|env|environment|settings|\.env|secrets?)\b/i,
  },
  {
    signal: "prompt-extraction",
    regex:
      /\b(system prompt|your instructions|your rules|initial prompt|repeat (?:your )?(?:prompt|instructions))\b/i,
  },
  {
    signal: "instruction-override",
    regex:
      /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|restrictions?)\b/i,
  },
  {
    signal: "role-confusion",
    regex:
      /\b(you are now|act as|pretend to be|developer mode|jailbreak|dan mode|new instructions?:)\b/i,
  },
  {
    signal: "tool-bait",
    regex: /\b(run|execute|eval)\b[^.\n]{0,30}\b(command|shell|script|code)\b/i,
  },
];

/**
 * Classify a message for hostile techniques, cheaply and deterministically.
 *
 * Only the *techniques* are returned here; severity and posture come from the shared vocabulary
 * so every layer agrees. An empty array means nothing hostile was recognized.
 */
export function detectThreats(text: string): ThreatSignal[] {
  const found: ThreatSignal[] = [];
  for (const detector of DETECTORS) {
    if (detector.regex.test(text)) {
      found.push(detector.signal);
    }
  }
  return found;
}

export interface InstinctInput {
  prompt: string;
  /** The trust label the turn already carries. */
  trust: TrustLevel;
  /** True when the sender is the admitted owner (owner probing is a self-test, not an attack). */
  fromOwner: boolean;
  /** Offences already on record for this actor, after decay. */
  priorOffences: number;
  /** A message-rate flood flag computed by the caller from recent-arrival timing. */
  flood?: boolean;
  policy?: DefensePolicy;
}

export interface InstinctResult {
  severity: Severity;
  techniques: ThreatSignal[];
  /** The posture this single event calls for, given the actor's history. */
  posture: Posture;
  /** True when the turn may proceed to the deliberate gate. False = cut off immediately. */
  proceed: boolean;
  /** A short, log-safe summary; never echoes the raw text. */
  reason: string;
}

/**
 * The reflex decision for one inbound message.
 *
 * Owner messages are never treated as an intrusion — an owner testing FRIDAY should see it
 * resist, not be banned — so for the owner the reflex only *labels* the techniques and always
 * proceeds. For anyone else, the posture is computed from the offence history and, at
 * quarantine or above, the turn is cut off before the model ever runs.
 */
export function instinct(input: InstinctInput): InstinctResult {
  const policy = input.policy;
  const techniques = detectThreats(input.prompt);
  const withFlood: ThreatSignal[] =
    input.flood && !techniques.includes("flood") ? [...techniques, "flood"] : techniques;
  const severity = severityOf(withFlood);

  if (input.fromOwner) {
    return {
      severity,
      techniques: withFlood,
      posture: "observe",
      proceed: true,
      reason: withFlood.length > 0 ? `owner self-test: ${withFlood.join(", ")}` : "owner turn",
    };
  }

  const offences = input.priorOffences + (withFlood.length > 0 ? 1 : 0);
  const posture = postureFor(offences, severity, policy);
  const proceed = posture === "observe" || posture === "warn" || posture === "tarpit";
  return {
    severity,
    techniques: withFlood,
    posture,
    proceed,
    reason:
      withFlood.length > 0
        ? `intruder: ${withFlood.join(", ")} (${severity}); posture ${posture}`
        : "no hostile technique recognized",
  };
}
