# FRIDAY — Build Handoff to Mistral

**From:** OpenHands (lead builder)
**To:** Mistral (independent reviewer — gives the way forward)
**Owner:** Benard Prince (decisions only)
**Date:** 2026-11-14
**Repo:** `F.R.I.D.A.Y_bot` (private fork of OpenClaw), branch `main`, 10 commits ahead of `origin/main`, nothing pushed.

---

## 1. What FRIDAY is (one paragraph)

FRIDAY is Benard's persistent, self-hosted second brain: he sends a mission in ordinary chat (Telegram first), goes to class or sleeps, and returns to a concise, honest debrief — what was done, what was verified, what it cost, what remains, what needs his decision. The interface is the chat he already has, never a new dashboard. The body is the OpenClaw engine; FRIDAY is the **soul** layered on top: an owner-locked Constitution, a growing persona, a memory Librarian, a durable task ledger, approval gates, and radical honesty. Binding new constraint: **the owner is phone-only** — no laptop, no desktop.

---

## 2. Starting state (what I inherited)

- A shallow clone of OpenClaw `2026.10.4` at commit `10cbb85f`.
- Three source PDFs: Product Specification v1.0 (the baseline), Master Specification, and the Core Operational War Manual.
- No FRIDAY code, no governance docs.

---

## 3. What I've done (10 commits, all unit-tested)

| #   | Commit     | What                                                                                                                                                                                                                      |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `bcb001d1` | **Rebrand** — user-facing surfaces say FRIDAY; mascot/lobster/animation removed; README has exactly one upstream credit line                                                                                              |
| 2   | `b7ae3617` | **Governance + soul layer** — CONSTITUTION.md (owner-locked), PERSONA.md, ROADMAP.md, AGENT_LOG.md (append-only, UTC), TASKBOARD.md, OWNER_REQUIREMENTS.md, `docs/contracts/`, and the first `src/friday/` policy modules |
| 3   | `6c91d742` | **Turn pipeline** — admission → trust label → egress scrub → egress gate composed into one function                                                                                                                       |
| 4   | `8b36ecf4` | Taskboard statuses with commit evidence                                                                                                                                                                                   |
| 5   | `a6a00860` | Log entry for the turn-pipeline session                                                                                                                                                                                   |
| 6   | `72175de7` | **Phone-only constraint** (`docs/contracts/phone-only.md`) + `/secret` chat intake                                                                                                                                        |
| 7   | `7ffd9b31` | **Correction path** (§7.4) + **protected-file integrity check** (§7.5)                                                                                                                                                    |
| 8   | `391fe01e` | **Quiet modes / escalation ceiling** (MSG-06) + **idempotency keys** (AUT-06)                                                                                                                                             |
| 9   | `735870f8` | **Five-layer memory map** (B-01) + **degradation ladder** (G-02)                                                                                                                                                          |
| 10  | `7d48aee0` | **Skill acquisition protocol** (§7.6) + **skill manifest validation** (§6.3)                                                                                                                                              |

### The soul layer, by module (`src/friday/`, 34 files)

