# FRIDAY Core — Interface Contracts (v0)

**Status:** contracts-first. Other workstreams build against these shapes, not against each other's internals. Change a contract here before changing an implementation.

**Placement decision.** FRIDAY is a thin policy/persona layer over the FRIDAY engine, not a parallel stack (§6.1, §11). The engine already provides channels, memory storage, secrets, scheduling, doctor, and the provider extensions. FRIDAY adds the _policy_ the engine does not have: owner-only access, pre-egress PII/secret filtering, prompt-injection labelling, the memory Librarian, forget-with-evidence, the durable task ledger, and the debrief. These live in `extensions/friday/src/` as pure, dependency-light modules so they are unit-testable without credentials, network, or a running Gateway.

**Packaging.** FRIDAY ships as a bundled FRIDAY plugin (`extensions/friday/`, id `friday`), not as core `src/` code. `index.ts` is the thin wiring layer; `src/` holds the pure policy. This keeps the engine core unchanged and follows the engine's own "small core, capable plugins" doctrine. The plugin is disabled by default (`enabledByDefault: false`) and admits no one until `ownerIds` is configured (fail-closed).

**Wiring rule.** Nothing in `extensions/friday/src/` reaches into engine internals. Each module is a pure function or a small class with explicit inputs. Wiring into engine entry points (model egress, channel admission, memory writes) happens only in `index.ts` through the documented plugin SDK hooks, proven by `index.test.ts` at those hook boundaries.

---

## Shared types

```ts
/** UTC ISO-8601 timestamp, e.g. "2026-11-13T13:40:00Z". */
type Iso8601 = string;

/** A claim's epistemic status. Never collapse these (§4.1 law 4). */
type Confidence = "verified" | "inference" | "uncertain" | "failed" | "opinion";

/** Provenance for any stored fact (§7.4). */
interface Provenance {
  source: string; // conversation id, task id, or document ref
  date: Iso8601;
  confidence: Confidence;
}
```

---

## F-01 · PII & secret filter (`extensions/friday/src/policy/redaction.ts`)

Runs **before** content leaves for any third-party model (§7.15, §6.3, §9).

```ts
interface RedactionResult {
  text: string; // content with PII/secrets replaced by stable tokens
  findings: RedactionFinding[];
  blocked: boolean; // true if a hard secret (credential) was found
}
interface RedactionFinding {
  kind: RedactionKind;
  token: string;
}
type RedactionKind =
  | "email"
  | "phone"
  | "national-id"
  | "card"
  | "ip"
  | "api-key"
  | "bearer-token"
  | "private-key"
  | "password-assignment";

function redactForEgress(input: string, opts?: { allow?: RedactionKind[] }): RedactionResult;
```

Contract: deterministic; same input → same tokens; tokens are stable within a call so a model can reference them; raw secret values never appear in `text`, `findings`, or any log.

---

## F-02 · Prompt-injection guard (`extensions/friday/src/policy/injection-guard.ts`)

Untrusted content is labelled, never executed as instructions (§4.1 law 5, §7.15).

```ts
type TrustLevel = "owner" | "untrusted";
interface GuardedContent {
  text: string; // content wrapped in an untrusted-content envelope when untrusted
  trust: TrustLevel;
  signals: string[]; // e.g. ["instruction-override", "role-confusion", "tool-bait"]
}
function guardContent(input: string, trust: TrustLevel): GuardedContent;
```

Contract: never mutates meaning for `owner` content; wraps and annotates `untrusted` content; detection is heuristic and the output says so — it never claims to have "sanitised" all attacks.

---

## A-01 · Owner admission (`extensions/friday/src/policy/owner-auth.ts`)

Owner-only access; unknown senders get no tools and no memory (§9, MSG-01).

```ts
type Admission = "owner" | "denied";
interface SenderIdentity {
  channel: string;
  senderId: string;
}
interface AdmissionDecision {
  admission: Admission;
  reason: string; // human-readable, safe to log
  allowTools: boolean;
  allowMemory: boolean;
}
function decideAdmission(sender: SenderIdentity, owner: SenderIdentity[]): AdmissionDecision;
```

Contract: fail-closed — anything not an exact owner match is `denied` with `allowTools:false, allowMemory:false`.

---

## F-03 · Lockdown kill switch (`extensions/friday/src/policy/kill-switch.ts`)

