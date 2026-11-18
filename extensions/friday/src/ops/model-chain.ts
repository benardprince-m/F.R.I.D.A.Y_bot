// FRIDAY model default + fallback layering (C-02, §7.10).
//
// FRIDAY's primary model is DeepSeek v4.1 Flash; behind it sits an ordered free-tier chain so a
// single provider outage or exhausted quota does not stop the owner's messaging. FRIDAY owns the
// chain and hands it to the engine's gateway through `fallbacksOverride` — it never runs a second
// router (§6.1). Pure and deterministic; the caller resolves breaker health separately.
//
// Contract: see docs/contracts/friday-core.md (C-02).

import { admit, DEFAULT_BREAKER, type BreakerPolicy, type BreakerState } from "./breaker.js";

export const DEFAULT_PRIMARY_MODEL = "deepseek/deepseek-v4.1-flash";

/** Ordered free-tier fallbacks (§7.10): Gemini → Groq → Mistral → Cohere → Cloudflare. */
export const DEFAULT_FALLBACK_CHAIN = [
  "google/gemini-2.5-flash",
  "groq/llama-3.3-70b-versatile",
  "mistral/mistral-small-latest",
  "cohere/command-a-plus-05-2026",
  "cloudflare-ai-gateway/gemini-2.5-flash-lite",
] as const;

export interface ModelChain {
  /** Provider/model ref of the primary. */
  primary: string;
  /** Ordered fallback refs; never contains the primary. */
  fallbacks: string[];
}

export interface ModelChainConfig {
  /** Owner override for the primary ref; defaults to `DEFAULT_PRIMARY_MODEL`. */
  model?: string;
  /** Owner override for the fallback chain; defaults to `DEFAULT_FALLBACK_CHAIN`. */
  modelChain?: string[];
}

/** Split a "provider/model" ref. A ref without a provider segment yields an empty provider. */
export function splitModelRef(ref: string): { provider: string; model: string } {
  const index = ref.indexOf("/");
  return index === -1
    ? { provider: "", model: ref }
    : { provider: ref.slice(0, index), model: ref.slice(index + 1) };
}

/** The provider segment of a "provider/model" ref. */
export function providerOf(ref: string): string {
  return splitModelRef(ref).provider;
}

/**
 * Resolve the model chain: the primary plus its ordered fallbacks.
 *
 * Blank entries are dropped and the primary is removed from the fallbacks, so the returned chain
 * is always self-consistent regardless of what the owner configured.
 */
export function resolveModelChain(config: ModelChainConfig = {}): ModelChain {
  const primary = config.model?.trim() || DEFAULT_PRIMARY_MODEL;
  const configured =
    config.modelChain && config.modelChain.length > 0
      ? config.modelChain
      : [...DEFAULT_FALLBACK_CHAIN];
  const fallbacks = configured
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0 && ref !== primary);
  return { primary, fallbacks };
}

/**
 * Refs whose provider breaker is admitting calls right now, preserving order. Read-only: it does
 * not transition breaker state (the caller records outcomes separately). A ref whose provider is
 * unknown (no "/") is kept, so a bare model name is never silently removed.
 */
export function admittingRefs(
  refs: readonly string[],
  breakers: ReadonlyMap<string, BreakerState>,
  now: number,
  policy: BreakerPolicy = DEFAULT_BREAKER,
): string[] {
  return refs.filter((ref) => {
    const provider = providerOf(ref);
    const state = provider ? breakers.get(provider) : undefined;
    return !state || admit(state, now, policy).allowed;
  });
}

/**
 * The chain the engine should actually try, given live breaker health.
 *
 * The first admitting ref becomes the primary, so a provider whose breaker is open is skipped
 * instead of being retried on every turn. If no ref admits (every breaker open), the configured
 * primary is returned unchanged — a strict chain that will fail honestly rather than silently
 * rerouting to a provider FRIDAY cannot trust.
 */
export function effectiveChain(
  chain: ModelChain,
  breakers: ReadonlyMap<string, BreakerState>,
  now: number,
  policy: BreakerPolicy = DEFAULT_BREAKER,
): ModelChain {
  const admitting = admittingRefs([chain.primary, ...chain.fallbacks], breakers, now, policy);
  if (admitting.length === 0) {
    return { primary: chain.primary, fallbacks: [] };
  }
  const [primary, ...fallbacks] = admitting;
  return { primary: primary!, fallbacks };
}