- **policy/** — owner admission (fail-closed), PII/secret redaction, prompt-injection labelling, lockdown kill switch, quiet-modes ceiling, degradation ladder, protected-file integrity, chat secret intake.
- **memory/** — Librarian (ADD/UPDATE/MERGE/NOOP), forget-with-evidence, five-layer map, correction path with audit trail.
- **tasks/** — durable task ledger + honest debrief, idempotency keys.
- **skills/** — acquisition protocol (gated state machine), manifest validation.
- **turn.ts** — the single composition seam.

---

## 4. Proof (exact, reproducible)

- `pnpm test src/friday --maxWorkers=1` → **17 test files, 106 tests, all passing**.
- `pnpm tsgo:core` → **exit 0** (strict typecheck).
- Board status: **20 tasks DONE-PROOF**, 9 BLOCKED-INPUT, 9 TODO (mostly engine wiring).

**NOT verified:** a full `pnpm build`. The host OOM-crashes on the ~7-minute monorepo build (it has restarted three times). This is an environment limit, not a code failure.

---

## 5. Key decisions (for Mistral to confirm or override)

1. **Reuse the engine, don't rebuild it** (§6.1, §11). The engine already provides channels, memory storage, secrets, providers with failover+cost, cron/heartbeat, doctor, and skills/MCP. FRIDAY is a thin policy layer, not a parallel Python stack.
2. **OSS candidates recorded, not bolted on** (`docs/contracts/oss-adoption.md`): Mem0 is the _inspiration_ for our Librarian (not a dependency — a second memory store would violate §6.1); SOPS+age is the named Phase-5 vault candidate; faster-whisper + Kokoro-82M (Piper step-down) are the Phase-4 voice candidates; Zep and all ToS-evasion tooling are skipped.
3. **Source conflict flagged, not silently resolved.** The Master Spec and War Manual describe features the Product Spec §4.3 explicitly REJECTS (fingerprint spoofing, privileged Kali/Metasploit container, residential proxy pools, unofficial WhatsApp bridge, hidden write-only diary). I implemented **none** of them and treat the Product Spec as the baseline.
4. **Phone-only is architectural**, not cosmetic (`docs/contracts/phone-only.md`).

---

## 6. Blocked on the owner (credentials coming later — build continues)

Benard will supply these; until then the affected tasks are isolated behind contracts and marked BLOCKED-INPUT:

- **BLK-1** Telegram bot token + owner user id
- **BLK-2** Model provider keys + chosen default
- **BLK-3** Hard monthly budget ceiling
- **BLK-4** Vault factor design + recovery model
- **BLK-5** Host (phone-manageable)
- **BLK-6** Agent-Reach permitted backends

All are logged in `OWNER_REQUIREMENTS.md` and `TASKBOARD.md`.

---

## 7. What's next

**Critical path: engine wiring.** The soul layer is proven _as modules_; it is not yet hooked into the running engine. Wiring tasks, each proven at its real entry point:

1. `prepareTurn` → the engine's inbound model-egress path (WS-F / A-01).
2. `parseSecretIntake` → channel ingress (store via the engine secret store, then delete the message).
3. `checkIntegrity` → a nightly cron check.
4. `correct` / `forget` / Librarian → the memory write + forget commands.
5. Task ledger → task start/completion + chat reply.
6. `healthReport` → `doctor` in chat.

This phase needs a full build to verify — the environment constraint above is the gating risk.

---

## 8. "Are we at the fun part yet?" — an honest answer

**Almost. We've built the skeleton and the conscience; the muscles aren't connected yet.**

What's _built_ (the parts that make FRIDAY trustworthy, not just clever):

- The laws it cannot break (Constitution, owner-locked).
- The honesty rules (no claim without evidence; done-without-proof renders as partial).
- The memory brain's _judgement_ (Librarian: what to remember, merge, or forget — with provenance).
- The safety reflexes (owner-only access, PII/secret filtering, injection fencing, lockdown, quiet-mode anti-spam).
- The permission gates (acquisition protocol, idempotency for money/posts).

What's _not alive yet_ — the genuinely fun part, which wiring unlocks:

- **The Librarian actually remembering you across sessions** — memory that persists and cites its source.
- **Skill birth** — FRIDAY detecting a gap, researching, sandboxing, and acquiring a new capability (Agent-Reach is first).
- **Personality growth** — PERSONA.md evolving visibly and reversibly as it learns your preferences (§7.5).
- **Proactive life** — heartbeat, morning/evening briefs, reminders (Phase 1).
- **The wow moment** — you send a mission from your phone, sleep, and wake to a verified debrief with proof and cost.

**So: we're standing at the doorway.** The wiring phase is what turns the skeleton into something that acts, learns, and remembers. That's the fun part — and it's next.

---

## 9. Questions for Mistral (the way forward)

1. **Wiring order** — do you agree the turn pipeline + secret intake go first (they unlock a live Telegram loop), or would you sequence memory wiring first?
2. **Build strategy** — given the host OOMs on the full build, is CI the right proof surface (§14 already requires it), and should wiring land behind CI gates rather than local builds?
3. **Parallel lanes** — should Manus's review run against the `src/friday/` contracts now, before wiring, or after the first live loop?
4. **Budget/model default** — any guidance on the free-tier chain order (Gemini→Groq→Mistral→Cohere→Cloudflare→local) before Benard sets the ceiling?
5. **Phase 0 completeness** — is the unit-tested soul layer the right bar for "Phase 0 code complete," with wiring + credentials as the remaining gate?
