# TASKBOARD

Shared coordination board for the FRIDAY build. One row per task. **Claim before you build**; a CLAIMED task is never touched by another agent. Status is a state machine, not a claim.

Statuses: `TODO` · `CLAIMED` · `IN-PROGRESS` · `BLOCKED-INPUT` (needs the owner) · `DONE-PROOF` · `DEFERRED` (later phase — do not pull forward).

`DONE-PROOF` requires all six: code committed ✓ · tests run and passing (output shown) ✓ · spec requirement ID satisfied ✓ · `AGENT_LOG.md` entry with UTC timestamp ✓ · this board updated ✓ · no secrets in diff ✓.

`(unit)` = the pure module is implemented, committed, and tested. `(engine wiring)` = hooking it into the running engine, proven at that entry point — still TODO.

**Binding constraint (owner, 2026-11-13): the owner is phone-only — no laptop, no desktop.** Every build, deploy, and control path must work without a local terminal. See `docs/contracts/phone-only.md`. Consequences: chat is the only interface _and_ the only management channel; deploys must be phone-triggerable; secrets are pasted in chat then deleted; `doctor` in chat is the owner's only health window.

Owner-agent convention: `OpenHands` builds; `Manus` reviews (does not build).

---

## Phase 0 — Alive (the only active phase)

**Build gate:** full `pnpm build` proven green on this host (`EXIT=0`, 5m25s, zero errors) — 2026-11-14. It must run as a polled background job: the `write-unified-entry-dts` step spawns the TS7 native `tsc` (~8 GiB RSS) and the host has no swap.

### WS-A · Gateway & Messaging — owner auth, unknown-sender denial, queue

| ID   | Task                                                                                              | Spec           | Owner     | Status                            | Proof                                                            |
| ---- | ------------------------------------------------------------------------------------------------- | -------------- | --------- | --------------------------------- | ---------------------------------------------------------------- |
| A-01 | Owner-auth decision policy: authenticated owner only; unknown senders denied tool + memory access | MSG-01, §9     | OpenHands | DONE-PROOF (unit)                 | `src/friday/policy/owner-auth.ts` · commit 6c91d742 · tests pass |
| A-02 | Wire owner identity to the engine allowlist/owner concept (contract, not a new allowlist)         | MSG-01         | OpenHands | BLOCKED-INPUT (owner Telegram id) | —                                                                |
| A-03 | Telegram text round-trip: message → reply, live                                                   | MSG-01, MSG-04 | OpenHands | BLOCKED-INPUT (bot token)         | —                                                                |
| A-04 | Conversation continuity via checkpoint, not transcript dump                                       | MSG-02         | OpenHands | TODO                              | —                                                                |
| A-05 | Quiet-mode batching + one-follow-up ceiling policy                                                | MSG-06, §5.3   | OpenHands | DONE-PROOF (unit)                 | `src/friday/policy/quiet-modes.ts` · tests pass                  |

### WS-B · Memory — five-layer model, Librarian, forget-with-evidence

| ID   | Task                                                                          | Spec      | Owner     | Status                       | Proof                                                             |
| ---- | ----------------------------------------------------------------------------- | --------- | --------- | ---------------------------- | ----------------------------------------------------------------- |
| B-01 | Map FRIDAY's five memory layers onto the engine's memory subsystem (contract) | §7.4      | OpenHands | DONE-PROOF (unit)            | `src/friday/memory/layers.ts` · tests pass                        |
| B-02 | Librarian classify: ADD / UPDATE / MERGE / NOOP with importance×recency×use   | §7.4      | OpenHands | DONE-PROOF (unit)            | `src/friday/memory/librarian.ts` · commit b7ae3617 · tests pass   |
| B-03 | Provenance on every memory (source + date); confidence labels                 | §7.4      | OpenHands | DONE-PROOF (unit)            | `Provenance`/`Confidence` types · `docs/contracts/friday-core.md` |
| B-04 | "Forget X" purge across all layers + verifiable evidence report               | §7.4, §14 | OpenHands | DONE-PROOF (unit)            | `src/friday/memory/forget.ts` · commit b7ae3617 · tests pass      |
| B-05 | Correction path: update fact, keep audit trail, no revival                    | §7.4      | OpenHands | DONE-PROOF (unit)            | `src/friday/memory/correction.ts` · tests pass                    |
| B-06 | Nightly consolidation: merge/compress/decay, idempotent                       | §7.4      | OpenHands | DEFERRED (Phase 1 heartbeat) | —                                                                 |

