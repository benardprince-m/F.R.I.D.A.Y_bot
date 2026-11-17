// FRIDAY gate: the per-turn decision the engine calls at `before_agent_run`, plus the
// pre-egress text scrub the engine calls at `before_message_write`.
//
// Composition, in order (Product Specification §6.3, §7.15, §9; Constitution Article IV):
//   1. Admission   — only the owner may reach tools or memory (MSG-01, A-01).
//   2. Lockdown    — /lockdown stops non-essential egress, keeps owner messaging (F-03).
//   3. Egress scrub— PII and secrets are filtered before anything leaves for a model (F-01).
//
// This module is pure: it takes event facts and returns a decision. It performs no I/O, so
// it is unit-testable without credentials, network, or a running Gateway.

import type { AgentMessage } from "openclaw/plugin-sdk/agent-core";
import type { FridayConfig } from "./config.js";
import { guardContent, isFencedContent } from "./policy/injection-guard.js";
import { decideEgress } from "./policy/kill-switch.js";
import { decideAdmission, type SenderIdentity } from "./policy/owner-auth.js";
import { redactForEgress } from "./policy/redaction.js";

export interface GateEvent {
  prompt: string;
  channelId?: string;
  senderId?: string;
  senderIsOwner?: boolean;
}

export type GateDecision =
  | { outcome: "pass" }
  | { outcome: "block"; reason: string; message: string; category: string };

const PASS: GateDecision = { outcome: "pass" };

const DENIED_MESSAGE =
  "This assistant is private. Your message was not processed, and no tools or memory were used.";
const LOCKDOWN_MESSAGE =
  "Lockdown is active: I am not making non-essential outbound calls. Send /unlock to resume.";
const CREDENTIAL_MESSAGE =
  "Your message looked like it contained a credential, so I did not send it to any model. " +
  "Store credentials with /secret instead.";

/**
 * The host authenticates channel identity and sets `senderIsOwner`. FRIDAY treats that bit
 * as the primary authority; the optional `ownerIds` pin only narrows it (never broadens).
 * Fail-closed: anything not an admitted owner is denied.
 */
export function isAdmittedOwner(
  sender: SenderIdentity,
  hostSaysOwner: boolean,
  ownerIds: SenderIdentity[],
): boolean {
  if (!hostSaysOwner) {
    return false;
  }
  if (ownerIds.length === 0) {
    return true;
  }
  return decideAdmission(sender, ownerIds).admission === "owner";
}

/**
 * Decide whether one turn may reach a model with tools and memory available.
 *
 * A channel-originated turn is owner messaging: admitted owners pass even under lockdown
 * (they must still be able to reach FRIDAY and issue /unlock). A non-channel turn is
 * system-initiated (cron/heartbeat) and counts as non-essential egress, so lockdown blocks it.
 */
export function evaluateGate(event: GateEvent, cfg: FridayConfig): GateDecision {
  if (!event.channelId) {
    if (decideEgress("non-essential", { lockedDown: cfg.lockedDown }) === "block") {
      return {
        outcome: "block",
        reason: "lockdown",
        message: LOCKDOWN_MESSAGE,
        category: "lockdown",
      };
    }
    return PASS;
  }

  const sender: SenderIdentity = { channel: event.channelId, senderId: event.senderId ?? "" };
  if (!isAdmittedOwner(sender, event.senderIsOwner === true, cfg.ownerIds)) {
    return {
      outcome: "block",
      reason: "sender is not the owner; tools and memory withheld",
      message: DENIED_MESSAGE,
      category: "admission",
    };
  }

  if (redactForEgress(event.prompt).blocked) {
    return {
      outcome: "block",
      reason: "content contained a credential; not sent to any model",
      message: CREDENTIAL_MESSAGE,
      category: "credential",
    };
  }

  return PASS;
}

function redactContentText(content: unknown): { content: unknown; changed: boolean } {
  if (typeof content === "string") {
    const result = redactForEgress(content);
    return { content: result.text, changed: result.text !== content };
  }
  if (Array.isArray(content)) {
    let changed = false;
    const next = content.map((part) => {
      if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") {
          const result = redactForEgress(text);
          if (result.text !== text) {
            changed = true;
            return { ...part, text: result.text };
          }
        }
      }
      return part;
    });
    return { content: changed ? next : content, changed };
  }
  return { content, changed: false };
}

/**
 * Scrub PII from an owner's own user message before the transcript — and therefore the
 * model — ever sees it. Assistant and tool messages are model output, not egress, so they
 * are left untouched. Returns the original message when nothing changed.
 */
export function redactUserMessage(message: AgentMessage): AgentMessage {
  if (message.role !== "user") {
    return message;
  }
  const { content, changed } = redactContentText(message.content);
  return changed ? ({ ...message, content } as AgentMessage) : message;
}

function fenceContentText(content: unknown): { content: unknown; changed: boolean } {
  if (typeof content === "string") {
    if (isFencedContent(content)) {
      return { content, changed: false };
    }
    return { content: guardContent(content, "untrusted").text, changed: true };
  }
  if (Array.isArray(content)) {
    let changed = false;
    const next = content.map((part) => {
      if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && !isFencedContent(text)) {
          changed = true;
          return { ...part, text: guardContent(text, "untrusted").text };
        }
      }
      return part;
    });
    return { content: changed ? next : content, changed };
  }
  return { content, changed: false };
}

/**
 * Fence an untrusted tool/web/file result before it is persisted to the transcript (F-02).
 * Tool results are untrusted by default — they can carry injected instructions. Content that
 * already carries the envelope is left unchanged, so a re-persisted result is never nested.
 * Returns the original message when nothing changed.
 */
export function fenceToolResultMessage(message: AgentMessage): AgentMessage {
  if (!("content" in message)) {
    return message;
  }
  const { content, changed } = fenceContentText(message.content);
  return changed ? ({ ...message, content } as AgentMessage) : message;
}
