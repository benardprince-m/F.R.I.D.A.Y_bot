# FRIDAY Roadmap

**Owner:** Benard Prince
**Source:** FRIDAY Product Specification v1.0 (18 Oct 2026), §8.
**Rule:** Each phase is a separate release gate. A phase is not complete until its acceptance tests pass, evidence is attached to the work record, the owner can use it from the intended channel, and unresolved risks are reported. **Do not silently move later-phase features forward.**

Status legend: `TODO` · `IN PROGRESS` · `BLOCKED` · `DONE`

---

## Phase 0 — Alive (first build) — `IN PROGRESS`

**Goal:** "FRIDAY replies and remembers."

**Scope:** Telegram text loop; basic personality prompt; manual task assignment; memory v0 with provenance; reliable runtime startup and shutdown; authenticated owner access; basic task plan/verify/report loop. WhatsApp remains a first-build channel goal but connects only through an approved official route after cost/security review.

**Acceptance gate:**

- [ ] Owner can send a Telegram message and receive a useful, human-language reply.
- [ ] Unknown senders cannot invoke tools or read private memory.
- [ ] A simple manual task can be planned, executed, verified, and reported with evidence.
- [ ] A permitted memory is stored with source/date and retrieved in a later session; an unknown fact is not invented.
- [ ] "Forget" removes the Phase 0 memory record and confirms what was purged.
- [ ] Service restart does not corrupt or silently lose a recorded task/checkpoint.
- [ ] No custom UI, mascot, orb, animation, or unapproved paid dependency is added.
- [ ] Build and tests run in cloud/CI so the owner does not need a laptop to verify the phase.

---

## Phase 1 — Proactive — `TODO`

**Scope:** Heartbeat, scheduler, morning/evening briefs, reminders, read-only calendar/email, health status, cost tracking, PII filter, lockdown, tested message queue and graceful degradation.

**Acceptance gate:** scheduled jobs are idempotent; quiet modes batch non-urgent items; doctor reports truthful component status; no email/calendar write occurs; monthly kill-switch test proves outbound non-essential traffic stops.

---

## Phase 2 — Engineer — `TODO`

**Scope:** Isolated code sandbox; GitHub access through least-privilege credentials; first subagents; skill/plugin acquisition; coding and web-building capabilities; build/test/verify/report loop.

**Acceptance gate:** code executes only in a sandbox; a test task creates a reviewed branch/patch, runs tests, reports evidence, and makes no unapproved production write; all secrets remain outside Git; new skills pass license/security/sandbox checks.

---

## Phase 3 — Social Operator — `TODO`

**Scope:** Social statistics; templates; draft replies and posts; owner-approval workflow; Stripe watch and Google account read access; later, narrow automation if explicitly authorized.

**Acceptance gate:** draft mode is the default; approval is explicit and bound to account/action/content; retries cannot double-post; platform limits pause automation; no personal/customer data is disclosed to leads.

---

## Phase 4 — Voice — `TODO`

**Scope:** Voice notes become available earlier; Phase 4 adds real outbound calls, urgent call escalation, and a possible answer-on-behalf agent.

**Acceptance gate:** provider, number, disclosure, call scripts, consent, and cost are approved; the agent cannot impersonate Benard or agree to terms; all calls are logged with minimal necessary metadata and retention rules.

---

## Phase 5 — Trust and opportunity — `TODO`

**Scope:** Dual-auth vault; event radar; opportunity and connection radar; controlled outreach; health/goals coaching; phase-appropriate social/web access.

**Acceptance gate:** independent security review of vault and Gatekeeper; $10-equivalent unattended cap proven at the enforcement layer; no secrets in memory/logs; external outreach remains draft/approval-gated unless separately authorized; privacy controls and deletion work.

---

## Phase 6 — Full autonomy — `TODO`

**Scope:** Up to five parallel task slots as the initial product target; subagent fleet; away-mode debriefs; self-improvement loop; diary; offline fallback; sleep mode; daily deep diagnostics and restore drills.

**Acceptance gate:** long jobs persist and resume; each agent is isolated and attributable; budget and tool permissions are enforced; offline mode is honest about degraded capability; self-edits are visible and revertible; backup restore is demonstrated. The 12-agent DeepMark scenario is a separate capacity test requiring owner clarification, not a default production configuration.

---

## Phase 7 — Presence (future) — `DEFERRED`

**Scope:** companion phone/PC client, wake word, direct voice, opt-in camera/mic/screen, Zoom overlay capsule, mobile commands, device tracking.

**Acceptance gate:** owner explicitly approves the device and permissions; sensors are off by default and visibly active; recording is never hidden; OS and meeting-platform rules are honored; captures are local/minimized with owner-controlled retention; no mascot/orb/animation. If a companion app violates the no-new-interface law, do not ship it.

---

## Phase 8 candidate — Trusted agent-to-agent coordination — `DEFERRED`

**Scope:** FRIDAY may negotiate scheduling/coordination with other people's agents, beginning with a trusted-person network drawn only from contacts with explicit consent.

**Gate:** explicit consent on both sides, shared-data minimization, identity verification, revocation, audit trail, and clear rules for commitments. Never expose Benard's memory or secrets to another agent by default.

---

## Open owner decisions (block later phases)

These are explicitly open and must not be decided silently:

1. Telephone calls: provider, number, max monthly cost.
2. Answering on Benard's behalf: screen / take messages / converse; forbidden disclosures and topics; covered number and contacts.
3. Social automation: stay draft→approve, or later enable narrow auto-replies/posts?
4. Companion device: Android phone, PC, or both? Does Phase 7 survive the no-new-interface law?
5. **Monthly budget ceiling** (hard amount for hosting, models, WhatsApp, voice, storage).
6. Vault factors: passphrase, hardware key, phone confirmation, or other? What is FRIDAY's independent second factor? Recovery model?
7. **DeepMark boundary:** may FRIDAY ever access customer data, or only ops/social/code? Until decided: do not touch customer or personal data.
8. Missing dictation rule (spec §2.13) — obtain the exact rule before implementing dependent behavior.
9. Presence/sensors: exact permitted actions, retention, visible indicators.
10. Trust levels L0–L5: concrete actions unlocked and how points are earned/lost.
11. "Days since last lie" ritual — clarify the intended metric; do not ship a false counter.
12. Feature inventory — the complete 102-feature register was not among the supplied files. Do not invent it.
13. Agent-Reach failover: which sources/backends are explicitly permitted?
14. Five vs twelve concurrent agents: confirm whether the 12-agent DeepMark scenario is a test, a target, or an example.
15. Rage-bait / emotion recognition: out of scope until defined.
