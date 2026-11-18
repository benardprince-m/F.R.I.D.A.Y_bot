# FRIDAY Core — Interface Contracts (v0)

**Status:** contracts-first. Other workstreams build against these shapes, not against each other's internals. Change a contract here before changing an implementation.

**Placement decision.** FRIDAY is a thin policy/persona layer over the OpenClaw engine, not a parallel stack (§6.1, §11). The engine already provides channels, memory storage, secrets, scheduling, doctor, and the provider extensions. FRIDAY adds the _policy_ the engine does not have: owner-only access, pre-egress PII/secret filtering, prompt-injection labelling, the memory Librarian, forget-with-evidence, the durable task ledger, and the debrief. These live in `extensions/friday/src/` as pure, dependency-light modules so they are unit-testable without credentials, network, or a running Gateway.

**Packaging.** FRIDAY ships as a bundled OpenClaw plugin (`extensions/friday/`, id `friday`), not as core `src/` code. `index.ts` is the thin wiring layer; `src/` holds the pure policy. This keeps the engine core unchanged and follows the engine's own "small core, capable plugins" doctrine. The plugin is disabled by default (`enabledByDefault: false`) and admits no one until `ownerIds` is configured (fail-closed).

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

Wired at `tool_result_persist` in `index.ts` via `fenceToolResultMessage` (gate.ts): every tool/web/file result is fenced before it enters the transcript, and already-fenced content (`isFencedContent`) is left unchanged so a re-persisted result is never nested. Proven in `index.test.ts` + `gate.test.ts`.

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

## A-04 · Conversation continuity (`extensions/friday/src/continuity.ts`)

Continuity via a bounded checkpoint, not a transcript dump (MSG-02, §7.4).

```ts
type TurnRole = "owner" | "friday";
interface Turn {
  role: TurnRole;
  text: string;
  at: Iso8601;
}
interface Checkpoint {
  version: 1;
  updatedAt: Iso8601;
  turnCount: number; // total turns ever folded in — survives tail trimming
  recent: Turn[]; // newest turns kept verbatim, bounded by maxTurns
  pinned: string[]; // stable facts, sourced from memory layers (not the transcript)
  openThreads: string[];
}
function foldCheckpoint(prev: Checkpoint, turns: readonly Turn[], limits?): Checkpoint;
function withPinned(cp: Checkpoint, facts: readonly string[], limits?): Checkpoint;
function withOpenThreads(cp: Checkpoint, threads: readonly string[], limits?): Checkpoint;
function renderCheckpoint(cp: Checkpoint, limits?): string;
```

Contract: the verbatim tail is bounded by `maxTurns` and the render by `maxChars`; every dropped turn is reported as an explicit "N earlier omitted" count, never a silent loss. Pinned facts come from the memory layers, so the checkpoint never becomes a second transcript. Inputs are never mutated. Durable persistence is E-02 (`continuity-store.ts`); the live `before_prompt_build` wiring remains.

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

## F-07 · Turn pipeline (`extensions/friday/src/turn.ts`)

The single seam the engine calls for one inbound message: admission → trust label → egress gate (§6.3, §7.15, §9).

```ts
function prepareTurn(inbound: InboundTurn, ctx: { config: FridayConfig }): PreparedTurn;
```

Contract: `prepareTurn` composes — it does **not** re-implement — the decision. Admission, lockdown, and the hard-credential gate come from `evaluateGate` (gate.ts, A-01/F-03); the trust label comes from `guardContent` (F-02). PII/secret scrubbing is F-01's `before_message_write` (`redactUserMessage`), applied once, not twice. So an admitted owner's message passes even under lockdown (F-03 keeps core messaging up), a non-owner is denied, and a credential-bearing turn is refused before any model sees it. Wired at `before_agent_run` in `index.ts`; proven in `index.test.ts`.

---

## F-05 · Protected-file integrity (`extensions/friday/src/policy/integrity.ts`)

The Constitution and persona are protected files; an unexpected change must be caught (§7.5).

```ts
function checkIntegrity(files: ProtectedFile[], baseline: IntegrityBaseline): IntegrityReport;
```

Contract: pure — it hashes content and compares against the baseline; it never reads the filesystem and never edits the Constitution "to fix" an incident. The owner records the approved baseline once from chat (`/trust-persona`); the baseline is persisted in the engine's SQLite plugin-state store (`extensions/friday/src/ops/integrity-baseline.ts`), never a JSON sidecar. `/doctor` (and, in Phase 1, the heartbeat) then compares the live files: `ok` / `violation` / `unverified`. A missing store or baseline is `unverified` — never a false `ok`. Wired in `index.ts`; proven in `index.test.ts` + `integrity-baseline.test.ts`.

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

## E-02 · Durable continuity store (`extensions/friday/src/continuity-store.ts`)

Restart-resume: persist the A-04 checkpoint in the engine's plugin-state store, keyed by session (AUT-02, §6.2).

