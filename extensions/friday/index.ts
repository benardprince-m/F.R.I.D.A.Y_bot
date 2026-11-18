// FRIDAY — owner-controlled, messaging-first "second brain" for OpenClaw.
//
// This entry is the thin wiring layer. All policy is pure and lives under `./src`; this file
// only translates engine hook events into policy calls and back. It wires five seams:
//
//   * `before_agent_run`      — the single turn seam (`prepareTurn`, F-07): fail-closed owner
//                               admission, /lockdown, hard-credential block, then the trust
//                               label. Owner-only access to tools and memory (MSG-01, §9).
//   * `before_model_resolve`  — model default + fallback layering (C-02): FRIDAY's primary is
//                               DeepSeek v4.1 Flash with a free-tier fallback chain behind it,
//                               handed to the engine's gateway. Cheap-first local routing (§7.10,
//                               C-01) is a no-op until `localProvider`/`localModel` are set. The
//                               monthly budget ceiling (C-05) is enforced here: a spent budget
//                               refuses paid escalation rather than spending past it.
//   * `model_call_ended`      — per-call outcome feeds the C-03 circuit breaker, keyed by
//                               provider, so a failing provider is skipped until it recovers.
//   * `llm_output`            — each call's reported token usage is recorded against the durable
//                               monthly spend ledger (C-04), so `/spend` and `/doctor` are real.
//   * `before_message_write`  — PII/secret scrub of the owner's inbound text before the model
//                               ever sees it (§7.15, §6.3, F-01).
//   * `before_prompt_build`   — inject the FRIDAY persona + Constitution as cached system
//                               context, deterministically (§6.1), and, for owner turns, a
//                               bounded block of retrieved memory facts (B-04/B-03).
//   * `tool_result_persist`   — fence untrusted tool/web/file results before they enter the
//                               transcript, so injected instructions stay data (§7.15, F-02).
//
// Plus a background heartbeat service (G-01): a beat every minute that runs the F-05 integrity
// check, bound to the Gateway's lifetime so it stops cleanly. Commands: `/doctor` (G-03),
// `/trust-persona` (F-05), `/lockdown` + `/unlock` (F-03), `/remember` + `/memory` + `/forget`
// (B-02/B-04) over FRIDAY's own bounded memory store, and `/spend` (C-04).
// `/secret` and the response cache are not wired yet: they need a secret-store/delete surface
// and careful reply-hook semantics, so wiring them now would be a dishonest stub. See TASKBOARD
// C-06 / G-06.

import path from "node:path";
import {
  buildJsonPluginConfigSchema,
  definePluginEntry,
  type OpenClawConfig,
  type OpenClawPluginApi,
  type PluginCommandContext,
} from "openclaw/plugin-sdk/plugin-entry";
import manifest from "./openclaw.plugin.json" with { type: "json" };
import { readFridayConfig, type FridayConfig } from "./src/config.js";
import { redactUserMessage, fenceToolResultMessage } from "./src/gate.js";
import { renderForgetReport } from "./src/memory/forget.js";
import {
  applyCandidate,
  forgetMemories,
  ownerCandidate,
  renderMemoryContext,
  renderMemoryList,
  renderRememberAck,
  selectForContext,
} from "./src/memory/records.js";
import { deleteMemories, loadMemories, openMemoryStore, saveMemories } from "./src/memory/store.js";
import { newBreaker, recordOutcome, type BreakerState } from "./src/ops/breaker.js";
import { buildDoctorReport } from "./src/ops/doctor.js";
import { HeartbeatService } from "./src/ops/heartbeat-service.js";
import { checkProtectedIntegrity, recordBaseline } from "./src/ops/integrity-baseline.js";
import { loadMonth, openLedgerStore, saveMonth } from "./src/ops/ledger-store.js";
import { decideBudget, recordUsage, spendLine, type BudgetDecision } from "./src/ops/ledger.js";
import { effectiveChain, resolveModelChain, splitModelRef } from "./src/ops/model-chain.js";
import { routeTurn } from "./src/ops/router.js";
import { loadSystemContext, readProtectedFiles } from "./src/persona.js";
import { prepareTurn } from "./src/turn.js";

