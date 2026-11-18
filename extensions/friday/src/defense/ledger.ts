// FRIDAY defense: the durable threat ledger (Product Specification §7.15, §9).
//
// An instinct (`instinct.ts`) assesses one message in isolation. Memory is what turns a series
// of probes into a recognized campaign: the ledger records each offence against the actor who
// committed it, decays old offences, and exposes the actor's current posture. This is what lets
// FRIDAY escalate — warn, tarpit, quarantine, ban — instead of meeting every probe as if it were
// the first.
//
// Pure and serialisable: the caller persists it in the engine's plugin-state store. The actor
// key is channel-scoped and never the raw id in a rendered line (privacy: an owner-facing list
// shows a short hash, not the id).
//
// Contract: see docs/contracts/friday-defense.md.

import {
  DEFAULT_DEFENSE,
  postureFor,
  type DefensePolicy,
  type Posture,
  type Severity,
  type ThreatSignal,
} from "./threat.js";

export interface Offence {
  /** Epoch ms when the offence was recorded. */
  at: number;
  techniques: ThreatSignal[];
  severity: Severity;
}

export interface ActorRecord {
  /** Channel-scoped actor key, e.g. "telegram:6666666". */
  actor: string;
  offences: Offence[];
  /** Epoch ms a ban was applied; the ban lapses after `banDurationMs`. */
  bannedAt?: number;
}

export interface ThreatLedger {
  actors: ActorRecord[];
}

export function createThreatLedger(): ThreatLedger {
  return { actors: [] };
}

/** A short, stable, non-reversible tag for an actor, safe to show the owner. */
export function actorTag(actor: string): string {
  let h = 2166136261;
  for (let i = 0; i < actor.length; i += 1) {
    h ^= actor.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `#${(h >>> 0).toString(16).padStart(8, "0").slice(0, 8)}`;
}

function prune(offences: readonly Offence[], now: number, decayMs: number): Offence[] {
  return offences.filter((o) => now - o.at < decayMs);
}

/** Offences on record for an actor after decay; empty when the actor is unknown. */
export function offencesFor(
  ledger: ThreatLedger,
  actor: string,
  now: number,
  policy: DefensePolicy = DEFAULT_DEFENSE,
): Offence[] {
  const record = ledger.actors.find((a) => a.actor === actor);
  if (!record) {
    return [];
  }
  return prune(record.offences, now, policy.decayMs);
}

/** The actor's current posture from the live (decayed) offence history. */
export function postureOf(
  ledger: ThreatLedger,
  actor: string,
  now: number,
  policy: DefensePolicy = DEFAULT_DEFENSE,
): Posture {
  const live = offencesFor(ledger, actor, now, policy);
  const record = ledger.actors.find((a) => a.actor === actor);
  const banned = record?.bannedAt !== undefined && now - record.bannedAt < policy.banDurationMs;
  const worst = live.reduce<Severity>(
    (w, o) => (severityRank(o.severity) > severityRank(w) ? o.severity : w),
    "none",
  );
  const posture = postureFor(live.length, worst, policy);
  // A ban lapses to quarantine after its duration rather than vanishing entirely.
  if (banned) {
    return "ban";
  }
  if (posture === "ban") {
    return "ban";
  }
  return posture;
}

function severityRank(s: Severity): number {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : s === "low" ? 1 : 0;
}

export interface RecordOutcome {
  ledger: ThreatLedger;
  posture: Posture;
  /** Total live offences after this one. */
  offences: number;
}

/**
 * Record one offence against an actor and return the new ledger plus the resulting posture.
 *
 * Recording also drops offences older than the decay window, so the ledger stays bounded and an
 * actor who reforms is eventually treated as fresh. A ban, once earned, is stamped so it can
 * lapse on its own.
 */
export function recordOffence(
  ledger: ThreatLedger,
  actor: string,
  techniques: readonly ThreatSignal[],
  severity: Severity,
  now: number,
  policy: DefensePolicy = DEFAULT_DEFENSE,
): RecordOutcome {
  const existing = ledger.actors.find((a) => a.actor === actor);
  const keptOffences = prune(existing?.offences ?? [], now, policy.decayMs);
  const offence: Offence = { at: now, techniques: [...techniques], severity };
  const offences = [...keptOffences, offence];
  const worst = offences.reduce<Severity>(
    (w, o) => (severityRank(o.severity) > severityRank(w) ? o.severity : w),
    "none",
  );
  const posture = postureFor(offences.length, worst, policy);
  const record: ActorRecord = {
    actor,
    offences,
    ...(posture === "ban"
      ? { bannedAt: existing?.bannedAt ?? now }
      : existing?.bannedAt !== undefined
        ? { bannedAt: existing.bannedAt }
        : {}),
  };
  const others = ledger.actors.filter((a) => a.actor !== actor);
  return { ledger: { actors: [...others, record] }, posture, offences: offences.length };
}

/** Actors currently at or above `minPosture`, newest offence first — for `/defense`. */
export function activeThreats(
  ledger: ThreatLedger,
  now: number,
  policy: DefensePolicy = DEFAULT_DEFENSE,
): { actor: string; posture: Posture; offences: number }[] {
  return ledger.actors
    .map((a) => ({
      actor: a.actor,
      posture: postureOf(ledger, a.actor, now, policy),
      offences: offencesFor(ledger, a.actor, now, policy).length,
    }))
    .filter((t) => t.offences > 0 && t.posture !== "observe")
    .toSorted((a, b) => severityRankPosture(b.posture) - severityRankPosture(a.posture));
}

function severityRankPosture(p: Posture): number {
  return p === "ban" ? 4 : p === "quarantine" ? 3 : p === "tarpit" ? 2 : p === "warn" ? 1 : 0;
}

/** Validate a ledger read back from the store before trusting it (the read is a trust boundary). */
export function isThreatLedger(value: unknown): value is ThreatLedger {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.actors)) {
    return false;
  }
  return v.actors.every((a) => {
    if (typeof a !== "object" || a === null) {
      return false;
    }
    const r = a as Record<string, unknown>;
    return typeof r.actor === "string" && Array.isArray(r.offences);
  });
}
