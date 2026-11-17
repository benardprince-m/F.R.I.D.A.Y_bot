// Tests for the F-05 baseline store. The invariant: a host with no store, or no baseline, is
// "unverified" (never falsely "ok"); a recorded baseline makes an unchanged set "ok" and a
// changed set a "violation".
import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";
import { describe, expect, it } from "vitest";
import { checkProtectedIntegrity, recordBaseline } from "./integrity-baseline.js";

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

const FILES = [{ path: "PERSONA.md", content: "persona body" }];

describe("checkProtectedIntegrity", () => {
  it("is unverified when the host has no store", async () => {
    const result = await checkProtectedIntegrity(undefined, FILES);
    expect(result.status).toBe("unverified");
  });

  it("is unverified when no baseline has been recorded", async () => {
    const result = await checkProtectedIntegrity(memoryRuntime(), FILES);
    expect(result.status).toBe("unverified");
  });

  it("is ok after the baseline is recorded and the files are unchanged", async () => {
    const runtime = memoryRuntime();
    await recordBaseline(runtime, FILES);
    expect((await checkProtectedIntegrity(runtime, FILES)).status).toBe("ok");
  });

  it("is a violation after a protected file changes", async () => {
    const runtime = memoryRuntime();
    await recordBaseline(runtime, FILES);
    const result = await checkProtectedIntegrity(runtime, [
      { path: "PERSONA.md", content: "persona body TAMPERED" },
    ]);
    expect(result.status).toBe("violation");
  });
});

describe("recordBaseline", () => {
  it("returns false when the host has no store", async () => {
    expect(await recordBaseline(undefined, FILES)).toBe(false);
  });
});