const HOOK_PRIORITY = 100;

/** The running heartbeat service, held so `stop` can join it. One per plugin registration. */
let heartbeat: HeartbeatService | null = null;

/** Live C-03 breaker state, keyed by provider id. One map per plugin registration. */
let breakers = new Map<string, BreakerState>();

/** Record a model call outcome against its provider's breaker (C-03). */
function trackModelOutcome(provider: string, ok: boolean): void {
  if (!provider) {
    return;
  }
  const current = breakers.get(provider) ?? newBreaker();
  breakers.set(provider, recordOutcome(current, ok, Date.now()));
}

function resolveConfig(api: OpenClawPluginApi): FridayConfig {
  const current = api.runtime?.config?.current;
  return readFridayConfig(
    typeof current === "function" ? () => current() : undefined,
    api.pluginConfig as unknown,
  );
}

/** Owner-controlled directory holding PERSONA.md and CONSTITUTION.md; defaults to cwd. */
function personaDir(api: OpenClawPluginApi): string {
  const dir = resolveConfig(api).personaDir;
  return dir ? path.resolve(dir) : process.cwd();
}

function isOwner(ctx: PluginCommandContext): boolean {
  return ctx.senderIsOwner === true || ctx.isAuthorizedSender;
}

/** Whether a hook turn belongs to the configured owner (scopes memory retrieval, B-04). */
function isOwnerTurn(
  api: OpenClawPluginApi,
  ctx: { senderId?: string; channel?: string } | undefined,
): boolean {
  if (!ctx?.senderId || !ctx.channel) {
    return false;
  }
  return resolveConfig(api).ownerIds.some(
    (o) => o.channel === ctx.channel && o.senderId === ctx.senderId,
  );
}

/** Best-effort check that the durable continuity store can be opened on this host. */
function continuityStoreAvailable(api: OpenClawPluginApi): boolean {
  return (
    typeof (api.runtime as { state?: { openKeyedStore?: unknown } } | undefined)?.state
      ?.openKeyedStore === "function"
  );
}

/** The live budget decision for this instant (C-05). No ceiling configured ⇒ always allowed. */
async function budgetDecision(api: OpenClawPluginApi): Promise<BudgetDecision> {
  const config = resolveConfig(api);
  const store = openLedgerStore(api.runtime);
  if (!store) {
    return decideBudget({ month: "", entries: [] }, config.budgetUsd);
  }
  const at = new Date().toISOString();
  return decideBudget(await loadMonth(store, at), config.budgetUsd);
}

/** Record one model call's reported usage against the durable monthly ledger (C-04). */
async function recordCallUsage(
  api: OpenClawPluginApi,
  usage: { provider: string; model: string; inputTokens?: number; outputTokens?: number },
): Promise<void> {
  const store = openLedgerStore(api.runtime);
  if (!store) {
    return;
  }
  const at = new Date().toISOString();
  const next = recordUsage(await loadMonth(store, at), usage, at);
  await saveMonth(store, next);
}

/** `/spend` — the owner's month-to-date spend and remaining budget, in chat (C-04). */
async function spendText(api: OpenClawPluginApi): Promise<string> {
  const config = resolveConfig(api);
  const store = openLedgerStore(api.runtime);
  if (!store) {
    return "Spend is unavailable: this host has no plugin-state store.";
  }
  const at = new Date().toISOString();
  return spendLine(await loadMonth(store, at), config.budgetUsd);
}

