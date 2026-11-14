# AGENT_LOG

Append-only record of every implementation session on PROJECT FRIDAY. Never rewrite history to make a session appear successful. Newest entries at the top. All timestamps UTC.

Format per entry: goal · scope · plan · execution · verification (exact commands + actual results) · side effects · outcome · known risks · next action.

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
