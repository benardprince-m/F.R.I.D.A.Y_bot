// FRIDAY startup banner: a clean, static wordmark.
//
// FRIDAY spec law #3 ("clean, functional appearance") bans mascots, orbs, and
// decorative animation. The former mascot art, block wordmark, and startup
// animation are intentionally gone; the exported API is unchanged so callers
// (onboarding wizard, foreground gateway run) keep working.
import type { RuntimeEnv } from "../runtime.js";

type ClawBannerOptions = {
  columns?: number;
  isTty?: boolean;
  rich?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Accepted for call-site compatibility; no animation runs, so it is unused. */
  settleWhen?: PromiseLike<unknown>;
  sleep?: (ms: number) => Promise<void>;
  write?: (chunk: string) => void;
};

export type ClawBannerResult = "static" | "completed" | "settled";

const TITLE_LINE = "FRIDAY";
const SUBTITLE_LINE = "Your second brain — running on your own hardware.";

function renderBanner(): string {
  return [TITLE_LINE, SUBTITLE_LINE].join("\n");
}

export async function printClawBanner(
  runtime: RuntimeEnv,
  options: ClawBannerOptions = {},
): Promise<ClawBannerResult> {
  const columns = options.columns ?? process.stdout.columns ?? 80;
  if (columns < TITLE_LINE.length + 2) {
    runtime.log(`${TITLE_LINE}\n`);
    return "static";
  }
  runtime.log(`${renderBanner()}\n`);
  return "static";
}