function doctorText(api: OpenClawPluginApi): Promise<string> {
  const config = resolveConfig(api);
  return checkProtectedIntegrity(api.runtime, readProtectedFiles(personaDir(api))).then(
    async (integrity) => {
      const chain = resolveModelChain({ model: config.model, modelChain: config.modelChain });
      const effective = effectiveChain(chain, breakers, Date.now());
      const at = new Date().toISOString();
      const store = openLedgerStore(api.runtime);
      const spend = store ? spendLine(await loadMonth(store, at), config.budgetUsd) : undefined;
      const report = buildDoctorReport({
        ownerConfigured: config.ownerIds.length > 0,
        personaPresent: loadSystemContext(personaDir(api)).length > 0,
        continuityStoreAvailable: continuityStoreAvailable(api),
        lockedDown: config.lockedDown,
        localRoutingConfigured: Boolean(config.localProvider && config.localModel),
        integrity: integrity.status,
        heartbeat: heartbeat !== null,
        model: effective,
        ...(spend ? { spend } : {}),
      });
      return report.lines.join("\n");
    },
  );
}

async function trustPersona(api: OpenClawPluginApi): Promise<string> {
  const files = readProtectedFiles(personaDir(api));
  if (files.length === 0) {
    return "No PERSONA.md or CONSTITUTION.md found to record.";
  }
  const recorded = await recordBaseline(api.runtime, files);
  return recorded
    ? `Baseline recorded for: ${files.map((f) => f.path).join(", ")}. /doctor will now flag unexpected changes.`
    : "Could not record a baseline: this host has no plugin-state store.";
}

const NO_MEMORY_STORE = "Memory is unavailable: this host has no plugin-state store.";

/** `/remember <text>` — fold the owner's fact into memory through the Librarian (B-02). */
async function rememberText(api: OpenClawPluginApi, args: string): Promise<string> {
  const text = args.trim();
  if (!text) {
    return "Usage: /remember <fact>. Nothing stored.";
  }
  const store = openMemoryStore(api.runtime);
  if (!store) {
    return NO_MEMORY_STORE;
  }
  const now = new Date().toISOString();
  const result = applyCandidate(await loadMemories(store), ownerCandidate(text, now), now);
  await saveMemories(store, result.changed);
  return renderRememberAck(result);
}

/** `/memory` — list the owner's stored facts, newest first (B-04). */
async function memoryList(api: OpenClawPluginApi): Promise<string> {
  const store = openMemoryStore(api.runtime);
  if (!store) {
    return NO_MEMORY_STORE;
  }
  return renderMemoryList(await loadMemories(store));
}

/** `/forget <query>` — purge matching memories and report the evidence (B-04). */
async function forgetText(api: OpenClawPluginApi, args: string): Promise<string> {
  const query = args.trim();
  if (!query) {
    return "Usage: /forget <text to forget>. Nothing purged.";
  }
  const store = openMemoryStore(api.runtime);
  if (!store) {
    return NO_MEMORY_STORE;
  }
  const { report } = forgetMemories(await loadMemories(store), query);
  if (report.totalPurged === 0) {
    return renderForgetReport(report);
  }
  await deleteMemories(
    store,
    report.purged.flatMap((p) => p.ids),
  );
  // Re-scan the real post-purge store so `complete` is evidence, not a claim; keep the purge
  // counts from the report that actually drove the deletion.
  const after = forgetMemories(await loadMemories(store), query).report;
  return renderForgetReport({
    ...report,
    remainingMatches: after.remainingMatches,
    complete: after.remainingMatches.length === 0,
  });
}

async function setLockdown(
  api: OpenClawPluginApi,
  ctx: PluginCommandContext,
  lockedDown: boolean,
): Promise<{ text: string }> {
  await api.runtime.config.mutateConfigFile({
    afterWrite: { mode: "auto" },
    writeOptions: { assertCurrent: ctx.assertOwnerCurrent },
    mutate: (draft: OpenClawConfig) => {
      const plugins = (draft.plugins ?? {}) as NonNullable<OpenClawConfig["plugins"]>;
      const entries = { ...plugins.entries };
      const entry = (entries.friday ?? {}) as Record<string, unknown>;
      const config = { ...(entry.config as Record<string, unknown>), lockedDown };
      entries.friday = { ...entry, enabled: true, config };
      draft.plugins = { ...plugins, entries };
    },
  });
  return {
    text: lockedDown
      ? "Lockdown on. I have stopped non-essential outbound calls. Send /unlock to resume."
      : "Lockdown off. Normal operation resumed.",
  };
}

