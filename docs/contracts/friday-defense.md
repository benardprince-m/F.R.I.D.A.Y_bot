# FRIDAY Defense & Autonomy — Interface Contracts (v0)

**Status:** contracts-first, same rule as `friday-core.md`. Change a contract here before changing an implementation.

**Scope.** Two related Phase 0/1 pillars that share one idea — FRIDAY acts on its own judgement without waiting for a fresh owner prompt:

- **Active defence (F-09, §7.15, §9; Constitution Article IV).** FRIDAY's answer to an intruder is _defence_, never offence. It detects a hostile technique, escalates a durable posture (warn → tarpit → quarantine → ban), stalls with decoys, and cuts a repeat offender off before the model runs. It never reaches out to an attacker's systems — spec §4.3 bans offensive tooling, and offence would make FRIDAY untrustworthy.
- **Autonomy (Phase 1 night shift, §5.1, §7.4, §7.6, §7.8).** While the owner sleeps FRIDAY works its own queue: it consolidates memory, plans what to advance, and self-critiques its own drafts before they ship. It never invents goals — every mission comes from state the owner already set up.

All modules here are pure (no I/O, no network); the wiring layer owns persistence and the clock.

---

## F-09 · Threat vocabulary (`extensions/friday/src/defense/threat.ts`)

One place defines what a threat _is_, how severe it is, and which posture it earns, so the reflex, the ledger, and the countermeasures can never disagree.

```ts
type ThreatSignal =
  | "prompt-extraction"
  | "config-probe"
  | "credential-harvest"
  | "instruction-override"
  | "role-confusion"
  | "tool-bait"
  | "flood";
type Severity = "none" | "low" | "medium" | "high" | "critical";
type Posture = "observe" | "warn" | "tarpit" | "quarantine" | "ban";
function severityOfSignal(signal: ThreatSignal): Severity;
function severityOf(signals: readonly ThreatSignal[]): Severity;
function atLeast(a: Severity, b: Severity): boolean;
function postureFor(offenceCount: number, worst: Severity, policy?: DefensePolicy): Posture;
function isCutOff(posture: Posture): boolean;
```

Contract: `credential-harvest` is `critical` and earns `quarantine` from a single offence; everything else climbs the ladder by count (`warnAt` 1, `tarpitAt` 2, `quarantineAt` 3, `banAt` 5). `isCutOff` is true for `quarantine` and `ban` — the postures that mean no model, no tools, no memory.

---

## F-09 · Instinct reflex (`extensions/friday/src/defense/instinct.ts`)

The fast, cheap first pass over every inbound message: tag the hostile technique(s), compute the immediate posture, and say whether the turn may proceed.

```ts
function detectThreats(text: string): ThreatSignal[];
function instinct(input: InstinctInput): InstinctResult; // { severity, techniques, posture, proceed, reason }
```

Contract: an **owner** turn is never an intrusion — the reflex only labels the techniques and always proceeds (an owner self-test must see FRIDAY resist, not get banned). A non-owner with a recognized technique is scored from their prior offence count; at `quarantine` or above `proceed` is false. The `reason` is log-safe and never echoes the message text.

---

## F-09 · Threat ledger (`extensions/friday/src/defense/ledger.ts`)

Memory is what turns a series of probes into a recognized campaign. The ledger records each offence against its actor, decays old offences, and exposes the actor's current posture.

```ts
function actorTag(actor: string): string; // short, stable, non-reversible
function offencesFor(ledger, actor, now, policy?): Offence[];
function postureOf(ledger, actor, now, policy?): Posture;
function recordOffence(ledger, actor, techniques, severity, now, policy?): RecordOutcome;
function activeThreats(ledger, now, policy?): { actor; posture; offences }[];
function isThreatLedger(value: unknown): value is ThreatLedger;
```

Contract: offences older than `decayMs` are pruned, so an actor who reforms is eventually treated as fresh and a one-off false positive never becomes a permanent ban. A ban, once earned, is stamped and lapses to quarantine after `banDurationMs`. Owner-facing lines show `actorTag` (a hash), never the raw id. `isThreatLedger` is the store read's trust boundary: a value that fails it is treated as absent.

---

## F-09 · Countermeasures (`extensions/friday/src/defense/countermeasures.ts`)

FRIDAY's "fight back" — deliberately _active defence_:

```ts
function countermeasure(posture: Posture, seed?: number): Countermeasure; // { posture, message, allowModel, alertOwner }
function alertLine(tag, posture, techniques, offences): string;
```

| Posture      | Message                    | Model | Owner alerted |
| ------------ | -------------------------- | ----- | ------------- |
| `observe`    | none                       | yes   | no            |
| `warn`       | one calm refusal           | no    | yes           |
| `tarpit`     | a plausible, useless decoy | no    | yes           |
| `quarantine` | none (cut off)             | no    | yes           |
| `ban`        | none (cut off)             | no    | no            |

Contract: a decoy is returned **directly**, never via the model — a non-owner must never reach the model, and the decoy burns the attacker's time while revealing nothing. `alertLine` never echoes the raw actor id.

