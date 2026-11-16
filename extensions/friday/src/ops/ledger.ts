// FRIDAY ops: the spend ledger and budget ceiling (Product Specification §7.10; C-04, C-05).
//
// Every model call reports token usage; FRIDAY records it and must stop before it spends past
// the owner's hard monthly ceiling. Prices are per-million tokens, so a call with no reported
// usage records zero cost rather than a guess.
//
// Contract: see docs/contracts/friday-core.md. Pure: it accumulates and decides; the caller
// persists the totals and enforces the decision at the egress seam.

export interface ModelUsage {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface CostEntry {
  at: string;
  provider: string;
  model: string;
  costUsd: number;
}

export interface LedgerSnapshot {
  month: string;
  entries: CostEntry[];
}

/** Per-million-token prices. Unknown models cost 0 here; the budget ceiling still applies. */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "mistral-large-latest": { input: 2, output: 6 },
  "command-r-plus": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-sonnet-4": { input: 3, output: 15 },
};

function priceFor(model: string): { input: number; output: number } {
  const direct = PRICES[model];
  if (direct) {
    return direct;
  }
  // Match a versioned id against a known base, e.g. "gemini-2.5-flash-001".
  const base = Object.keys(PRICES).find((k) => model.startsWith(k));
  return base ? PRICES[base]! : { input: 0, output: 0 };
}

/** Cost of a single call in USD, from reported token counts. */
export function costOf(usage: ModelUsage): number {
  const price = priceFor(usage.model);
  const input = (usage.inputTokens ?? 0) / 1_000_000;
  const output = (usage.outputTokens ?? 0) / 1_000_000;
  return input * price.input + output * price.output;
}

/** The UTC calendar month key, e.g. "2026-11". */
export function monthKey(at: string): string {
  return at.slice(0, 7);
}

/** Append a usage record to the ledger, rolling the ledger over when the month changes. */
export function recordUsage(
  snapshot: LedgerSnapshot,
  usage: ModelUsage,
  at: string,
): LedgerSnapshot {
  const month = monthKey(at);
  const base: LedgerSnapshot = snapshot.month === month ? snapshot : { month, entries: [] };
  const entry: CostEntry = {
    at,
    provider: usage.provider,
    model: usage.model,
    costUsd: costOf(usage),
  };
  return { month, entries: [...base.entries, entry] };
}

export function monthToDateUsd(snapshot: LedgerSnapshot): number {
  return snapshot.entries.reduce((sum, e) => sum + e.costUsd, 0);
}

export interface BudgetDecision {
  /** True when the next call may proceed. */
  allowed: boolean;
  spentUsd: number;
  /** Remaining budget, or undefined when no ceiling is configured. */
  remainingUsd?: number;
  reason: string;
}

/**
 * Decide whether another model call fits the monthly ceiling.
 *
 * With no ceiling configured (`budgetUsd` undefined) every call is allowed and the reason says
 * so. At or past the ceiling, the call is refused with the exact spend — never silently.
 */
export function decideBudget(snapshot: LedgerSnapshot, budgetUsd?: number): BudgetDecision {
  const spentUsd = monthToDateUsd(snapshot);
  if (budgetUsd === undefined) {
    return { allowed: true, spentUsd, reason: "no monthly ceiling configured" };
  }
  const remainingUsd = budgetUsd - spentUsd;
  if (remainingUsd <= 0) {
    return {
      allowed: false,
      spentUsd,
      remainingUsd: 0,
      reason: `monthly budget of $${budgetUsd.toFixed(2)} reached (spent $${spentUsd.toFixed(2)}); switching to cache/local or batching`,
    };
  }
  return { allowed: true, spentUsd, remainingUsd, reason: "within budget" };
}

/** The spend line for the morning brief and `/doctor`. */
export function spendLine(snapshot: LedgerSnapshot, budgetUsd?: number): string {
  const spent = monthToDateUsd(snapshot);
  const month = snapshot.month;
  return budgetUsd === undefined
    ? `Spend ${month}: $${spent.toFixed(2)} (no ceiling).`
    : `Spend ${month}: $${spent.toFixed(2)} of $${budgetUsd.toFixed(2)}.`;
}