Stop non-essential egress; keep owner messaging (§7.15).

```ts
type EgressClass = "owner-messaging" | "essential" | "non-essential";
type EgressDecision = "allow" | "block";
function decideEgress(kind: EgressClass, state: { lockedDown: boolean }): EgressDecision;
```

Contract: when `lockedDown`, `non-essential` is blocked, `owner-messaging` and `essential` are allowed.

---

## B-02 · Librarian classify (`extensions/friday/src/memory/librarian.ts`)

ADD / UPDATE / MERGE / NOOP with an importance×recency×use score (§7.4).

```ts
type MemoryOp = "ADD" | "UPDATE" | "MERGE" | "NOOP";
interface CandidateMemory {
  text: string;
  provenance: Provenance;
  importance: number /* 0..1 */;
}
interface ExistingMemory {
  id: string;
  text: string;
  provenance: Provenance;
  useCount: number;
  lastUsed: Iso8601;
}
interface LibrarianDecision {
  op: MemoryOp;
  targetId?: string;
  score: number;
  reason: string;
}
function classify(
  candidate: CandidateMemory,
  existing: ExistingMemory[],
  now: Iso8601,
): LibrarianDecision;
```

Contract: an ambiguous statement is never promoted to certain fact — the caller passes `confidence` and the Librarian refuses to ADD `uncertain` as a durable fact without a confirmation flag.

---

## B-04 · Forget with evidence (`extensions/friday/src/memory/forget.ts`)

Purge across every layer and prove it (§7.4, §14).

```ts
interface MemoryLayer {
  name: string;
  entries: { id: string; text: string }[];
}
interface ForgetReport {
  query: string;
  purged: { layer: string; ids: string[] }[];
  totalPurged: number;
  remainingMatches: { layer: string; ids: string[] }[]; // must be empty on success
  complete: boolean;
}
function forget(
  layers: MemoryLayer[],
  query: string,
): { layers: MemoryLayer[]; report: ForgetReport };
```

Contract: `complete` is true only when `remainingMatches` is empty across all layers; the report is the evidence, not a claim.

---

## E-01 / E-04 · Task ledger & debrief (`extensions/friday/src/tasks/ledger.ts`)

Durable record + honest debrief (§6.2, §5.1).

```ts
type TaskStatus =
  | "planned"
  | "running"
  | "waiting-owner"
  | "done"
  | "partial"
  | "failed"
  | "blocked";
interface TaskRecord {
  id: string;
  owner: string;
  goal: string;
  status: TaskStatus;
  startedAt: Iso8601;
  checkpoint?: string;
  approvedTools: string[];
  budgetUsd?: number;
  nextWake?: string;
  evidence: string[];
  costUsd?: number;
}
function createTask(
  init: { owner: string; goal: string; approvedTools: string[]; budgetUsd?: number },
  now: Iso8601,
): TaskRecord;
function resume(task: TaskRecord, checkpoint: string): TaskRecord;
function renderDebrief(task: TaskRecord): string;
```

Contract: `renderDebrief` never claims success without at least one `evidence` entry; a `done` task with no evidence renders as `partial` with an explicit note.

---

## Engine wiring points (per workstream, surgical)

| Contract             | Engine entry point                                  | Workstream | Status                                                                 |
| -------------------- | --------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| F-01 redactForEgress | `before_message_write` hook (pre-model user text)   | WS-F       | WIRED — `index.ts`; proven in `index.test.ts`                          |
| F-02 guardContent    | untrusted-content ingestion (tool/file/web results) | WS-F       | PENDING — pure fn ready; no ingestion hook yet                         |
| A-01 decideAdmission | `before_agent_run` hook (channel admission)         | WS-A       | WIRED — `index.ts`; proven in `index.test.ts`                          |
| F-03 decideEgress    | `before_agent_run` hook (non-essential egress)      | WS-F       | WIRED — `index.ts`; `/lockdown` + `/unlock` commands proven in test    |
| B-02/B-04            | memory write + forget commands                      | WS-B       | PENDING — no plugin-facing purge surface yet (see TASKBOARD F-04/B-04) |
| E-01/E-04            | task start / completion + chat reply                | WS-E       | PENDING — no plugin-facing task lifecycle hook yet                     |

Each wiring is proven by a test that exercises the real entry point, not just the pure function.
