// FRIDAY — owner-controlled, messaging-first "second brain" for OpenClaw.
//
// This entry is the thin wiring layer. All policy is pure and lives under `./src`; this file
// only translates engine hook events into policy calls and back. It wires four seams:
//
//   * `before_agent_run`      — fail-closed gate: owner admission, /lockdown, hard-credential
//                               block. Owner-only access to tools and memory (MSG-01, §9).
//   * `before_model_resolve`  — cheap-first routing: serve the turn on a configured local
//                               provider, so the engine's own gateway does the call (§7.10,
//                               §6.1, C-01). A no-op until `localProvider`/`localModel` are set.
//   * `before_message_write`  — PII/secret scrub of the owner's inbound text before the model
//                               ever sees it (§7.15, §6.3, F-01).
//   * `before_prompt_build`   — inject the FRIDAY persona + Constitution as cached system
//                               context, deterministically (§6.1).
//
// Plus the `/lockdown` + `/unlock` commands (F-03). `/forget`, `/secret`, the spend ledger, and
// the response cache are not wired yet: the first two have no plugin-facing memory-purge or
// secret-store/delete surface, and the ledger/cache need a bounded store plus a phone-readable
// read surface, so wiring them now would be a dishonest stub. See TASKBOARD C-04 / C-05 /
// F-04 / B-04 / G-06.

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
import { evaluateGate, redactUserMessage } from "./src/gate.js";
import { routeTurn } from "./src/ops/router.js";
import { loadSystemContext } from "./src/persona.js";

const HOOK_PRIORITY = 100;

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
    api.on(
      "before_agent_run",
      (event) => {
        const decision = evaluateGate(
          {
            prompt: event.prompt,
            channelId: event.channelId,
            senderId: event.senderId,
            senderIsOwner: event.senderIsOwner,
          },
          resolveConfig(api),
        );
        if (decision.outcome === "pass") {
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
      (event) => {
        const config = resolveConfig(api);
        // Budget enforcement (C-05) is not wired yet, so no ceiling is applied; escalation is
        // not offered either (no paid target is configured), keeping every turn cheap-first.
        const decision = routeTurn(
          event.prompt,
          {
            localProvider: config.localProvider,
            localModel: config.localModel,
          },
          { lockedDown: config.lockedDown, budgetAllowed: true },
        );
        if (decision.tier === "default" || !decision.provider || !decision.model) {
          return undefined;
        }
        return { providerOverride: decision.provider, modelOverride: decision.model };
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
      () => {
        const context = loadSystemContext(path.resolve(personaDir(api)));
        return context ? { appendSystemContext: context } : undefined;
      },
      { priority: HOOK_PRIORITY },
    );

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
  },
});
