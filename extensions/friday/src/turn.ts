// FRIDAY turn pipeline: the single seam the engine calls for one inbound message
// (Product Specification §6.3, §7.15, §9; F-07).
//
// The pipeline is admission → trust label → egress scrub → egress gate. This module owns the
// COMPOSITION; it does not re-implement the policy:
//   * admission, lockdown, and the hard-credential gate are `evaluateGate` (gate.ts, A-01/F-03);
//   * PII/secret scrubbing happens once at `before_message_write` (F-01, `redactUserMessage`);
//   * untrusted content is fenced by `guardContent` (F-02) at the ingestion seam.
//
// Keeping the decision in one place (gate.ts) is deliberate: an earlier copy of this module
// re-derived it and blocked owner messaging under lockdown, contradicting F-03.
//
// Pure: it takes data and returns a decision object; no I/O, so it is unit-testable without
// credentials, network, or a running Gateway.
//
// Contract: see docs/contracts/friday-core.md (F-07).

import type { FridayConfig } from "./config.js";
import { evaluateGate, type GateEvent } from "./gate.js";
import { guardContent, type GuardedContent, type TrustLevel } from "./policy/injection-guard.js";

export interface InboundTurn extends GateEvent {
  /** Owner-typed content is "owner"; anything forwarded or fetched is "untrusted". */
  trust: TrustLevel;
}

export interface TurnContext {
  config: FridayConfig;
}

export interface PreparedTurn {
  /** True only when the turn may reach a model with tools and memory available. */
  accepted: boolean;
  /** Human-readable, safe to log; never echoes raw sender ids or secret values. */
  reason: string;
  /** Owner-facing block message ("" when accepted). */
  message: string;
  /** Block category for logging: "admission" | "lockdown" | "credential"; "" when accepted. */
  category: string;
  /** The trust-labelled content a model may see. PII scrubbing is F-01's `before_message_write`. */
  modelText: string;
  guard: GuardedContent;
}

/**
 * Prepare one inbound turn for the model.
 *
 * The decision is `evaluateGate` (fail-closed admission, lockdown, hard-credential block); the
 * trust label is `guardContent`. Redaction stays with F-01 so the scrub happens once, at the
 * message-write seam, not twice.
 */
export function prepareTurn(inbound: InboundTurn, ctx: TurnContext): PreparedTurn {
  const decision = evaluateGate(
    {
      prompt: inbound.prompt,
      channelId: inbound.channelId,
      senderId: inbound.senderId,
      senderIsOwner: inbound.senderIsOwner,
    },
    ctx.config,
  );
  const guard = guardContent(inbound.prompt, inbound.trust);

  if (decision.outcome === "pass") {
    return {
      accepted: true,
      reason: "turn accepted",
      message: "",
      category: "",
      modelText: guard.text,
      guard,
    };
  }
  return {
    accepted: false,
    reason: decision.reason,
    message: decision.message,
    category: decision.category,
    modelText: "",
    guard,
  };
}
