# AGENT_LOG

Append-only record of every implementation session on PROJECT FRIDAY. Never rewrite history to make a session appear successful. Newest entries at the top. All timestamps UTC.

Format per entry: goal · scope · plan · execution · verification (exact commands + actual results) · side effects · outcome · known risks · next action.

---

## 2026-11-16T23:00Z — Lane 4 · C-03 circuit breaker (memory wiring deferred to owner)

**Goal:** The planned Lane 4 was B-02/B-04 memory write + forget wiring. Recon showed that is not honestly buildable yet, so the lane pivoted to the clearly-unblocked C-03 circuit breaker and the memory-wiring gap was recorded as a named blocker.

**Why the pivot (evidence):**

- The engine exposes **no plugin-facing memory read/write/delete surface** (`grep` of `src/plugins/runtime/types-core.ts` and `src/plugin-sdk/plugin-test-api.ts`: only `registerMemoryCapability`/`registerMemoryPromptSupplement`/`registerMemoryCorpusSupplement` registration hooks, no search/write/delete). FRIDAY's own `forget.ts`/`librarian.ts` are pure policy over layers the caller supplies.
- So a `/forget` command or a Librarian write path would have to invent a competing memory owner next to `extensions/memory-core` — a one-owner-per-responsibility violation and a consequential architecture decision. Recorded as **BLK-7** (owner decision) and marked the B-04 row "wiring BLOCKED-INPUT" rather than shipping a dishonest stub.
- C-03 was explicitly requested on the board ("engine has failover; add breaker policy") and is pure, so it was the correct next unblocked lane.

**Scope:** `extensions/friday/src/ops/breaker.ts` (+ test), `docs/contracts/friday-core.md` (C-03), `TASKBOARD.md` (C-03 row + BLK-7). No engine internals.

**Execution:**

- Added the pure circuit breaker: `newBreaker`, `admit`, `recordOutcome`, `breakerLine`, keyed by provider. Closed trips open after N consecutive failures; open refuses all calls until the cooldown elapses, then admits exactly one half-open probe; a successful probe closes, a failed probe reopens and restarts the cooldown; outcomes for un-admitted calls are ignored. The engine's own failover is untouched — this is only the _stopping_ policy.

**Verification (exact commands + actual results):**

- `pnpm test extensions/friday/src/ops/breaker.test.ts` → **10 passed**.
- `pnpm tsgo:extensions` → clean (exit 0).
- `node scripts/run-oxlint.mjs extensions/friday` → clean (exit 0).

**Side effects:** New module + test; two docs; board gained BLK-7. Committed on `main`.

**Outcome:** Completed — breaker policy done and proven. Memory write/forget wiring is now a named owner decision (BLK-7), not a silent gap.