```ts
function continuityStoreOptions(): OpenAsyncKeyedStoreOptions; // namespace "friday-continuity", reject-new
function continuityKey(sessionKey: string): string;
function isCheckpoint(value: unknown): value is Checkpoint;
function loadCheckpoint(store, sessionKey): Promise<Checkpoint | undefined>;
function saveCheckpoint(store, sessionKey, checkpoint): Promise<void>;
function clearCheckpoint(store, sessionKey): Promise<boolean>;
```

Contract: the store namespace is bounded with `overflowPolicy: "reject-new"` — a full namespace rejects a write loudly rather than silently evicting another session's checkpoint (the "no silent loss" guarantee). A stored value that fails `isCheckpoint` is treated as absent, never trusted: the store read is a trust boundary. Proven by a test that writes a checkpoint, closes the state DB, reopens a fresh store over the same state dir, and reads the checkpoint back. Wiring this store into the live `before_prompt_build`/turn path is a separate surgical change (WS-A/WS-G).

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

## C-01 · Model router (`extensions/friday/src/ops/router.ts`)

Cheap-first routing with a verifier-driven cascade (§7.10, §7.9).

```ts
function classifyTurn(prompt: string): "trivial" | "standard" | "hard";
function routeTurn(prompt: string, config: RouterConfig, state: RouterState): RoutingDecision;
function verifyLocalAnswer(answer: string): VerifierVerdict;
```