---

## F-09 · Composed guard (`extensions/friday/src/defense/guard.ts`)

The single seam `index.ts` calls at `before_agent_run`, _around_ the deliberate gate.

```ts
function defendTurn(input: DefenseInput, ledger: ThreatLedger): DefenseDecision;
function actorSummary(ledger, actor, now): string;
```

Contract: the reflex runs first so a known-bad actor is cut off before the model is reached. A hostile **non-owner** is recorded and escalated; the **owner** is never recorded; a clean stranger is not recorded (the deliberate gate denies them). The reflex only ever _narrows_ access — it never broadens it. `proceed` is false when the posture is cut off or the countermeasure withholds the model.

---

## F-09 · Threat store (`extensions/friday/src/defense/store.ts`)

Durable persistence for the ledger, one row in the `friday-threats` keyed store (bounded, `reject-new`).

```ts
function openThreatStore(runtime): ThreatStore | undefined;
function loadThreats(store): Promise<ThreatLedger>;
function saveThreats(store, ledger): Promise<void>;
```

Contract: `loadThreats` returns an empty ledger when the row is missing or fails `isThreatLedger` — the read is a trust boundary. A missing host store degrades to a visible `/defense` message, never a silent no-op.

---

## F-09 wiring (`index.ts`)

- `before_agent_run` — the reflex runs before `prepareTurn`'s deliberate gate. A cut-off decision returns `{ outcome: "block", category: "defense" }` so the model is never reached; the deliberate gate still owns admission and credential policy.
- `/defense` — owner-only; prints the active threat ledger (posture + offence count per actor, hashed).

---

## Autonomy · Night-shift missions (`extensions/friday/src/autonomy/missions.ts`)

The planner maps outstanding state to an ordered, bounded plan.

```ts
function planNightShift(ctx: MissionContext): Mission[];
function renderPlan(missions: readonly Mission[]): string;
```

Contract: missions come only from state the owner already set up (open tasks, memory pending consolidation, acquisitions mid-protocol, a requested brief) — the planner never invents goals. Ordering reflects readiness (running task > planned > consolidation > acquisition research > brief) and the plan is capped at `maxMissions` so a shift is bounded work.

---

## Autonomy · Self-critique (`extensions/friday/src/autonomy/critique.ts`)

Before FRIDAY ships an answer it reads its own draft the way a hostile reviewer would.

```ts
function critiqueAnswer(draft: string): Critique; // { verdict: "ship"|"revise"|"escalate", issues, score, reason }
function mayShip(critique: Critique): boolean;
function critiqueLine(critique: Critique): string;
```

Contract: an **empty/too-short** draft and a draft carrying a **hard credential** (`redactForEgress().blocked`) are `revise` — they must not ship as-is. An **unsupported success claim**, **hedging**, or a **truncated** draft is `escalate`. Everything else clean is `ship`. Generic PII (an email, an IP, a long number) is _not_ a reason to revise: it is common in a legitimate technical answer and is already handled on egress to the model by F-01; gating on it would loop on benign text.

---

## Autonomy · Memory consolidation (`extensions/friday/src/memory/consolidate.ts`)

The one unattended memory job that is both useful and safe (B-06).

```ts
function consolidateMemory(
  records,
  now,
  options?,
): { records: StoredMemory[]; report: ConsolidateReport };
function renderConsolidation(report: ConsolidateReport): string;
```

Contract: (1) decay — drop records past the horizon whose importance is below the floor; (2) merge — collapse records that normalize to the same (or a containing) text, keeping the best score and the longer text; (3) cap — keep the highest-scoring `maxRecords`. The report names every record removed or merged, so the morning brief is honest. Decay never touches a record at or above `decayImportance`.

---

## Autonomy wiring (`index.ts` + `heartbeat-service.ts`)

- `before_agent_finalize` — for an **owner** turn only, `critiqueAnswer` runs on the last assistant message; a `revise` verdict returns `{ action: "revise", reason }` so the harness takes another pass. The engine bounds the revision loop, so this cannot spin.
- `HeartbeatService` — an injected `runNightShift` runs inside the night-shift window on a beat: it consolidates memory, plans the shift from open tasks, and logs the honest outcome. A failure is logged and never crashes the loop.

---

## Engine wiring points

| Contract          | Engine entry point                         | Status                                                                             |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| F-09 `defendTurn` | `before_agent_run` hook (before the gate)  | WIRED — `index.ts`; proven in `index.test.ts` + `scenario-under-attack.test.ts`    |
| F-09 `/defense`   | owner command                              | WIRED — `index.ts`; proven in `index.test.ts`                                      |
| `critiqueAnswer`  | `before_agent_finalize` hook (owner turns) | WIRED — `index.ts`; proven in `index.test.ts` + `scenario-under-attack.test.ts`    |
| `runNightShift`   | `HeartbeatService` night-shift beat        | WIRED — `index.ts` + `heartbeat-service.ts`; proven in `heartbeat-service.test.ts` |