### WS-C · Model Router — free-tier chain, failover, cost tracking

| ID   | Task                                                                         | Spec        | Owner     | Status                                         | Proof |
| ---- | ---------------------------------------------------------------------------- | ----------- | --------- | ---------------------------------------------- | ----- |
| C-01 | Route via the engine's model gateway; no second router (§6.1)                | §7.10, §6.3 | OpenHands | TODO                                           | —     |
| C-02 | Free-tier provider chain config: Gemini→Groq→Mistral→Cohere→Cloudflare→local | §7.10       | OpenHands | BLOCKED-INPUT (API keys)                       | —     |
| C-03 | Failover + circuit breaker (closed→open→half-open)                           | §7.9        | OpenHands | TODO (engine has failover; add breaker policy) | —     |
| C-04 | Per-task/day/week cost tracking; morning-brief spend line                    | §7.10       | OpenHands | TODO                                           | —     |
| C-05 | Budget ceiling behavior: shift to cache/local, batch, notify                 | §7.10       | OpenHands | BLOCKED-INPUT (budget amount)                  | —     |

### WS-D · Skill Factory & Library — registry, acquisition protocol

| ID   | Task                                                                         | Spec | Owner     | Status                          | Proof                                           |
| ---- | ---------------------------------------------------------------------------- | ---- | --------- | ------------------------------- | ----------------------------------------------- |
| D-01 | Acquisition protocol contract: detect→research→assess→sandbox→registry→log   | §7.6 | OpenHands | DONE-PROOF (unit)               | `src/friday/skills/acquisition.ts` · tests pass |
| D-02 | Skill manifest: permissions, data classes, egress, cost, failure behavior    | §6.3 | OpenHands | DONE-PROOF (unit)               | `src/friday/skills/manifest.ts` · tests pass    |
| D-03 | Agent-Reach as first acquisition: read docs, sandbox, per-channel diagnostic | §7.6 | OpenHands | BLOCKED-INPUT (source/backends) | —                                               |

### WS-E · Task Ledger & Debriefs — durable records, checkpoints, resume

| ID   | Task                                                                                            | Spec         | Owner     | Status               | Proof                                                       |
| ---- | ----------------------------------------------------------------------------------------------- | ------------ | --------- | -------------------- | ----------------------------------------------------------- |
| E-01 | Durable task record: owner, goal, status, start, checkpoint, tools, budget, next-wake, evidence | §6.2, AUT-01 | OpenHands | DONE-PROOF (unit)    | `src/friday/tasks/ledger.ts` · commit b7ae3617 · tests pass |
| E-02 | Restart-resume from a verified checkpoint; no silent loss                                       | §6.2, AUT-02 | OpenHands | TODO (engine wiring) | `resume()` unit-tested                                      |
| E-03 | Idempotency keys for money/public writes; no duplicate side effect                              | AUT-06       | OpenHands | DONE-PROOF (unit)    | `src/friday/tasks/idempotency.ts` · tests pass              |
| E-04 | Debrief generator: outcome / proof / cost / failures / next action                              | §5.1, AUT-04 | OpenHands | DONE-PROOF (unit)    | `renderDebrief()` · commit b7ae3617 · tests pass            |

### WS-F · Security & Vault — PII filter, injection scrub, kill-switch

