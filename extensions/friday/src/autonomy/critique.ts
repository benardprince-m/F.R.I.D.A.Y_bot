// FRIDAY autonomy: self-critique. Before FRIDAY ships an answer, it reads its own draft the way
// a hostile reviewer would (Product Specification §5.1, §7.9; Constitution Article I).
//
// This is the instinct that keeps FRIDAY honest and sharp: it catches the two failure modes that
// erode trust fastest — claiming success without proof, and leaking something it should not —
// and it decides whether the draft is good enough, needs a revision, or should escalate to a
// stronger model. Pure and cheap, so it can run on every answer.
//
// Contract: see docs/contracts/friday-defense.md. Pure: it maps a draft to a verdict.

import { redactForEgress } from "../policy/redaction.js";

export type CritiqueVerdict = "ship" | "revise" | "escalate";

export interface CritiqueIssue {
  kind: "unsupported-success" | "leak" | "hedging" | "truncated" | "empty" | "too-short";
  detail: string;
}

export interface Critique {
  verdict: CritiqueVerdict;
  issues: CritiqueIssue[];
  /** 0 (unusable) to 1 (clean); the caller may gate on it. */
  score: number;
  reason: string;
}

/** Phrases that claim a completed action. A claim with no evidence nearby is a red flag. */
const SUCCESS_CLAIMS = [
  "done",
  "completed",
  "finished",
  "fixed",
  "deployed",
  "sent",
  "saved",
  "created",
  "updated",
  "deleted",
  "successfully",
];

/** Hedges that mean the model was unsure; a hard turn may deserve an escalation. */
const HEDGES = [
  "i'm not sure",
  "i am not sure",
  "i don't know",
  "i do not know",
  "cannot determine",
  "unsure",
  "maybe",
];

function looksLikeClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return SUCCESS_CLAIMS.some((c) => new RegExp(`\\b${c}\\b`).test(lower));
}

/** Evidence markers: a claim near one of these is supported, not empty. */
function hasEvidence(text: string): boolean {
  return /(\d+\s*(?:files?|tests?|passed|failed)|\btest(?:s|ed)?\b|\bverified\b|\bproof\b|\bevidence\b|\boutput\b|\bexit\s*\d|\b20\d\d-\d\d-\d\d\b)/i.test(
    text,
  );
}

/**
 * Critique a draft answer.
 *
 * The checks, in priority order:
 *   1. empty / too short  — nothing useful was produced.
 *   2. leak               — the draft carries a credential or PII that must not ship as-is.
 *   3. unsupported success — a completion claim with no evidence next to it.
 *   4. hedging / truncation — the model admitted uncertainty or was cut off.
 *
 * A leak is always "revise" (never ship). Uncertainty on an otherwise clean answer is
 * "escalate" so a hard turn can climb to a stronger model. Everything else clean is "ship".
 */
export function critiqueAnswer(draft: string): Critique {
  const text = draft.trim();
  const issues: CritiqueIssue[] = [];

  if (text.length === 0) {
    issues.push({ kind: "empty", detail: "draft is empty" });
  } else if (text.length < 8) {
    issues.push({ kind: "too-short", detail: "draft is too short to be an answer" });
  }

  // Only a *hard* credential (key/token/private key/password) must not ship as-is. Generic PII
  // (an email, an IP, a long number) is common in a legitimate technical answer and is already
  // handled on egress to the model by F-01; forcing a revision for it would loop on benign text.
  const leak = redactForEgress(text);
  if (leak.blocked) {
    issues.push({
      kind: "leak",
      detail: `draft carries ${leak.findings.map((f) => f.kind).join(", ") || "a credential"}`,
    });
  }

  if (looksLikeClaim(text) && !hasEvidence(text)) {
    issues.push({
      kind: "unsupported-success",
      detail: "claims a completed action with no evidence attached",
    });
  }

  const lower = text.toLowerCase();
  if (HEDGES.some((h) => lower.includes(h))) {
    issues.push({ kind: "hedging", detail: "answer admits uncertainty" });
  }
  if (text.endsWith("...") || text.endsWith("…")) {
    issues.push({ kind: "truncated", detail: "answer looks truncated" });
  }

  return score(issues);
}

function score(issues: CritiqueIssue[]): Critique {
  const kinds = new Set(issues.map((i) => i.kind));
  let verdict: CritiqueVerdict = "ship";
  if (kinds.has("empty") || kinds.has("too-short") || kinds.has("leak")) {
    verdict = "revise";
  } else if (kinds.has("unsupported-success") || kinds.has("hedging") || kinds.has("truncated")) {
    verdict = "escalate";
  }
  const penalty = issues.length * 0.2;
  const value = Math.max(0, Math.min(1, 1 - penalty));
  return {
    verdict,
    issues,
    score: value,
    reason:
      verdict === "ship"
        ? "draft is clean"
        : verdict === "revise"
          ? "draft must not ship as-is"
          : "draft may need a stronger model",
  };
}

/** Whether a draft may ship unchanged. */
export function mayShip(critique: Critique): boolean {
  return critique.verdict === "ship";
}

/** One owner-facing line for a critique, for `/doctor` and the debrief. */
export function critiqueLine(critique: Critique): string {
  if (critique.verdict === "ship") {
    return "self-critique: clean";
  }
  const detail = critique.issues.map((i) => i.kind).join(", ");
  return `self-critique: ${critique.verdict} (${detail})`;
}