Contract: with no local provider configured the decision is `tier: "default"` (the engine's own routing); under lockdown or a spent budget a hard turn stays local rather than escalating to a paid target. FRIDAY never runs a second router — it only chooses which model the engine's gateway calls.

## C-02 · Model default & fallback layering (`extensions/friday/src/ops/model-chain.ts`)

FRIDAY's primary model plus an ordered free-tier fallback chain (§7.10), handed to the engine's gateway through `fallbacksOverride`.

```ts
function resolveModelChain(config?: ModelChainConfig): ModelChain;
function splitModelRef(ref: string): { provider: string; model: string };
function providerOf(ref: string): string;
function admittingRefs(refs, breakers, now, policy?): string[];
function effectiveChain(chain, breakers, now, policy?): ModelChain;
```

Contract: the primary defaults to `deepseek/deepseek-v4.1-flash` and the fallbacks default to the ordered free-tier chain Gemini → Groq → Mistral → Cohere → Cloudflare. The chain is always self-consistent: blank entries are dropped and the primary never repeats as a fallback. `effectiveChain` folds in live C-03 breaker health — the first admitting ref becomes the primary, so a provider whose breaker is open is skipped rather than retried every turn; if every ref is open the chain stays strict on the configured primary and fails honestly. An owner `model`/`modelChain` override replaces the defaults.

## C-03 · Circuit breaker (`extensions/friday/src/ops/breaker.ts`)

Stop calling a provider that keeps failing, so it cannot burn budget or latency on every turn (§7.9).

```ts
function newBreaker(): BreakerState;
function admit(state: BreakerState, now: number, policy?): BreakerAdmission;
function recordOutcome(state: BreakerState, ok: boolean, now: number, policy?): BreakerState;
function breakerLine(provider: string, state: BreakerState): string | undefined;
```

Contract: closed admits and trips open after `failureThreshold` consecutive failures; open refuses every call until the cooldown elapses, then admits exactly one half-open probe; a successful probe closes the breaker, a failed probe reopens it and restarts the cooldown. Outcomes for calls that were never admitted are ignored. The engine's own failover is unchanged — this is FRIDAY's _stopping_ policy layered on top, keyed by provider.

## C-05 · Spend ledger & budget (`extensions/friday/src/ops/ledger.ts`)

Per-call cost accounting and the monthly ceiling (§7.10).

```ts
function costOf(usage: ModelUsage): number;
function recordUsage(snapshot: LedgerSnapshot, usage: ModelUsage, at: string): LedgerSnapshot;
function decideBudget(snapshot: LedgerSnapshot, budgetUsd?: number): BudgetDecision;
function spendLine(snapshot: LedgerSnapshot, budgetUsd?: number): string;
```

Contract: an unknown model records zero cost rather than a guess; with no ceiling configured every call is allowed and the reason says so; at or past the ceiling the call is refused with the exact spend.

## G-01 · Heartbeat & night shift (`extensions/friday/src/ops/heartbeat.ts`)

Pulse cadence and the overnight work window (§7.8).

```ts
function inNightShift(hour: number, window: NightShiftWindow): boolean;
function decideHeartbeat(
  state: HeartbeatState,
  now: number,
  intervalMs: number,
  hour: number,
  window: NightShiftWindow,
): HeartbeatDecision;
async function heartbeatTick(
  state: HeartbeatState,
  now: number,
  deps: HeartbeatDeps,
): Promise<HeartbeatState>;
```

Contract: `decideHeartbeat`/`inNightShift` are pure — a paused heartbeat never fires and a window that wraps midnight (e.g. 23→6) is supported. `heartbeatTick` advances the loop by one beat and threads `lastBeatAt` through its return value (the caller owns persistence); a failed beat is reported and does **not** advance the clock, so the next tick retries rather than skipping. The service (`heartbeat-service.ts`) owns the loop: it schedules one beat a minute on the host scheduler (`PluginServiceSchedulerV1`, bound to the service lifetime), sets `paused` from the live `lockedDown` config each beat, and runs the F-05 integrity check on a liveness beat. A night-shift beat is a no-op in Phase 0 — the consolidation/skill work it will drive is Phase 1. Wired as the `friday-heartbeat` service in `index.ts`; proven in `heartbeat.test.ts` + `heartbeat-service.test.ts`.

## G-03 · `/doctor` in chat (`extensions/friday/src/ops/doctor.ts`)

Health status in the owner's chat, from a phone (§7.8, §9).

```ts
function buildDoctorReport(input: DoctorInput): DoctorReport;
```

Contract: the report is healthy / degraded / incident, built on the G-02 ladder over the components the plugin can verify (owner config, persona, durable continuity, and — when supplied — F-05 integrity and G-01 heartbeat liveness). It never claims "healthy" while the engine surfaces it cannot see from chat (model, telegram, memory, sandbox, vault, disk) are unverified — those cap the status at "degraded" and the report names them and points to `openclaw doctor` on the host. Wired as the owner-only `/doctor` command; it also runs the F-05 integrity check against the recorded baseline and reports whether the heartbeat service is beating.

## G-06 · Chat secret intake (`extensions/friday/src/ops/secrets.ts`)

The safe half of pasting a credential into chat (§7.11, §6.3).

```ts
function planSecretWrite(secretDir: string, name: string, value: string): SecretPlan;
function secretStoredReply(name: string): string;
```

Contract: the name is strictly `[A-Z][A-Z0-9_]{1,63}` and the file is `<secretDir>/<NAME>.secret`; a rejected name returns `ok: false` rather than a path that could escape `secretDir`. The reply never contains the value. The atomic write and the chat-message deletion are the caller's job.

## E-04 → D-01 · Skill promotion (`extensions/friday/src/skills/promotion.ts`)

The debrief-to-skill loop (§5.1, §7.6).

```ts
function decidePromotion(task: TaskRecord): PromotionDecision;
```

Contract: only a `done` task with at least one `evidence` entry and at least one approved tool is promotable; the candidate enters the acquisition protocol at `stage: "detected"`, never straight to production.

## C-05 → cache · Response cache (`extensions/friday/src/cache/response-cache.ts`)

Serve a repeated request with zero tokens (§7.10).

```ts
function cacheKey(text: string): string;
class ResponseCache {
  get(text: string, now: number): string | undefined;
  set(text: string, value: string, now: number): void;
}
```

Contract: the key is case- and whitespace-insensitive; the store is TTL- and size-bounded; a miss is always safe because the caller runs the model as usual.

---

## Engine wiring points (per workstream, surgical)

| Contract             | Engine entry point                                  | Workstream | Status                                                                                    |
| -------------------- | --------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| F-01 redactForEgress | `before_message_write` hook (pre-model user text)   | WS-F       | WIRED — `index.ts`; proven in `index.test.ts`                                             |
| C-01 routeTurn       | `before_model_resolve` hook (model selection)       | WS-C       | WIRED — `index.ts`; proven in `index.test.ts`; no-op until a local pair is set            |
| C-02 model chain     | `before_model_resolve` hook (`fallbacksOverride`)   | WS-C       | WIRED — `index.ts`; DeepSeek v4.1 Flash + free-tier chain; proven in `index.test.ts`      |
| C-03 breaker         | `model_call_ended` hook (per-call outcome)          | WS-C       | WIRED — `index.ts`; open breaker skips the provider; proven in `index.test.ts`            |
| F-02 guardContent    | `tool_result_persist` hook (tool/web/file results)  | WS-F       | WIRED — `index.ts` (`fenceToolResultMessage`); proven in `index.test.ts`                  |
| A-01 decideAdmission | `before_agent_run` hook (channel admission)         | WS-A       | WIRED — `index.ts`; proven in `index.test.ts`                                             |
| F-03 decideEgress    | `before_agent_run` hook (non-essential egress)      | WS-F       | WIRED — `index.ts`; `/lockdown` + `/unlock` commands proven in test                       |
| F-07 prepareTurn     | `before_agent_run` hook (the single turn seam)      | WS-F       | WIRED — `index.ts`; composes A-01/F-03 decision + F-02 label; proven in `index.test.ts`   |
| F-05 checkIntegrity  | `/doctor` + `/trust-persona` baseline (state store) | WS-F       | WIRED — `index.ts`; baseline persisted; proven in `index.test.ts`                         |
| G-01 heartbeat       | `registerService` v2 + `PluginServiceSchedulerV1`   | WS-G       | WIRED — `index.ts`; 60s loop, F-05 check on a beat; proven in `heartbeat-service.test.ts` |
| B-02/B-04            | memory write + forget commands                      | WS-B       | PENDING — no plugin-facing purge surface yet (see TASKBOARD F-04/B-04)                    |
| E-01/E-04            | task start / completion + chat reply                | WS-E       | PENDING — no plugin-facing task lifecycle hook yet                                        |

Each wiring is proven by a test that exercises the real entry point, not just the pure function.
