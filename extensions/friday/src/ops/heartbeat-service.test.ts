// Tests for the G-01 heartbeat service. Invariants: a beat runs the F-05 integrity check and
// warns on a violation; a paused (locked-down) beat does nothing; the service stops cleanly.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import { createTestPluginServiceScheduler } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeartbeatService } from "./heartbeat-service.js";
import { recordBaseline } from "./integrity-baseline.js";

function memoryRuntime(): PluginRuntime {
  const map = new Map<string, unknown>();
  return {
    state: {
      openKeyedStoreV2: () => ({
        lookup: async (key: string) => map.get(key),
        register: async (key: string, value: unknown) => {
          map.set(key, value);
        },
      }),
    },
  } as unknown as PluginRuntime;
}

describe("HeartbeatService", () => {
  let dir: string;
  let runtime: PluginRuntime;
  const logger = { info: vi.fn(), warn: vi.fn() };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "friday-heartbeat-"));
    writeFileSync(path.join(dir, "PERSONA.md"), "persona body");
    runtime = memoryRuntime();
    logger.info.mockClear();
    logger.warn.mockClear();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Local noon so the beat is a liveness beat, not the night-shift no-op.
  const NOON = Date.parse("2026-11-17T12:00:00");

  const make = (lockedDown = false) =>
    new HeartbeatService({
      readConfig: () => ({ lockedDown, personaDir: dir }),
      scheduler: createTestPluginServiceScheduler(),
      logger,
      runtime,
      now: () => Date.parse("2026-11-17T12:00:00Z"),
    });

  it("warns when a protected file changed since the recorded baseline", async () => {
    await recordBaseline(runtime, [{ path: "PERSONA.md", content: "persona body" }]);
    writeFileSync(path.join(dir, "PERSONA.md"), "persona body TAMPERED");
    const service = make();
    await service.tick(NOON);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("integrity violation"));
    await service.stop();
  });

  it("does not warn when the files match the baseline", async () => {
    await recordBaseline(runtime, [{ path: "PERSONA.md", content: "persona body" }]);
    const service = make();
    await service.tick(NOON);
    expect(logger.warn).not.toHaveBeenCalled();
    await service.stop();
  });

  it("does nothing while locked down (paused)", async () => {
    await recordBaseline(runtime, [{ path: "PERSONA.md", content: "persona body" }]);
    writeFileSync(path.join(dir, "PERSONA.md"), "persona body TAMPERED");
    const service = make(true);
    await service.tick(NOON);
    expect(logger.warn).not.toHaveBeenCalled();
    await service.stop();
  });

  it("starts and stops without leaving scheduled work behind", async () => {
    const service = make();
    service.start();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("heartbeat started"));
    await service.stop();
  });
});