| ID   | Task                                                                                    | Spec        | Owner     | Status                        | Proof                                                                 |
| ---- | --------------------------------------------------------------------------------------- | ----------- | --------- | ----------------------------- | --------------------------------------------------------------------- |
| F-01 | PII + secret filter before any third-party model call                                   | §7.15, §9   | OpenHands | DONE-PROOF (unit)             | `src/friday/policy/redaction.ts` · commit b7ae3617 · tests pass       |
| F-02 | Prompt-injection scrubber + label untrusted content                                     | §7.15       | OpenHands | DONE-PROOF (unit)             | `src/friday/policy/injection-guard.ts` · commit b7ae3617 · tests pass |
| F-03 | `/lockdown` kill switch: stop non-essential egress, keep owner messaging                | §7.15       | OpenHands | DONE-PROOF (unit)             | `src/friday/policy/kill-switch.ts` · commit b7ae3617 · tests pass     |
| F-04 | Secret store: just-in-time fetch, never in memory/logs/prompts/Git                      | §7.11, §6.3 | OpenHands | TODO (engine provides store)  | —                                                                     |
| F-05 | Constitution/persona integrity check vs owner-approved baseline                         | §7.5        | OpenHands | DONE-PROOF (unit)             | `src/friday/policy/integrity.ts` · tests pass                         |
| F-06 | Vault dual-auth + $10 unattended cap at the enforcement layer                           | §7.11       | OpenHands | BLOCKED-INPUT (vault factors) | —                                                                     |
| F-07 | Turn pipeline: compose admission → trust label → egress scrub → egress gate at one seam | §6.3, §7.15 | OpenHands | DONE-PROOF (unit)             | `src/friday/turn.ts` · commit 6c91d742 · 9 tests pass                 |

### WS-G · Heartbeat & Ops — watchdog, health, doctor, docker

| ID   | Task                                                                                                               | Spec            | Owner     | Status               | Proof                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------ | --------------- | --------- | -------------------- | ----------------------------------------------- |
| G-01 | Heartbeat loop (≈1 min) over the engine's cron/heartbeat                                                           | §7.8            | OpenHands | TODO                 | —                                               |
| G-02 | Component checks + degradation ladder + honest status                                                              | §7.9            | OpenHands | DONE-PROOF (unit)    | `src/friday/policy/degradation.ts` · tests pass |
| G-03 | `doctor` in chat: healthy / degraded / incident with evidence                                                      | §7.8, §9        | OpenHands | TODO                 | —                                               |
| G-04 | Docker compose for the VPS host (must ship with a phone-triggerable deploy path)                                   | §6.1, §11       | OpenHands | BLOCKED-INPUT (host) | —                                               |
| G-05 | systemd watchdog units (or the managed-host equivalent)                                                            | §7.9            | OpenHands | BLOCKED-INPUT (host) | —                                               |
| G-06 | Phone-only control path: chat command to deploy/update/restart + ingest a secret from chat then delete the message | §4.1 law 2, §14 | OpenHands | TODO                 | —                                               |

---

## Phase 1+ — DEFERRED (do not pull forward without owner authorization)

Proactive briefs & scheduler (Phase 1) · code sandbox & GitHub least-privilege (Phase 2) · social drafts (Phase 3) · voice notes & calls (Phase 4) · dual-auth vault, radars, outreach (Phase 5) · five-slot fleet, diary, offline (Phase 6) · companion presence (Phase 7) · agent-to-agent (Phase 8 candidate).

Named OSS candidates for deferred phases (see `docs/contracts/oss-adoption.md`): Mem0 (memory inspiration), SOPS+age (Phase 5 vault), faster-whisper + Kokoro-82M / Piper (Phase 4 voice).

---

## Deferred / rejected source material (Product Spec §4.3 — do not implement)

Fingerprint spoofing / human-mouse-path evasion · privileged Kali/Metasploit offensive container · residential/rotating proxy pools · unofficial WhatsApp WebSocket bridge · hidden write-only diary used for covert reflection · browser/TLS/canvas randomization.

---

## Blocked-input register (feeds the consolidated owner report)

| Ref   | Need                                                   | Unblocks         |
| ----- | ------------------------------------------------------ | ---------------- |
| BLK-1 | Telegram bot token + owner Telegram user id            | A-02, A-03       |
| BLK-2 | Model provider keys (free-tier chain) + chosen default | C-02             |
| BLK-3 | Hard monthly budget ceiling                            | C-05, §7.10 gate |
| BLK-4 | Vault factor design + recovery model                   | F-06             |
| BLK-5 | Host for systemd + Docker deployment                   | G-04, G-05       |
| BLK-6 | Agent-Reach source + permitted backends                | D-03             |

Full detail: `OWNER_REQUIREMENTS.md`.