export default definePluginEntry({
  id: "friday",
  name: "FRIDAY",
  description:
    "Owner-controlled, messaging-first second brain: owner gate, PII egress scrub, persona.",
  configSchema: buildJsonPluginConfigSchema(manifest.configSchema),
  register(api: OpenClawPluginApi) {
    // Fresh per registration, so a re-register (or a test) never inherits stale health.
    breakers = new Map();

    api.on(
      "before_agent_run",
      (event) => {
        const decision = prepareTurn(
          {
            prompt: event.prompt,
            channelId: event.channelId,
            senderId: event.senderId,
            senderIsOwner: event.senderIsOwner,
            trust: "owner",
          },
          { config: resolveConfig(api) },
        );
        if (decision.accepted) {
          return { outcome: "pass" as const };
        }
        return {
          outcome: "block" as const,
          reason: decision.reason,
          message: decision.message,
          category: decision.category,
        };
      },
      { priority: HOOK_PRIORITY },
    );

    api.on(
      "before_model_resolve",
      async (event) => {
        const config = resolveConfig(api);
        // C-05: the ceiling is enforced at routing — a spent budget refuses paid escalation and
        // keeps the turn on the free/local tier rather than silently spending past it.
        const budget = await budgetDecision(api);
        // C-01 cheap-first local routing wins when configured: serve the turn on the local
        // provider so the engine's own gateway makes the call (§7.10, §6.1).
        const routing = routeTurn(
          event.prompt,
          {
            localProvider: config.localProvider,
            localModel: config.localModel,
          },
          { lockedDown: config.lockedDown, budgetAllowed: budget.allowed },
        );
        if (routing.tier !== "default" && routing.provider && routing.model) {
          return { providerOverride: routing.provider, modelOverride: routing.model };
        }
        // C-02 otherwise: FRIDAY's primary + fallback chain, minus providers whose breaker is
        // open. The first admitting ref becomes the primary so a down provider is skipped.
        const chain = effectiveChain(
          resolveModelChain({ model: config.model, modelChain: config.modelChain }),
          breakers,
          Date.now(),
        );
        const { provider, model } = splitModelRef(chain.primary);
        return {
          ...(provider ? { providerOverride: provider } : {}),
          modelOverride: model,
          fallbacksOverride: chain.fallbacks,
        };
      },
      { priority: HOOK_PRIORITY },
    );

    api.on(
      "model_call_ended",
      (event) => {
        trackModelOutcome(event.provider, event.outcome === "completed");
      },
      { priority: HOOK_PRIORITY },
    );

    // C-04: record each call's reported token usage against the durable monthly ledger. Only a
    // completed call with reported usage is recorded; a call with no usage records zero rather
    // than a guess. Best-effort — a store hiccup never fails the turn.
    api.on(
      "llm_output",
      async (event) => {
        if (!event.usage) {
          return;
        }
        await recordCallUsage(api, {
          provider: event.provider,
          model: event.model,
          inputTokens: event.usage.input,
          outputTokens: event.usage.output,
        });
      },
      { priority: HOOK_PRIORITY },
    );

    api.on(
      "before_message_write",
      (event) => {
        if ((event.message as { role?: string }).role !== "user") {
          return undefined;
        }
        const next = redactUserMessage(event.message);
        return next === event.message ? undefined : { message: next };
      },
      { priority: HOOK_PRIORITY },
    );

    api.on(
      "before_prompt_build",
      async (event, ctx) => {
        const context = loadSystemContext(path.resolve(personaDir(api)));
        const result: { appendSystemContext?: string; appendContext?: string } = {};
        if (context) {
          result.appendSystemContext = context;
        }
        // B-04/B-03: inject a bounded block of the owner's stored facts, only for the owner's
        // own turns (never a forwarded/untrusted turn), and never let retrieval break the turn.
        if (isOwnerTurn(api, ctx)) {
          const store = openMemoryStore(api.runtime);
          if (store) {
            try {
              const facts = selectForContext(await loadMemories(store), event.prompt);
              const block = renderMemoryContext(facts);
              if (block) {
                result.appendContext = block;
              }
            } catch {
              // Retrieval is best-effort: a store hiccup must not fail the prompt build.
            }
          }
        }
        return result.appendSystemContext || result.appendContext ? result : undefined;
      },
      { priority: HOOK_PRIORITY },
    );

    api.on(
      "tool_result_persist",
      (event) => {
        const next = fenceToolResultMessage(event.message);
        return next === event.message ? undefined : { message: next };
      },
      { priority: HOOK_PRIORITY },
    );

    api.registerCommand({
      name: "doctor",
      description: "FRIDAY health from chat: healthy / degraded / incident, with evidence.",
      acceptsArgs: false,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: async (ctx) =>
        isOwner(ctx) ? { text: await doctorText(api) } : { text: "Owner only." },
    });

    api.registerCommand({
      name: "trust-persona",
      description: "Record the current PERSONA.md/CONSTITUTION.md as the owner-approved baseline.",
      acceptsArgs: false,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: async (ctx) =>
        isOwner(ctx) ? { text: await trustPersona(api) } : { text: "Owner only." },
    });

    api.registerCommand({
      name: "lockdown",
      description: "Stop non-essential outbound traffic; keep owner messaging.",
      acceptsArgs: false,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: (ctx) => (isOwner(ctx) ? setLockdown(api, ctx, true) : { text: "Owner only." }),
    });

    api.registerCommand({
      name: "unlock",
      description: "Resume normal operation after /lockdown.",
      acceptsArgs: false,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: (ctx) => (isOwner(ctx) ? setLockdown(api, ctx, false) : { text: "Owner only." }),
    });

    api.registerCommand({
      name: "remember",
      description: "Store a fact in FRIDAY's memory: /remember <fact>.",
      acceptsArgs: true,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: async (ctx) =>
        isOwner(ctx) ? { text: await rememberText(api, ctx.args ?? "") } : { text: "Owner only." },
    });

    api.registerCommand({
      name: "memory",
      description: "List the facts FRIDAY has stored about you.",
      acceptsArgs: false,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: async (ctx) =>
        isOwner(ctx) ? { text: await memoryList(api) } : { text: "Owner only." },
    });

    api.registerCommand({
      name: "forget",
      description: "Purge matching memories across every layer, with evidence: /forget <text>.",
      acceptsArgs: true,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: async (ctx) =>
        isOwner(ctx) ? { text: await forgetText(api, ctx.args ?? "") } : { text: "Owner only." },
    });

    api.registerCommand({
      name: "spend",
      description: "Show month-to-date model spend and remaining budget (C-04).",
      acceptsArgs: false,
      requireAuth: true,
      exposeSenderIsOwner: true,
      handler: async (ctx) =>
        isOwner(ctx) ? { text: await spendText(api) } : { text: "Owner only." },
    });

    api.registerService({
      id: "friday-heartbeat",
      apiVersion: 2,
      start: (ctx) => {
        const service = new HeartbeatService({
          readConfig: () => resolveConfig(api),
          scheduler: ctx.scheduler,
          logger: ctx.logger,
          runtime: api.runtime,
        });
        service.start();
        heartbeat = service;
      },
      stop: async () => {
        const current = heartbeat;
        heartbeat = null;
        await current?.stop();
      },
    });
  },
});
