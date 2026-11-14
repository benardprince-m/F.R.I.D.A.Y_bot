# FRIDAY — Phone-Only Operations

**Status:** binding constraint. Owner directive 2026-11-13: _"I don't have a laptop or desktop, so we'll have to make it work."_
**Rule:** every build, deploy, and control path must work with **no laptop, no desktop, no local terminal.** If a step needs one, the design is wrong — redesign it.

---

## What this changes

The owner operates entirely from a phone. That reinforces two things the Product Specification already requires, and turns a few "nice to have" items into hard requirements.

**Reinforced (already in the spec — good):**

- **Chat is the only interface** (§4.1 law 2). No dashboard, no console. The phone already has Telegram.
- **Build and tests run in cloud/CI**, so the owner does not need a machine to verify a phase (§14). CI is the proof surface, not the owner's device.

**Promoted to hard requirements:**

- **Deploy and update must be phone-triggerable.** No "SSH in and run `docker compose up`" as the only path. Either a managed host with a phone-friendly web UI, or a one-tap / chat-triggered deploy.
- **Secrets arrive by chat.** The owner pastes a token into Telegram. The path must: accept it, store it in the secret store, and **delete the message** so the token does not linger in chat history.
- **Health, logs, and recovery must be readable from chat.** `doctor` in chat (§7.8) is not a convenience — it is the owner's only window.
- **No "check the file on disk."** Anything the owner needs to inspect must be reachable from chat (export, summary, or an owner command).

## Proposed default (owner confirms at Priority 2)

| Concern       | Proposed default                                                                                                                                 | Why                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Host          | A managed always-on container host with a **phone web UI** (e.g. Fly.io / Railway / Render class), or a VPS reachable by an SSH app on the phone | The owner can deploy and see status without a computer |
| Deploy/update | A **chat command** (`/deploy`, `/update`) that triggers the host's deploy hook, or a one-tap button in the host's web UI                         | Phone-only                                             |
| Secrets       | Pasted in chat → secret store → **message deleted**; never echoed back                                                                           | Phone is the only input channel                        |
| Verify        | CI runs the phase's acceptance tests; `doctor` reports status in chat                                                                            | §14                                                    |
| Recovery      | `!summon` / `!restart` from a trusted device (§7.11 Gatekeeper), plus host-level restart                                                         | No terminal available                                  |

This is a **Section 12-class decision** (hosting + management path). The default is proposed, not assumed; it is recorded in `OWNER_REQUIREMENTS.md` for the owner to confirm or replace.

## Consequences for the taskboard

- **G-04 (Docker compose for the VPS)** and **G-05 (systemd units)** are no longer "write files and hand them over" — they must ship with a **phone-triggerable deploy path** and a **chat-readable status**.
- New task **G-06: phone-only control path** — the chat command that deploys/updates/restarts and the flow that ingests a secret from chat then deletes the message.
- **A-03 (Telegram round-trip)** is now doubly important: it is both the Phase 0 product surface _and_ the owner's only management channel.
- Any future step that assumes a terminal (build scripts, migrations) must have a chat or CI trigger.

## What does NOT change

- No new interface. A "phone app" for FRIDAY would violate §4.1 law 2 — do not build one. The phone's existing chat app is the interface.
- No covert sensors. Phone-only does not authorize camera/mic/screen access (Phase 7, §12 #9).
- The owner still supplies credentials himself; FRIDAY never asks a third party for them.
