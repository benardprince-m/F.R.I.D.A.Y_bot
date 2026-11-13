// FRIDAY banner tests: the banner is static and mascot-free (spec law #3).
import { describe, expect, it, vi } from "vitest";
import { stripAnsi } from "../../packages/terminal-core/src/ansi.js";
import type { RuntimeEnv } from "../runtime.js";
import { printClawBanner } from "./claw-banner.js";

const runtimeStub = () => {
  const log = vi.fn();
  return { runtime: { log } as unknown as RuntimeEnv, log };
};

describe("printClawBanner", () => {
  it("prints a clean FRIDAY wordmark with no mascot art", async () => {
    const { runtime, log } = runtimeStub();
    const result = await printClawBanner(runtime, {
      columns: 120,
      isTty: true,
      rich: true,
      env: {},
    });
    const output = stripAnsi(String(log.mock.calls[0]?.[0]));
    expect(result).toBe("static");
    expect(output).toContain("FRIDAY");
    expect(output).not.toContain("OPENCLAW");
    expect(output).not.toContain("█");
    expect(output).not.toContain("•");
  });

  it("falls back to the bare title on narrow terminals", async () => {
    const { runtime, log } = runtimeStub();
    await printClawBanner(runtime, { columns: 3, isTty: true, rich: true, env: {} });
    const output = stripAnsi(String(log.mock.calls[0]?.[0]));
    expect(output.trim()).toBe("FRIDAY");
  });

  it("never writes cursor-control escape sequences", async () => {
    const chunks: string[] = [];
    const { runtime } = runtimeStub();
    await printClawBanner(runtime, {
      columns: 120,
      isTty: true,
      rich: true,
      env: {},
      write: (chunk) => chunks.push(chunk),
    });
    expect(chunks).toEqual([]);
  });
});
