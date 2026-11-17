import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import manifest from "./openclaw.plugin.json" with { type: "json" };

type HookHandler = (event: unknown, ctx?: unknown) => unknown;

function captureHooks() {
  const hooks = new Map<string, HookHandler>();
  const on = vi.fn<OpenClawPluginApi["on"]>((name, handler) => {
    hooks.set(name as string, handler as HookHandler);
  });
  return { hooks, on };
}

function captureCommands() {
  const commands = new Map<
    string,
    OpenClawPluginApi["registerCommand"] extends (c: infer C) => void ? C : never
  >();
  const registerCommand = vi.fn((command: { name: string }) => {
    commands.set(command.name, command as never);
  });
  return { commands, registerCommand };
}

describe("friday plugin entry", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "friday-entry-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("declares identity matching its manifest", () => {
    expect(plugin.id).toBe(manifest.id);
    expect(plugin.name).toBe(manifest.name);
  });

  it("registers the gate, scrub, prompt, and command surfaces", () => {
    const { hooks, on } = captureHooks();
    const { commands, registerCommand } = captureCommands();
    plugin.register(createTestPluginApi({ on, registerCommand }));
    expect([...hooks.keys()].toSorted()).toEqual([
      "before_agent_run",
      "before_message_write",
      "before_model_resolve",
      "before_prompt_build",
    ]);
    expect([...commands.keys()].toSorted()).toEqual(["doctor", "lockdown", "unlock"]);
  });

  describe("before_model_resolve routing (C-01)", () => {
    function resolveHandler(pluginConfig: unknown) {
      const { hooks, on } = captureHooks();
      plugin.register(createTestPluginApi({ on, pluginConfig }));
      return hooks.get("before_model_resolve")!;
    }

    it("is a no-op without a configured local provider", () => {
      const handler = resolveHandler({});
      expect(handler({ prompt: "hi" })).toBeUndefined();
    });

    it("overrides provider and model to the local tier when configured", () => {
      const handler = resolveHandler({ localProvider: "ollama", localModel: "llama3.3:8b" });
      expect(handler({ prompt: "hi" })).toEqual({
        providerOverride: "ollama",
        modelOverride: "llama3.3:8b",
      });
    });

    it("keeps a hard turn local rather than escalating (no paid target)", () => {
      const handler = resolveHandler({ localProvider: "ollama", localModel: "llama3.3:8b" });
      expect(handler({ prompt: "please debug this failure" })).toEqual({
        providerOverride: "ollama",
        modelOverride: "llama3.3:8b",
      });
    });

    it("still routes locally under lockdown (owner messaging keeps working)", () => {
      const handler = resolveHandler({
        localProvider: "ollama",
        localModel: "llama3.3:8b",
        lockedDown: true,
      });
      expect(handler({ prompt: "hi" })).toEqual({
        providerOverride: "ollama",
        modelOverride: "llama3.3:8b",
      });
    });
  });

  describe("before_agent_run gate", () => {
    function gateHandler(pluginConfig: unknown) {
      const { hooks, on } = captureHooks();
      plugin.register(createTestPluginApi({ on, pluginConfig }));
      return hooks.get("before_agent_run")!;
    }

    it("passes an owner turn", () => {
      const gate = gateHandler({});
      expect(
        gate({ prompt: "hi", channelId: "telegram", senderId: "1", senderIsOwner: true }),
      ).toEqual({ outcome: "pass" });
    });

    it("blocks a non-owner turn", () => {
      const gate = gateHandler({});
      expect(gate({ prompt: "hi", channelId: "telegram", senderIsOwner: false })).toMatchObject({
        outcome: "block",
        category: "admission",
      });
    });

    it("blocks an owner message carrying a credential", () => {
      const gate = gateHandler({});
      expect(
        gate({ prompt: "sk-abcdefghijklmnop", channelId: "telegram", senderIsOwner: true }),
      ).toMatchObject({ outcome: "block", category: "credential" });
    });

    it("blocks a system turn when locked down", () => {
      const gate = gateHandler({ lockedDown: true });
      expect(gate({ prompt: "heartbeat" })).toMatchObject({
        outcome: "block",
        category: "lockdown",
      });
    });

    it("still passes owner messaging under lockdown (F-03: core messaging stays up)", () => {
      const gate = gateHandler({ lockedDown: true });
      expect(
        gate({ prompt: "hi", channelId: "telegram", senderId: "1", senderIsOwner: true }),
      ).toEqual({ outcome: "pass" });
    });
  });

  it("scrubs PII from an inbound user message", () => {
    const { hooks, on } = captureHooks();
    plugin.register(createTestPluginApi({ on }));
    const handler = hooks.get("before_message_write")!;
    const result = handler({
      message: { role: "user", content: "reach me at bob@example.com", timestamp: 0 },
    }) as { message?: { content: string } };
    expect(result.message?.content).toBe("reach me at [[EMAIL_1]]");
  });

  it("leaves non-user messages untouched", () => {
    const { hooks, on } = captureHooks();
    plugin.register(createTestPluginApi({ on }));
    const handler = hooks.get("before_message_write")!;
    expect(
      handler({ message: { role: "assistant", content: "bob@example.com", timestamp: 0 } }),
    ).toBeUndefined();
  });

  it("injects the persona and constitution as appended system context", () => {
    writeFileSync(path.join(dir, "PERSONA.md"), "persona body");
    writeFileSync(path.join(dir, "CONSTITUTION.md"), "constitution body");
    const { hooks, on } = captureHooks();
    plugin.register(createTestPluginApi({ on, pluginConfig: { personaDir: dir } }));
    const handler = hooks.get("before_prompt_build")!;
    expect(handler({})).toEqual({ appendSystemContext: "persona body\n\nconstitution body" });
  });

  describe("/lockdown and /unlock", () => {
    function commandHandlers(pluginConfig: unknown = {}) {
      const { on } = captureHooks();
      const { commands, registerCommand } = captureCommands();
      const mutateConfigFile = vi.fn(async () => ({}));
      plugin.register(
        createTestPluginApi({
          on,
          registerCommand,
          pluginConfig,
          runtime: { config: { mutateConfigFile } } as never,
        }),
      );
      return { commands, mutateConfigFile };
    }

    it("writes lockedDown=true to the plugin config for the owner", async () => {
      const { commands, mutateConfigFile } = commandHandlers();
      const result = await commands.get("lockdown")!.handler({ senderIsOwner: true } as never);
      expect(result).toMatchObject({ text: expect.stringContaining("Lockdown on") });
      const draft = { plugins: { entries: {} } };
      mutateConfigFile.mock.calls[0]![0].mutate(draft);
      expect(draft.plugins.entries.friday.config.lockedDown).toBe(true);
    });

    it("refuses a non-owner", async () => {
      const { commands, mutateConfigFile } = commandHandlers();
      const result = await commands.get("unlock")!.handler({ senderIsOwner: false } as never);
      expect(result).toEqual({ text: "Owner only." });
      expect(mutateConfigFile).not.toHaveBeenCalled();
    });
  });

  describe("/doctor", () => {
    function doctorHandler(pluginConfig: unknown = {}, runtime?: unknown) {
      const { on } = captureHooks();
      const { commands, registerCommand } = captureCommands();
      plugin.register(
        createTestPluginApi({ on, registerCommand, pluginConfig, runtime: runtime as never }),
      );
      return commands.get("doctor")!.handler;
    }

    it("reports honestly, refusing to claim healthy while core surfaces are unverified", () => {
      writeFileSync(path.join(dir, "PERSONA.md"), "persona body");
      const handler = doctorHandler({ ownerIds: ["telegram:1"], personaDir: dir });
      const result = handler({ senderIsOwner: true } as never) as { text: string };
      expect(result.text).toContain("FRIDAY doctor");
      expect(result.text).toContain("not verified from chat");
      expect(result.text).toContain("openclaw doctor");
    });

    it("flags a missing owner identity as down", () => {
      const handler = doctorHandler({});
      const result = handler({ senderIsOwner: true } as never) as { text: string };
      expect(result.text).toContain("owner: down");
    });

    it("refuses a non-owner", () => {
      const handler = doctorHandler({ ownerIds: ["telegram:1"] });
      expect(handler({ senderIsOwner: false } as never)).toEqual({ text: "Owner only." });
    });
  });
});