**Known risks:** The breaker is not yet consulted on the live call path (needs the engine's per-call outcome signal); named in the contract as a follow-up.

**Next action:** Lane 5 · G-01 heartbeat wiring over the engine's cron/heartbeat.

---

## 2026-11-16T22:40Z — G-03 · `/doctor` in chat

**Goal:** Lane 3 of the serial plan — give the owner a phone-only health window: ask "are you well?" in chat and get an honest answer with evidence (§7.8, §9).

**Scope:** `extensions/friday/src/ops/doctor.ts` (+ test), `extensions/friday/index.ts` (command wiring), `extensions/friday/index.test.ts`, `docs/contracts/friday-core.md` (G-03), `TASKBOARD.md` (G-03). No engine internals.

**Execution:**

- Added `buildDoctorReport`: maps the signals the plugin can actually verify (owner configured, persona present, durable continuity store available, lockdown, routing) through the existing G-02 degradation ladder to healthy / degraded / incident, with a line-by-line evidence list.
- Honesty rule enforced in code: the engine surfaces the plugin cannot see from chat (model, telegram, memory, sandbox, vault, disk) are listed as unverified and cap the status at "degraded". FRIDAY refuses to print "healthy" while core surfaces are unverified, and points the owner to `openclaw doctor` on the host.
- Wired an owner-only `/doctor` command in `index.ts` (same `requireAuth` + `exposeSenderIsOwner` pattern as `/lockdown`); it reads live config and checks the store opener's presence best-effort.

**Verification (exact commands + actual results):**

- `pnpm test extensions/friday/src/ops/doctor.test.ts extensions/friday/index.test.ts` → **23 passed** (5 new doctor-unit, 3 new `/doctor` entry-point tests).
- `pnpm tsgo:extensions` → clean (exit 0).
- `node scripts/run-oxlint.mjs extensions/friday` → clean (exit 0).

**Side effects:** New module + test; `index.ts` gained one command; two docs. Committed on `main`.

**Outcome:** Completed — the owner can now get an honest health status from chat, and the report never overstates health.

**Known risks:** The status is honest by construction but conservative (always at least "degraded" until engine surfaces are verified); the richer per-component engine checks remain the host `doctor`'s job.

**Next action:** Lane 4 · B-02/B-04 memory write + forget wiring — the `/forget` path with purge evidence.

---

## 2026-11-16T22:20Z — E-02 · Durable continuity store (restart-resume)

**Goal:** Lane 2 of the serial plan — make the A-04 checkpoint durable so a restart cannot silently lose conversation continuity (AUT-02).

**Scope:** `extensions/friday/src/continuity-store.ts` (+ test), `test/vitest/vitest.extension-database-workers-paths.mjs` (lane routing), `docs/contracts/friday-core.md` (E-02), `TASKBOARD.md` (E-02). No engine internals.

**Execution:**

- Recon (narrow, read-only subagent) pinned the engine's plugin-state store contract: writes are `register` (upsert) / `registerIfAbsent`, reads are async `lookup`, conditional mutation is `observe` + `compareAndApply`; values are JSON, capped at 1 MiB. The opener `api.runtime.state.openKeyedStore` is synchronous and returns a store whose methods are async.
- Added `continuity-store.ts`: the only place the A-04 checkpoint is persisted, keyed by session in the `friday-continuity` namespace. `loadCheckpoint` validates every stored value with `isCheckpoint` and treats a mismatch as absent — the store read is a trust boundary, so a corrupt/version-mismatched row cannot crash a turn.
- Store choice: bounded namespace with `overflowPolicy: "reject-new"`. A full namespace rejects a write loudly instead of silently evicting another session's checkpoint — the "no silent loss" guarantee. (Tried `retention: "retained"` first; retained stores require shared-state admission that the test worker cannot install, and `reject-new` is the honest bounded form anyway.)
- Test proof of restart-resume: write a checkpoint, close the state DB, reopen a fresh store over the same state dir, read the checkpoint back. Real store, no mocks.
- Lane fix: the store opens the shared SQLite state DB, which requires the main-thread broker, so the test is routed to the `extension-database-workers` lane (`pool: "forks"`) — the same lane as `extensions/memory-core`, whose store tests work this way.

**Verification (exact commands + actual results):**

- `pnpm test extensions/friday/src/continuity-store.test.ts` → **6 passed** (in the database-workers lane; includes the restart-persistence test).
- `pnpm test extensions/friday/src/continuity.test.ts` → 11 passed (unchanged).
- `pnpm tsgo:extensions` → clean (exit 0).
- `node scripts/run-oxlint.mjs extensions/friday` → clean (exit 0).

**Side effects:** New module + test; one test-lane routing list; two docs. Committed on `main`.

**Outcome:** Completed — the continuity checkpoint is durable and restart-safe at the store boundary. The live `before_prompt_build` wiring (load → fold → render → save per turn) is the remaining E-02 slice; it needs the turn's session key and belongs with the WS-A/WS-G wiring, recorded in the contract and board.

**Known risks:** The store is validated but the live wiring is not yet exercised end to end (no Telegram token yet to drive a real turn); this is a named gap, not a silent one.

**Next action:** Lane 3 · G-03 `/doctor` in chat — the owner's phone-only health window, using the existing degradation policy.

---

## 2026-11-16T22:00Z — A-04 · Conversation continuity via bounded checkpoint

**Goal:** Lane 1 of the serial plan — build the pure continuity policy for "remembers" (MSG-02) at unit level, without pulling persistence forward.

**Scope:** `extensions/friday/src/continuity.ts` (+ test), `docs/contracts/friday-core.md` (A-04), `TASKBOARD.md` (A-04 row). No engine internals; no wiring yet.

**Execution:**

- Added `continuity.ts`: a versioned `Checkpoint` (bounded verbatim tail + pinned facts + open threads + a `turnCount` that survives trimming), with `foldCheckpoint`, `withPinned`, `withOpenThreads`, `renderCheckpoint`. Deterministic, no I/O, no mutation of inputs.
- Honesty invariant: when the tail or the char cap drops turns, the render reports an explicit "N earlier omitted" count — trimming is never a silent loss.
- Deliberately deferred persistence + the `before_prompt_build` wiring to E-02 (Lane 2), where the store decision lives; the checkpoint is already plain JSON so resume is a serialise/parse.
- Host restarted mid-lane (5 min uptime): the WS-C commit `698f26e5f` survived; the pnpm shim + corepack cache were wiped. Rebuilt the shim as a self-healing wrapper that re-prepares pnpm on first use, so a restart no longer blocks the build.

**Verification (exact commands + actual results):**

- `pnpm test extensions/friday/src/continuity.test.ts` → **11 passed** (first run 10/11: my own test expectation was wrong — newest-wins dedup keeps the newest `a`, corrected the expectation, not the code).
- `pnpm tsgo:extensions` → clean (exit 0).
- `node scripts/run-oxlint.mjs extensions/friday` → clean (exit 0).

**Side effects:** New module + test; two docs updated. Committed on `main`.

**Outcome:** Completed — A-04 pure policy done and proven; persistence/wiring handed to E-02 with an explicit note in both the contract and the board row.

**Known risks:** The checkpoint bounds size but does not summarise semantically (that needs a model); acceptable for Phase 0 and named in the module header.

**Next action:** Lane 2 · E-02 restart-resume: decide the persistence surface, persist the checkpoint, wire `resume()` and the continuity render at the engine seam.

---

## 2026-11-16T18:20Z — WS-C: model router + ops/cache/skill-promotion units; cutover repaired

**Goal:** Finish the in-flight WS-C batch left by a session the host killed mid-run, and repair the cutover it did not complete.

**Scope:** `extensions/friday/` (entry wiring, config, new pure modules), `docs/contracts/friday-core.md`, `TASKBOARD.md`, `src/plugins/contracts/boundary-invariants.test.ts`. No engine internals changed.

**Execution:**

- **Recovered the orphaned batch.** `git status` showed uncommitted work from ~8.5 h earlier: a new `before_model_resolve` hook in `index.ts`, four new pure modules (`ops/router.ts`, `ops/ledger.ts`, `ops/heartbeat.ts`, `ops/secrets.ts`, `cache/response-cache.ts`, `skills/promotion.ts`) with tests, and config-field additions. All were unit-green but undocumented and not fully cut over.
- **Repaired a red gate.** The new `before_model_resolve` hook was not on the bundled typed-hook allowlist, so `src/plugins/contracts/boundary-invariants.test.ts` failed (1 failed / 11 passed). Added the hook to the `extensions/friday/index.ts` guards entry → 12/12.
- **Reconciled config with the manifest.** The orphaned `config.ts` parsed four fields (`secretDir`, `budgetUsd`, `cacheTtlMs`, `cacheMaxEntries`) that the manifest schema (`additionalProperties: false`) does not declare and that nothing reads. Trimmed the parser to the fields actually honored (`ownerIds`, `lockedDown`, `personaDir`, `localProvider`, `localModel`) so the operator surface cannot advertise a setting that does nothing.
- **Added a guard test** (`config.test.ts`) asserting the parser accepts exactly the fields the manifest declares, so this drift cannot recur silently.
- **Wired C-01** is honest: `routeTurn` is a no-op until `localProvider`/`localModel` are set; under lockdown or a spent budget a hard turn stays local rather than escalating.

**Verification (exact commands + actual results):**

- `pnpm test extensions/friday` → 27 files, **192 passed**.
- `pnpm test src/plugins/contracts` → 2 files, **64 passed** (incl. boundary-invariants 12/12).
- `pnpm tsgo:extensions` → clean (exit 0).
- `node scripts/run-oxlint.mjs extensions/friday` → clean (exit 0).
- Restored the pnpm 12.11.1 shim (lost on restart) and cleared a stale `dist-artifacts` lock owned by a dead PID before running the gates.

**Side effects:** Edits under `extensions/friday/`, the contracts doc, `TASKBOARD.md`, and one core test allowlist. Committed on `main`. Repository private.

**Outcome:** Completed — WS-C router wired at a real entry point; five new pure units documented and proven; red gate repaired; config surface made honest.

**Known risks:** Ledger persistence, response-cache and secret-store wiring, and the heartbeat loop still need a bounded store plus a phone-readable read surface; wiring them now would be a dishonest stub (recorded in `index.ts`). Live channel/model proof remains BLOCKED-INPUT (owner credentials).

**Next action:** Wire the ledger/cache/heartbeat once a bounded store and a phone-readable surface exist; otherwise continue the remaining WS-A/WS-G entry-point wiring.

---

## 2026-11-14T12:45Z — Cruft removal; mass-rebrand reverted (correctness)

**Goal:** Owner's two asks — (1) why pushed commits were not visible, (2) delete OpenClaw cruft not essential to the FRIDAY build.

**Scope:** Repository root, `.github/`, `docs/assets/`. No engine logic changed.

**Execution:**

- ASK-1 (push visibility): 17 commits were local-only. Confirmed `origin` is the owner's own repo (`benardprince-m/F.R.I.D.A.Y_bot`), pushed `main`.
- ASK-2 (delete cruft): removed `.github/pr-proof/` (13 files, 1.2 MB of OpenClaw PR screenshots) and `.github/ISSUE_TEMPLATE/` (4 files) — zero references anywhere. Then removed 17 orphaned docs assets: `docs/assets/sponsors/*.svg` (14 upstream sponsor logos, no page renders them), `docs/assets/pixel-lobster.svg`, `docs/assets/openclaw-banner-light.png`, `docs/assets/macos-onboarding/05-permissions.png`. All verified with `git grep` per basename.
- **Mass rebrand attempted three times and reverted each time.** The standalone brand word `OpenClaw` is an overloaded token in this engine: it is simultaneously display prose, protocol identity (`X-OpenRouter-Title`, `MM-API-Source`, `OpenClaw.SQLITE`, `OpenClaw-Publication:` commit trailers), filesystem paths (`apps/macos/Sources/OpenClaw/`, 1300 native paths), GitHub workflow `name:` fields, and GitHub user handles (`handle: "openclaw"`). A string-only rename changes consumers (tests/scripts) without their producers (directories/workflows) and desyncs every one of those. The first attempt (`0c98f7e4`) shipped dangling path strings (`apps/macos/Sources/FRIDAY/` against an `OpenClaw/` directory) and was reverted (`382c8c52e`) before anything depended on it.

**Verification (exact commands + actual results):**

- `git grep -l <basename>` per deleted asset → 0 references outside the file.
- `node scripts/run-vitest.mjs run --config test/vitest/vitest.cli.config.ts src/cli/banner.test.ts src/cli/tagline.test.ts src/cli/claw-banner.test.ts` → 2 files, 9 tests passed (wordmark clean, no mascot art).
- `git diff f2565414 HEAD --stat` after revert → empty (tree identical to last-good).

**Side effects:** Commits `f1fbe941` (PR-proof + issue templates) and `312a702` (docs assets) on `main`, pushed. Revert commit `382c8c52`. Repository private.

**Outcome:** Completed — ASK-1 resolved; ASK-2 advanced with the safely-deletable cruft removed.

**Known risks:** The user-facing rebrand (already done in `35bdaa53`/`bcb001d1` for CLI `--version`, help, descriptors) must NOT be extended to a repo-wide sed. Per §2.3, internal contracts (`openclaw` binary, config keys, state paths, `OpenClawConfig`) stay unchanged; the rest of the `OpenClaw` token is coupled to paths/protocols/handles and a mechanical rename breaks the build. Any further rebrand must be surgical and per-surface.

**Next action:** None pending for these asks. Continue Phase 0 wiring (soul layer into entry points) when unblocked.

---

## 2026-11-14T09:37Z — WS-D: skill acquisition protocol + manifest validation

**Goal:** Build WS-D, the last workstream with no implementation — the controlled capability-acquisition protocol (§7.6) and the skill manifest (§6.3).

**Scope:** `src/friday/skills/` (new) — `acquisition.ts` + test, `manifest.ts` + test. No engine internals modified.

**Execution:**

- `acquisition.ts`: `mayAdvance(record, next)` enforces the 8-step protocol as a gated state machine — one stage at a time; assessment must pass before sandbox; sandbox must be clean and a disable path recorded before registration; production/paid access requires explicit owner approval.
- `manifest.ts`: `validateManifest()` requires name/version/description/permissions/dataClasses/egress/cost/failureBehavior/disablePath. Rejects a `customer` data class (DeepMark boundary open, §12 #7) and a `credential` data class (secrets come from the vault); warns on paid skills.

**Verification (exact commands + actual results):**

- `pnpm test src/friday --maxWorkers=1` → **17 files, 106 tests passed** (2.5s).
- `pnpm tsgo:core` → **exit 0**.

**Side effects:** Four new files; board updated (D-01, D-02 → DONE-PROOF). Repository still private.

**Outcome:** Completed — WS-D contracts implemented and proven. Phase 0 soul layer is now broadly complete at unit level.

**Known risks:** Not wired into the engine's skill registry yet. D-03 (Agent-Reach) remains BLOCKED-INPUT.

**Next action:** Engine wiring phase (turn pipeline, secret intake, integrity, correction, degradation, acquisition) at the real entry points — the point at which a full build is required to prove it.

---

## 2026-11-14T09:36Z — WS-B/WS-G: five-layer memory map + degradation ladder

**Goal:** Close the five-layer memory contract (B-01) and the degradation ladder with honest status (G-02).

**Scope:** `src/friday/memory/layers.ts` + test, `src/friday/policy/degradation.ts` + test. No engine internals modified.

**Execution:**

- `layers.ts`: declares the five spec layers (core-identity, working, episodic, semantic, vault) with holds/rule/engine-surface. The vault is explicitly NOT a purgeable memory layer; the four real layers are what "forget" targets. Each layer maps to an existing engine surface (no second store, §6.1).
- `degradation.ts`: `capabilityTier()` (full → reduced → low-power → offline) and `healthReport()` (healthy/degraded/incident) with an honest summary naming each non-up component. Never reports healthy when a component is not up.

**Verification (exact commands + actual results):**

- `pnpm test src/friday --maxWorkers=1` → **15 files, 90 tests passed** (2.4s).
- `pnpm tsgo:core` → **exit 0**.

**Side effects:** Four new files; board updated (B-01, G-02 → DONE-PROOF). Repository still private.

**Outcome:** Completed — both implemented and proven.

**Known risks:** Neither is wired into the engine yet. The layer map is a contract, not a store; the actual purge must be wired to the engine's memory write/forget path.

**Next action:** Continue unblocked work; then engine wiring (turn pipeline, secret intake, integrity, correction, degradation) at the real entry points.

---

## 2026-11-14T09:35Z — WS-A/WS-E: quiet modes + idempotency keys

**Goal:** Close two more unblocked, spec-mandated gaps: the quiet-mode/escalation ceiling (MSG-06) and idempotency keys for money/public writes (AUT-06).

**Scope:** `src/friday/policy/quiet-modes.ts` + test, `src/friday/tasks/idempotency.ts` + test. No engine internals modified.

**Execution:**

- `quiet-modes.ts`: `decideDelivery(mode, urgency)` — free delivers all; school/focus/dnd/sleep queue non-emergencies; only `emergency` overrides a quiet mode. `mayFollowUp()` enforces the one-follow-up ceiling (two pings total).
- `idempotency.ts`: `idempotencyKey(scope, action, target)` derives a stable key; `claim()` blocks a retried intent; `record()` is append-only (a second record for the same key is a NOOP).

**Verification (exact commands + actual results):**

- `pnpm test src/friday --maxWorkers=1` → **13 files, 77 tests passed** (2.3s).
- `pnpm tsgo:core` → **exit 0**.

**Side effects:** Four new files; board updated (A-05, E-03 → DONE-PROOF). Repository still private.

**Outcome:** Completed — both modules implemented and proven.

**Known risks:** Neither is wired into the engine yet (delivery path, external-write path). The idempotency ledger is in-memory until persisted.

**Next action:** Continue unblocked soul-layer work (degradation ladder G-02, five-layer memory map B-01); then engine wiring.

---

## 2026-11-14T09:34Z — WS-B/WS-F: correction path + protected-file integrity check

**Goal:** Close two unblocked, spec-mandated soul-layer gaps that need no credentials: the memory correction path (§7.4) and the Constitution/persona integrity check (§7.5).

**Scope:** `src/friday/memory/correction.ts` + test, `src/friday/policy/integrity.ts` + test. No engine internals modified.

**Plan:** Implement each as a pure module with its invariant proven by test, then wire later.

**Execution:**

- `correction.ts`: `correct(record, newText, newProvenance, now, reason)` replaces the current value, appends the superseded value to an append-only `history`, and returns an audit entry. `currentValue()` reads only the current field, so the old value is never revived as truth.
- `integrity.ts`: `buildBaseline()` / `checkIntegrity()` / `renderIntegrityReport()` over sha256 content hashes. Flags changed / missing / unexpected protected files; the alert contains hashes only, never file contents.

**Verification (exact commands + actual results):**

- `pnpm test src/friday --maxWorkers=1` → **11 files, 67 tests passed** (2.1s).
- `pnpm tsgo:core` → **exit 0**.

**Side effects:** Four new files; board updated (B-05, F-05 → DONE-PROOF). Repository still private.

**Outcome:** Completed — both modules implemented and proven.

**Known risks:** Integrity baseline is not yet stored anywhere (owner-approved baseline file is a wiring task). Correction history is not yet persisted. Engine wiring for both unstarted.

**Next action:** Continue unblocked soul-layer work; then wire the turn pipeline, secret intake, integrity check, and correction into the engine entry points.

---

## 2026-11-14T09:32Z — Phone-only constraint baked in + secret intake from chat

**Goal:** Act on a new binding constraint — the owner is phone-only (no laptop, no desktop) — and implement the one phone-only requirement that needs no host: ingesting a credential pasted into chat, storing it, and deleting the message.

**Scope:** `docs/contracts/phone-only.md` (new), `src/friday/policy/secret-intake.ts` (new) + test, `TASKBOARD.md`, `OWNER_REQUIREMENTS.md`. No engine internals modified.

**Plan:**

1. Record the phone-only constraint and its consequences as a contract.
2. Promote it into the taskboard (new task G-06) and the owner report (hosting/deploy/secret-intake decisions).
3. Implement the secret-intake parser now — it is phone-only-critical and testable without a host.

**Execution:**

- Wrote `docs/contracts/phone-only.md`: chat is the only interface _and_ the only management channel; deploys must be phone-triggerable; secrets pasted in chat then deleted; `doctor` in chat is the owner's only health window. Proposed default host: a managed always-on host with a phone web UI (Fly.io/Railway/Render class). No new phone app (§4.1 law 2).
- Added TASKBOARD `G-06` (phone-only control path); rewrote `OWNER_REQUIREMENTS.md` with a "Priority 2b — phone-only operational decisions" block (hosting platform, deploy trigger, secret intake).
- Wrote `parseSecretIntake(text)`: recognises `/secret NAME value` and `/secret set NAME value`; captures the value verbatim (multi-line PEM supported); returns `{kind:"store", name, value, deleteMessage:true, reply}` where the reply never contains the value. Bare `/secret` → help; ordinary messages → ignore.

**Verification (exact commands + actual results):**

- `pnpm test src/friday/policy/secret-intake.test.ts --maxWorkers=1` → **9 tests passed**.
- `pnpm test src/friday --maxWorkers=1` → **9 files, 57 tests passed** (2.0s).
- `pnpm tsgo:core` → **exit 0**.
- (Recreated the `~/.local/bin/pnpm` shim again — a host restart cleared `$HOME` for the second session in a row.)

**Side effects:** Two new files, one new contract, board + owner-report updates. Not yet committed at time of writing; committed this session. Repository still private.

**Outcome:** Completed — phone-only constraint recorded and enforced in the build plan; secret intake implemented and proven.

**Known risks:** The phone-only _deploy/update_ path (G-06 remainder) and the host choice are BLOCKED-INPUT. Full `pnpm build` still not run (host OOMs). The `deleteMessage` step is the caller's obligation — its engine wiring is unstarted.

**Next action:** Wire `parseSecretIntake` into the channel ingress (store via the engine secret store, then delete the message). Continue unblocked soul-layer work (WS-B five-layer map, WS-E resume wiring).

---

## 2026-11-13T22:40Z — WS-F: compose the FRIDAY turn pipeline at one seam

**Goal:** Reduce the Phase 0 engine wiring from four separate hooks to one, by composing the soul-layer policies into a single pure function the engine calls per inbound message.

**Scope:** `src/friday/turn.ts` (new), `src/friday/turn.test.ts` (new). No engine internals modified.

**Plan:** Compose admission → trust label → egress scrub → egress gate in the spec's order (§6.3, §7.15, §9), failing closed at every stage, and prove the composition (not just each module) with tests.

**Execution:**

- Wrote `prepareTurn(inbound, ctx)` → `PreparedTurn`. Order: `decideAdmission` → `guardContent` → `redactForEgress` → `decideEgress`.
- Fail-closed outcomes: non-owner sender → `accepted:false`, no tools, no memory; lockdown → non-essential egress blocked; a detected hard credential → turn refused, `modelText:""`, never sent to a model.
- The model only ever sees `modelText` (trust-labelled + scrubbed). Reasons never echo raw sender ids or secret values.

**Verification (exact commands + actual results):**

- `pnpm test src/friday/turn.test.ts --maxWorkers=1` → **9 tests passed**.
- `pnpm test src/friday --maxWorkers=1` → **8 files, 48 tests passed** (2.0s) — the whole soul layer, green.
- `pnpm tsgo:core` → **exit 0** (after clearing a stale `.artifacts/dist-artifacts.lock` left by the OOM-killed build). FRIDAY modules typecheck under the engine's strict config.

**Side effects:** Two new files; commits `6c91d742` (turn pipeline), `8b36ecf4` (board). Repository still private.

**Outcome:** Completed — one wiring seam exists and is proven; the engine-wiring step is now a single surgical change.

**Known risks:** Full `pnpm build` still not run this session (host OOMs on the ~7-minute monorepo build). Wiring into the engine's real model-egress path is unstarted and unproven at that entry point. Blocked inputs unchanged.

**Next action:** Wire `prepareTurn` into the engine's inbound model-egress path and prove it at that entry point (the remaining work for WS-F/A-01). Continue unblocked workstreams (WS-B five-layer map, WS-E resume wiring).

---

## 2026-11-13T22:34Z — Build-vs-reuse: OSS adoption decisions + soul-layer proof

**Goal:** Act on the owner's direction — "if something already exists, don't blindly copy it; use it as inspiration and refine" — by recording a build-vs-reuse decision for every named OSS candidate, proving the existing `src/friday/` soul layer works, and keeping every blocked component isolated behind a contract.

**Scope:** `docs/contracts/oss-adoption.md` (new), `OWNER_REQUIREMENTS.md` (new), `TASKBOARD.md`, `src/friday/` (verify only). No engine internals modified beyond the rebrand already logged.

**Plan:**

1. Recon what the engine already provides, so no workstream rebuilds it (spec §11: "verify whether an existing OpenClaw feature already satisfies the requirement").
2. Record a decision per OSS candidate: reuse engine / adopt later / record-only / skip.
3. Re-verify the existing `src/friday/` modules by running their tests.

**Decision — reuse the engine's machinery; keep the soul custom.** The engine already ships memory storage+retrieval+forget+provenance, a secret store, provider plugins with failover+cost, cron/heartbeat, doctor, and skills/MCP. Your OSS list is recorded as the _named candidate_ for the phase where it is needed, not bolted on now (a second memory store/router/scheduler contradicts §6.1). Full table in `docs/contracts/oss-adoption.md`:

- **Mem0 (Apache-2.0)** — its extract→dedupe→ADD/UPDATE/MERGE pipeline is the _inspiration_ for `src/friday/memory/librarian.ts`. We do **not** add Mem0/Qdrant/Postgres/Neo4j; the engine's `extensions/memory-core/` (sqlite-vec) already stores and forgets with provenance. Reuse engine.
- **SOPS + age** — named candidate for the Phase 5 dual-auth vault (needs a threat model first; §7.11, Section 12 #6). Reuse the engine secret store until then.
- **faster-whisper + Kokoro-82M (Piper step-down)** — named candidates for Phase 4 voice. Deferred.
- **Zep open edition** — skip (managed-only). All ToS-evasion / ban-bypass tooling — skip (rejected by §4.3).

**Execution:**

- Confirmed the soul layer already exists from earlier this session: `src/friday/{policy,memory,tasks}` (7 modules, 7 test files), `docs/contracts/friday-core.md`, `TASKBOARD.md`.
- Recreated the pnpm shim (`~/.local/bin/pnpm` → `corepack pnpm`) after a host restart cleared `$HOME`.
- Wrote `docs/contracts/oss-adoption.md` and `OWNER_REQUIREMENTS.md`.

**Verification (exact commands + actual results):**

- `pnpm --version` → `12.11.1`.
- `pnpm test src/friday --maxWorkers=1` → **7 test files passed, 39 tests passed** (2.45s). Proves: owner admission is fail-closed; PII/secret redaction; prompt-injection labelling; lockdown kill switch; Librarian ADD/UPDATE/MERGE/NOOP + refuses to store `uncertain` without confirmation; forget-with-evidence; task ledger demotes done-without-evidence to partial.
- No full `pnpm build` this session (the host OOMs on the ~7-minute monorepo build); module tests are the proof for this entry.

**Side effects:** Added `docs/contracts/oss-adoption.md`, `OWNER_REQUIREMENTS.md`; updated `TASKBOARD.md`/`AGENT_LOG.md`. Nothing committed. Repository still private.

**Outcome:** Completed — reuse decisions recorded, soul layer re-proven.

**Known risks:** Host restarted twice under memory-heavy load (full build, broad subagent scans); mitigated by targeted commands. Phase 0 engine wiring not started. Blocked inputs (Telegram token, keys, budget, vault factors) gate three workstreams.

**Next action:** Wire the soul layer into the engine's real entry points — model egress (F-01/F-02), channel admission (A-01), task lifecycle (E-01/E-04) — one surgical change at a time, each proven at the entry point.

---

## 2026-11-14T11:30Z — Full build proven + user-facing rebrand completed

**Goal:** Clear the one unverified gate from the handoff (a full monorepo build) and finish the user-facing rebrand so no surface still says "OpenClaw".

**Scope:** Repository root; `src/` user-facing CLI strings; build/CI proof. No engine logic changed.

**Plan:**

1. Diagnose why prior sessions kept dying (the build's `write-unified-entry-dts` step).
2. Run the full build in the background with a bounded Node heap and a log I can poll.
3. Sweep remaining user-facing "OpenClaw" literals (`--version`, help, CLI descriptions) and rebrand to FRIDAY; update the coupled tests.
4. Re-typecheck, re-test, commit, log.

**Execution — build diagnosis and result:**

- The host has 15 GiB RAM and **no swap**; `swapon` is not permitted in this container. During the build the `write-unified-entry-dts` step spawns the TypeScript 7 native `tsc --api` binary, which peaked at ~8 GiB RSS — this is what killed prior sessions. `NODE_OPTIONS` cannot cap it because it is a separate native binary, not a Node process.
- Mitigation that worked: run the build in the background writing to `/tmp/friday-build.log`, and poll it. The build **succeeded**: `EXIT=0`, total **5m 36.8s**, slowest phase `write-unified-entry-dts 3m 4.2s`, zero `error TS`/`failed` lines. Artifacts `dist/entry.js` and `dist/index.js` present; `node dist/index.js --version` → `OpenClaw 2026.10.4 (ad06ab0)` (pre-rebrand dist).

**Execution — rebrand completion:**

- `src/entry.version-fast-path.ts` and `src/cli/program/help.ts`: `OpenClaw <v>` → `FRIDAY <v>`.
- `src/cli/program/error-output.ts`: unknown-command and parse-error strings.
- ~21 command `.description()` strings plus their source-of-truth catalogs (`src/cli/program/core-command-descriptors.ts`, `src/cli/program/subcli-descriptors.ts`) — the catalog-drift test (`root-command-descriptions.test.ts`) requires them to match the registered descriptions, so both changed together.
- `src/cli/mcp-cli.ts`: user-visible output ("FRIDAY-managed MCP servers").
- Internal contracts deliberately **unchanged**: the `openclaw` binary/command name, config keys, state paths, and type names (`OpenClawConfig`), per §2.3.

**Verification (exact commands + actual results):**

- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build` → `EXIT=0` (log `/tmp/friday-build2.log` for the post-rebrand rebuild).
- `pnpm tsgo:core` → **exit 0**.
- `pnpm test src/friday --maxWorkers=1` → **17 files, 106 tests passed**.
- `pnpm test src/entry.version-fast-path.test.ts` → 5 passed.
- `pnpm test src/cli/program/error-output.test.ts` + `root-command-descriptions.test.ts` → 24 passed (after syncing the descriptor catalogs).
- `pnpm test src/cli/mcp-cli.test.ts` → 30 passed; `plugins-cli.lazy.test.ts` → passed.

**Side effects:** Commit `35bdaa53` (22 files, rebrand only). `dist/` rebuilt locally. Repository still private. Nothing pushed.

**Outcome:** Completed — the full build gate is now proven green on this host, and the user-facing rebrand is complete.

**Known risks:** The build remains near the host's memory ceiling; it must keep running as a polled background job. No owner credentials yet, so the live Telegram loop and model calls remain BLOCKED-INPUT.

**Next action:** Engine wiring of the proven soul layer, starting with `prepareTurn` at the model-egress seam and `/secret` intake at channel ingress; then the memory Librarian/forget and the task ledger. Keep each wiring surgical and proven at its real entry point.

---

## 2026-11-13T13:40Z — Onboarding: spec comprehension, engine recon, and build plan

**Goal:** Fulfil the OpenHands working contract (§2.3) — read the sources, verify the actual repository state, and post a comprehension summary before any further code changes.

**Scope:** Repository root + read-only recon of `src/`, `extensions/`, `packages/`. No engine internals modified.

**Plan:**

1. Read the three supplied PDFs end to end and `AGENTS.md`, `CONSTITUTION.md`, `PERSONA.md`, `ROADMAP.md`.
2. Verify the real repository state rather than trusting the inherited session summary.
3. Recon which spec requirements the engine already satisfies, so FRIDAY is not built twice.
4. Write this comprehension summary; create `TASKBOARD.md` and `docs/contracts/`.

**Execution — what FRIDAY is, in my own words:**
FRIDAY is Benard's persistent, self-hosted second brain: he sends a mission in ordinary chat (Telegram first), goes to class or sleeps, and returns to a concise, honest debrief — what was done, what was verified, what it cost, what remains, what needs his decision. The interface is the chat he already has, never a new dashboard. The distinguishing feature is ownership: portable memory, an owner-locked Constitution, transparent self-improvement, and a student-budget constraint. The body is the OpenClaw engine; FRIDAY is the soul and the policy layered on it.

**Execution — laws I will not violate:**

- Messaging first (Telegram is the Phase 0 minimum; WhatsApp only via an official path).
- No new interface in Phases 0–6; no mascot, orb, animation, or dashboard.
- Truth before confidence: never claim a task, test, memory, or action succeeded without evidence.
- Owner data stays private; secrets never enter memory, prompts, logs, or Git; PII/secret filtering happens before any third-party model call.
- Illegal activity is a hard block; no ban evasion, fingerprint spoofing, or proxy rotation.
- Ask when uncertain; stop before destructive, paid, public, financial, or credential actions.
- Personality grows, the Constitution does not; FRIDAY can read and cite it, never write it.
- Poverty-proof: affordability is a first-class constraint.

**Execution — Phase 0 gate (§8.1 / §14):** owner sends a Telegram message and gets a useful reply; unknown senders cannot invoke tools or read memory; a simple task can be planned, executed, verified, and reported with evidence; a permitted memory is stored with source/date and retrieved later; "forget" purges and proves it; restart does not lose a recorded task; no custom UI, mascot, or unapproved paid dependency; the build and tests run in CI.

**Execution — Section 12 items I will ask, not decide** (full list in the consolidated owner report): telephone provider/number/cost; answering-on-behalf rules; social automation scope; companion device; **monthly budget ceiling**; vault factors and recovery; DeepMark customer-data boundary; the missing §2.13 dictation rule; presence/sensor permissions; trust-level definitions; the "days since last lie" counter (conflicts with honesty); the missing 102-feature register; Agent-Reach permitted backends; 5 vs 12 concurrent agents; rage-bait/emotion-recognition scope.

**Execution — a critical source conflict I will NOT resolve silently:** the _Core Operational War Manual_ and _Master Specification_ describe features the _Product Specification §4.3_ explicitly REJECTS or DEFERS: browser fingerprint spoofing and human-mouse-path evasion, a privileged Kali/Metasploit offensive container, residential/rotating proxy pools, and a hidden write-only diary used for covert reflection. The Product Specification is the stated baseline and §4.1 laws 5, 6, and 3 override these. I will implement only the Product Specification's approved surface and record this conflict for the owner.

**Execution — engine recon (what already exists, so FRIDAY is not rebuilt):**

- **Channels:** Telegram, WhatsApp, Discord are bundled extensions (`extensions/telegram`, `extensions/whatsapp`, `extensions/discord`; ids in `src/channels/bundled-channel-ids.generated.ts`). Owner auth/allowlist already exists (`src/channels/allow-from.ts`, `allowlist-match.ts`, `direct-dm.ts`).
- **Memory:** a memory subsystem already exists (`src/memory`, `src/memory-host-sdk/` with `event-store.ts`, `query.ts`, `dreaming.ts`, `secret.ts`) plus an `active-memory` extension. Provenance already exists (`src/memory/memory-artifact-provenance.ts`).
- **Secrets:** a secret store + redaction already exists (`src/gateway/server-methods/secrets.ts`, `src/security/secret-mask.ts`, `src/logging/secret-redaction-registry.ts`); config references secrets via `config_set_ref`.
- **Scheduling:** cron + heartbeat already exist (`src/claws/cron.ts`, `src/auto-reply/heartbeat.ts`, `src/commands/backup-schedule.ts`).
- **Health:** `doctor` already exists (`src/commands/doctor-*.ts`).
- **Model providers:** bundled extensions already exist for the spec's entire free-tier chain — `google` (Gemini), `groq`, `mistral`, `cohere`, `cloudflare`, `ollama` — plus a `clawrouter` extension.
- **Implication:** the spec's proposed LiteLLM/Mem0/Qdrant/LangGraph/APScheduler stack is largely already provided natively and more simply. Per §6.1 ("prefer the smallest system… avoid overlapping stores/routers/schedulers") and §11 ("verify whether an existing feature already satisfies the requirement"), FRIDAY will be a thin policy/persona/config layer over these engine features, not a parallel Python stack. Named third-party dependencies (Mem0, LiteLLM) are PROPOSED, not adopted; adopting any requires the §11 validation and owner approval.

**Verification:**

- `git status -sb` → branch `main`, 20 modified files (the completed Track-C rebrand) + untracked governance docs; no unexpected changes.
- `free -h` → 15Gi total; environment restarted twice under heavy load (build/subagent), which I have mitigated by doing recon with targeted `grep`/`find` instead of heavyweight subagents.
- Recon commands above returned the file lists cited.

**Side effects:** This log entry; `TASKBOARD.md` and `docs/contracts/` to follow in this session. Nothing committed yet. Repository still private.

**Outcome:** Completed — comprehension recorded; build plan set; critical spec conflict flagged for the owner.

**Known risks:** The host is memory-constrained (OOM on the full ~7-minute monorepo build and on broad subagent scans). No owner credentials exist yet (Telegram bot token, model keys), so live channel proof is BLOCKED-INPUT; unit-level proof proceeds meanwhile. The spec's missing source sections (1–3, 2.5, 2.13, the 102-feature register) remain unavailable.

**Next action:** Publish `TASKBOARD.md` and `docs/contracts/`, then build the FRIDAY core modules that are genuinely missing and unit-testable without external services (PII/secret filter, prompt-injection scrubber, Librarian classify, forget-with-evidence, task ledger + debrief, owner-auth decision, kill-switch policy).

---

## 2026-11-13 — Phase 0 bootstrap: environment + governance layer

**Goal:** Stand up the FRIDAY fork on a working base and create the spec-mandated source-of-truth documents that were missing.

**Scope:** Repo root. No engine internals modified. No rebrand of code yet.

**Plan:**

1. Install dependencies and prove the fork builds and tests in this environment.
2. Create `CONSTITUTION.md` (owner-locked), `PERSONA.md` (mutable), `ROADMAP.md` (from spec §8), `AGENT_LOG.md`.

**Execution:**

- Read all three supplied PDFs end to end (Product Specification v1.0, Core Operational War Manual, Master Specification).
- Activated pinned pnpm 12.11.1 via corepack; installed with `pnpm install --frozen-lockfile`.
- Created governance documents.

**Verification:**

- `pnpm --version` → `12.11.1`
- `pnpm install --frozen-lockfile` → `Done in 35.8s using pnpm v12.11.1`; lockfile up to date; workspace links present (`node_modules/@openclaw/*`).
- `pnpm build` → **succeeded**. Total 6m 50.1s. `dist/entry.js` and `dist/index.js` produced. Zero errors in the log. Build phase timings recorded by the build itself.
- CLI smoke test: `node dist/index.js --version` → `OpenClaw 2026.10.4 (10cbb85)`; `--help` renders normally.

**Side effects:** Created four root Markdown files. Nothing committed. Repository still private.

**Outcome:** Completed for this session's scope — environment proven, governance layer created.

**Known risks:** The fork was a shallow clone; full history is not present locally. The rebrand and Phase 0 code have not started. `pnpm build` takes ~7 minutes on this host.

**Next action:** FRIDAY user-facing rebrand (spec §11: user-facing surfaces say FRIDAY; exactly one upstream credit line in the README; preserve internal code/imports and protocols), then Phase 0 wiring.
