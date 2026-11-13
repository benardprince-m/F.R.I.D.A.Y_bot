# FRIDAY — Build-vs-Reuse: OSS Adoption Decisions

**Status:** decision record. Reviewed before adopting any dependency (§11).
**Rule:** if the engine already provides it, reuse it (§6.1 "prefer the smallest system… avoid overlapping stores/routers/schedulers"). If a proven OSS tool is the right answer for a later phase, record it here as the named candidate; adopt it only after the §11 validation (license, activity, security, cost, fit) and owner approval.

Owner direction (2026-11-13): _"If something already exists, don't blindly copy it — use it as inspiration and refine. That's how we won't waste time."_

---

## Decisions

| Need                                        | Engine already provides                                                                                                                                                                    | Named OSS candidate                                                     | Decision                                                                                                                                                                              | Spec        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Memory store, retrieval, forget, provenance | `extensions/memory-core/` (sqlite-vec vector index; short-term/long-term tiers; `dreaming-consolidation.ts`; `memory-forget.ts`); provenance in `src/memory/memory-artifact-provenance.ts` | **Mem0 (Apache-2.0)** — extract→dedupe→ADD/UPDATE/MERGE                 | **Reuse engine.** `src/friday/memory/librarian.ts` implements the classify policy (Mem0 is the inspiration). Do NOT add Mem0/Qdrant/Postgres/Neo4j — a second store contradicts §6.1. | §7.4, §6.1  |
| Secret store                                | `src/secrets/store/` + `extensions/vault/` + `src/storage/encryption.ts` (AES-GCM, `OCSTOR1`)                                                                                              | **SOPS + age**                                                          | **Reuse engine now.** SOPS+age is the named candidate for the Phase 5 dual-auth vault, gated on a threat model (§7.11, Section 12 #6).                                                | §7.11, §6.3 |
| Voice STT / TTS                             | `src/gateway/talk/`                                                                                                                                                                        | **faster-whisper** (STT) + **Kokoro-82M** (TTS), **Piper** as step-down | **Deferred to Phase 4.** Recorded as the chosen candidates.                                                                                                                           | §7.13       |
| Model providers, failover, cost             | provider plugin extensions (google, groq, mistral, cohere, cloudflare, ollama, litellm, …); `src/agents/model-fallback-*`; `src/agents/usage.ts`; `src/infra/session-cost-usage.types.ts`  | LiteLLM                                                                 | **Reuse engine.** LiteLLM already exists as a provider plugin; no second router (§6.1).                                                                                               | §7.10, §6.3 |
| Scheduling, heartbeat                       | `src/cron/` (`heartbeat-monitor.ts`, `heartbeat-task.ts`, persisted job shapes)                                                                                                            | APScheduler                                                             | **Reuse engine.** No second scheduler.                                                                                                                                                | §7.8        |
| Health / doctor                             | `src/commands/doctor*.ts`; `registerHealthCheck` via `src/plugin-sdk/health.ts`                                                                                                            | —                                                                       | **Reuse engine.** Add FRIDAY checks via the registry (ids not prefixed `core/doctor/`).                                                                                               | §7.9        |
| Skills, MCP                                 | `src/skills/`, `skills/` catalog, `src/mcp/`, `mcp:` config                                                                                                                                | Agent-Reach                                                             | **Reuse engine.** Agent-Reach is the first _acquisition_ candidate (D-03), gated on the owner naming permitted backends.                                                              | §7.6        |
| Orchestrator                                | engine agent runtime (`src/agents/`, embedded-agent-runner)                                                                                                                                | LangGraph                                                               | **Reuse engine** unless a benchmark shows a measured gap (§6.1, §11).                                                                                                                 | §6.1        |

## Skip-list (do not adopt)

| Tool / technique                                              | Why skipped                                           |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Zep open edition                                              | Managed-only; no viable self-hosted edition.          |
| Residential / rotating proxy pools                            | Rejected by §4.3 (ban-evasion).                       |
| Fingerprint / canvas / TLS spoofing, human-mouse-path tooling | Rejected by §4.3 (anti-detection).                    |
| Privileged Kali/Metasploit/Nmap offensive container           | Rejected by §4.3 (offensive intrusion).               |
| Unofficial WhatsApp WebSocket bridge                          | Rejected by §4.3 and §4.1 law 1.                      |
| Hidden write-only reflection diary (covert)                   | Rejected by §4.1 law 3 and §7.5 (owner-visible only). |

## Adoption checklist (any new dependency, §11)

Before adopting anything from this table: verify current project activity, license, security advisories, API terms, resource use, and whether an engine feature already satisfies the need. Record the decision and a fallback. Paid services and new recurring costs require explicit owner approval (CONSTITUTION Article VII).
