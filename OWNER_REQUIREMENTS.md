# FRIDAY — Required from the Owner

**Purpose:** one prioritized list of everything FRIDAY needs from Benard. Items are isolated behind contracts and stubs so the build continues without them; each is marked with what it unblocks.
**Status:** living document. Updated as items are supplied.
**Rule:** FRIDAY does not decide these silently (§12). Consequential choices wait for the owner (CONSTITUTION Article VII).

---

## Priority 1 — unblocks Phase 0 "Alive" (the only active phase)

| #   | Need                            | Why                                   | Unblocks                                       | How to provide                                                                                                    |
| --- | ------------------------------- | ------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | **Telegram bot token**          | FRIDAY's first channel                | A-03 (Telegram round-trip)                     | BotFather token, stored via the engine secret store (`config_set_ref`) — never in Git                             |
| 2   | **Owner Telegram user id**      | owner-only admission (MSG-01)         | A-02 (owner identity wired to the allowlist)   | The numeric id of the account Benard messages from                                                                |
| 3   | **Chosen default model + keys** | reply to a message requires a model   | C-02 (free-tier chain)                         | Keys for the free-tier chain (Gemini→Groq→Mistral→Cohere→Cloudflare) or a local Ollama endpoint; which is default |
| 4   | **Hard monthly budget ceiling** | poverty-proof is a design law (§7.10) | C-05 (budget behavior); the paid-services gate | A number in USD/month, or "0 — free/local only"                                                                   |

## Priority 2 — unblocks Phase 0 security completeness

| #   | Need                                     | Why                                                          | Unblocks                                   | How to provide                                                                                                      |
| --- | ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 5   | **Vault factor design + recovery model** | §7.11 dual-auth; the model cannot hold its own second factor | F-06 (dual-auth vault, $10 unattended cap) | Which owner factor (passphrase / hardware key / phone), what FRIDAY's independent factor is, and how recovery works |
| 6   | **Host for deployment**                  | always-on cloud host; systemd + Docker                       | G-04, G-05                                 | VPS details, or approval to target a specific host                                                                  |

## Priority 3 — decisions that must not be made silently (§12)

| #   | Decision                                                                                       | Notes                                                                           |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 7   | Telephone provider / number / max cost (Twilio, Africa's Talking, Telegram calls)              | Phase 4; §12 #1                                                                 |
| 8   | Answer-on-behalf scope (screen / take messages / converse; forbidden topics)                   | Phase 4; §12 #2                                                                 |
| 9   | Social automation scope (stay draft→approve, or narrow auto later)                             | Phase 3; §12 #3                                                                 |
| 10  | Companion device (Android / PC / both) — and whether Phase 7 survives the no-new-interface law | §12 #4                                                                          |
| 11  | DeepMark customer-data boundary (may FRIDAY ever touch customer data?)                         | Until decided: no customer/personal data in memory, models, or outreach; §12 #7 |
| 12  | The missing §2.13 dictation rule                                                               | Source text absent; needed before behaviour depends on it; §12 #8               |
| 13  | Presence / sensor permissions (camera, mic, screen, tracking) + retention + indicators         | Phase 7; §12 #9                                                                 |
| 14  | Trust levels L0–L5 (what unlocks at each)                                                      | Until defined: supervised defaults for external side effects; §12 #10           |
| 15  | "Days since last lie" ritual                                                                   | An always-infinity counter conflicts with honest incident history; §12 #11      |
| 16  | The 102-feature register (IDs #14, #80, #106, #111, #115, #117, #121, #129–#136)               | Source files absent; do not invent; §12 #12                                     |
| 17  | Agent-Reach permitted sources/backends                                                         | §12 #13; also gates D-03                                                        |
| 18  | Five vs twelve concurrent agents                                                               | Five is the Phase 6 baseline pending confirmation; §12 #14                      |
| 19  | Rage-bait / emotion recognition                                                                | Undefined; out of scope until specified; §12 #15                                |

## Priority 4 — flagged source conflict (owner confirmation requested)

The _Master Specification_ and _Core Operational War Manual_ describe features the _Product Specification §4.3_ explicitly REJECTS: browser fingerprint/canvas/TLS spoofing, a privileged Kali/Metasploit offensive container, residential/rotating proxy pools, an unofficial WhatsApp WebSocket bridge, and a hidden write-only reflection diary. FRIDAY treats the Product Specification as the baseline (§2.2) and has NOT implemented any of them. **Confirm the rejection stands**, or amend the Product Specification.

---

## What FRIDAY is doing while these are outstanding

Per the end-to-end directive: each blocked component is isolated behind a contract and a stub, marked `BLOCKED-INPUT` on `TASKBOARD.md`, and the build continues on everything unblocked — the soul layer (owner auth, PII/secret filter, injection guard, kill switch, Librarian, forget-with-evidence, task ledger, debrief) is unit-complete and tested without any credential.
