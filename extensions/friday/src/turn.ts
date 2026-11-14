// FRIDAY turn pipeline: the single seam the engine calls for one inbound message.
//
// Composition, in order (Product Specification §6.3, §7.15, §9):
//   1. Admission   — only the authenticated owner may reach tools or memory (MSG-01).
//   2. Trust label — untrusted content is fenced, never executed as instructions (§4.1 law 5).
//   3. Egress scrub— PII and secrets are filtered before anything leaves for a model (§7.15).
//   4. Egress gate — /lockdown blocks non-essential outbound traffic (§7.15).
//
// This module is pure: it takes data and returns a decision object. It performs no I/O, so
// it is unit-testable without credentials, network, or a running Gateway. Wiring it into the
// engine's model-egress path is a separate, surgical change proven at that entry point.
//
// Contract: see docs/contracts/friday-core.md.

import { guardContent, type GuardedContent, type TrustLevel } from "./policy/injection-guard.js";
import { decideEgress, type EgressClass } from "./policy/kill-switch.js";
import { decideAdmission, type SenderIdentity } from "./policy/owner-auth.js";
import { redactForEgress, type RedactionKind, type RedactionResult } from "./policy/redaction.js";

export interface InboundTurn {
  sender: SenderIdentity;
  text: string;
  /** Owner-typed content is "owner"; anything forwarded or fetched is "untrusted". */
  trust: TrustLevel;
}

export interface TurnContext {
  owner: SenderIdentity[];
  lockedDown: boolean;
  /** Egress class for the model call; defaults to "non-essential". */
  egressClass?: EgressClass;
  /** Redaction kinds the caller explicitly permits to pass through (never hard credentials). */
  allowRedactionKinds?: RedactionKind[];
}

export interface PreparedTurn {
  /** True only when the turn may reach a model with tools and memory available. */
  accepted: boolean;
  /** Human-readable, safe to log; never echoes raw sender ids or secret values. */
  reason: string;
  /** The content a model may see, after trust labelling and egress redaction. */
  modelText: string;
  guard: GuardedContent;
  redaction: RedactionResult;
  /** The egress gate result for the model call. */
  egress: "allow" | "block";
  allowTools: boolean;
  allowMemory: boolean;
}

const DENIED_REASON = "sender is not the owner; tools and memory withheld";

/**
 * Prepare one inbound turn for the model.
 *
 * Fails closed at every stage: a non-owner sender, a locked-down non-essential egress, or a
 * detected hard credential all produce `accepted: false` with an explicit reason. The model
 * only ever sees `modelText`, which has been trust-labelled and scrubbed.
 */
export function prepareTurn(inbound: InboundTurn, ctx: TurnContext): PreparedTurn {
  const admission = decideAdmission(inbound.sender, ctx.owner);
  const guard = guardContent(inbound.text, inbound.trust);
  const redaction = redactForEgress(guard.text, { allow: ctx.allowRedactionKinds });
  const egress = decideEgress(ctx.egressClass ?? "non-essential", { lockedDown: ctx.lockedDown });

  if (admission.admission !== "owner") {
    return {
      accepted: false,
      reason: DENIED_REASON,
      modelText: "",
      guard,
      redaction,
      egress: "block",
      allowTools: false,
      allowMemory: false,
    };
  }

  if (egress === "block") {
    return {
      accepted: false,
      reason: "lockdown active; non-essential model egress is blocked",
      modelText: "",
      guard,
      redaction,
      egress,
      allowTools: false,
      allowMemory: false,
    };
  }

  // A hard credential (key, token, private key, password) must never reach a model, even
  // redacted: refuse the turn and tell the owner to use the vault instead (§7.15, §9).
  if (redaction.blocked) {
    return {
      accepted: false,
      reason: "content contained a credential; not sent to any model — use the vault",
      modelText: "",
      guard,
      redaction,
      egress,
      allowTools: admission.allowTools,
      allowMemory: admission.allowMemory,
    };
  }

  return {
    accepted: true,
    reason: "owner turn accepted",
    modelText: redaction.text,
    guard,
    redaction,
    egress,
    allowTools: admission.allowTools,
    allowMemory: admission.allowMemory,
  };
}
