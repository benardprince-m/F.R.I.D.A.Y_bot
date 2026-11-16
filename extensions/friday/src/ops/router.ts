// FRIDAY model router: cheap-first routing with a verifier-driven cascade (§7.10, §7.9; C-01, C-03).
//
// FRIDAY routes through the engine's model gateway — never a second router (§6.1). This module
// only decides *which* model a turn should use and whether to escalate, and it degrades
// honestly: with no local provider configured it does nothing, and under lockdown or a spent
// budget it never escalates to a paid call.
//
// Contract: see docs/contracts/friday-core.md. Pure: it maps a turn and its state to a routing
// decision; index.ts translates that into `before_model_resolve` overrides.

export type TurnKind = "trivial" | "standard" | "hard";

export interface RouterConfig {
  /** Local provider id (e.g. "ollama"). Unset disables cheap-first routing. */
  localProvider?: string;
  localModel?: string;
  /** Provider/model for the expensive tier; unset means the engine default is used. */
  escalateProvider?: string;
  escalateModel?: string;
}

export interface RouterState {
  lockedDown: boolean;
  /** False when the monthly ceiling is reached; escalation is then refused. */
  budgetAllowed: boolean;
}

export interface RoutingDecision {
  provider?: string;
  model?: string;
  /** Which tier this turn will run on. */
  tier: "local" | "escalate" | "default";
  /** True when a paid escalation would be considered for a hard turn. */
  mayEscalate: boolean;
  reason: string;
}

const HARD_MARKERS = [
  "prove",
  "debug",
  "refactor",
  "architecture",
  "design",
  "why does",
  "root cause",
  "trade-off",
  "tradeoff",
  "security",
  "review",
];

/** Cheap, deterministic difficulty estimate from the prompt alone. */
export function classifyTurn(prompt: string): TurnKind {
  const text = prompt.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const hard = HARD_MARKERS.some((m) => text.includes(m));
  if (hard || words > 120) {
    return "hard";
  }
  if (words <= 6 && !text.includes("?")) {
    return "trivial";
  }
  return "standard";
}

/**
 * Decide the tier for one turn.
 *
 * Cheap-first: a configured local provider takes trivial and standard turns. Hard turns
 * escalate only when escalation is permitted (not locked down, within budget) and a target is
 * configured. Without a local provider the decision is "default" — the engine's own routing.
 */
export function routeTurn(
  prompt: string,
  config: RouterConfig,
  state: RouterState,
): RoutingDecision {
  const kind = classifyTurn(prompt);

  if (!config.localProvider || !config.localModel) {
    return {
      tier: "default",
      mayEscalate: false,
      reason: "no local provider configured; using the engine's default routing",
    };
  }

  if (kind === "hard") {
    const canEscalate =
      !state.lockedDown &&
      state.budgetAllowed &&
      Boolean(config.escalateProvider && config.escalateModel);
    if (canEscalate) {
      return {
        provider: config.escalateProvider,
        model: config.escalateModel,
        tier: "escalate",
        mayEscalate: false,
        reason: "hard turn escalated to the paid tier",
      };
    }
    // Cannot escalate: keep it local rather than spending; the verifier may still flag it.
    return {
      provider: config.localProvider,
      model: config.localModel,
      tier: "local",
      mayEscalate: false,
      reason: state.lockedDown
        ? "hard turn kept local (lockdown)"
        : "hard turn kept local (budget or no escalation target)",
    };
  }

  return {
    provider: config.localProvider,
    model: config.localModel,
    tier: "local",
    mayEscalate: kind === "standard",
    reason: `${kind} turn served locally`,
  };
}

export interface VerifierVerdict {
  /** True when the local answer is good enough to return. */
  accepted: boolean;
  reason: string;
}

/**
 * Judge a local answer before returning it.
 *
 * Deliberately conservative and cheap: an empty or truncated answer, or one that admits
 * uncertainty, is not accepted and the caller escalates (when permitted).
 */
export function verifyLocalAnswer(answer: string): VerifierVerdict {
  const text = answer.trim();
  if (text.length === 0) {
    return { accepted: false, reason: "empty answer" };
  }
  const lower = text.toLowerCase();
  const unsure = [
    "i'm not sure",
    "i am not sure",
    "i don't know",
    "i do not know",
    "cannot determine",
  ];
  if (unsure.some((p) => lower.includes(p))) {
    return { accepted: false, reason: "answer admits uncertainty" };
  }
  if (text.endsWith("...") || text.endsWith("…")) {
    return { accepted: false, reason: "answer looks truncated" };
  }
  return { accepted: true, reason: "local answer accepted" };
}
