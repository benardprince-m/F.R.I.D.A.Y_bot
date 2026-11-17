// FRIDAY model router: the circuit breaker (closed → open → half-open) (§7.9; C-03).
//
// The engine already fails over between providers; what it does not have is FRIDAY's policy for
// *stopping* calls to a provider that keeps failing, so a bad provider cannot burn budget or
// latency on every turn. This module is that policy, and nothing else: it is pure, keyed by
// provider, and says whether a call is admitted now and how the state changes after an outcome.
//
// Contract: see docs/contracts/friday-core.md (C-03). Pure and deterministic.

export type BreakerStatus = "closed" | "open" | "half-open";

export interface BreakerState {
  status: BreakerStatus;
  /** Consecutive failures while closed; reset on any success. */
  consecutiveFailures: number;
  /** Epoch ms when the breaker opened; the cooldown is measured from here. */
  openedAt?: number;
  /** True while a single half-open probe is in flight (only one probe is allowed at a time). */
  probeInFlight?: boolean;
}

export interface BreakerPolicy {
  /** Consecutive failures that trip a closed breaker open. */
  failureThreshold: number;
  /** Time an open breaker waits before allowing a half-open probe. */
  cooldownMs: number;
}

export const DEFAULT_BREAKER: BreakerPolicy = { failureThreshold: 3, cooldownMs: 60_000 };

export function newBreaker(): BreakerState {
  return { status: "closed", consecutiveFailures: 0 };
}

export interface BreakerAdmission {
  /** True when a call to this provider may proceed now. */
  allowed: boolean;
  /** The (possibly transitioned) breaker state to store back. */
  state: BreakerState;
  reason: string;
}

/**
 * Decide whether a call to a provider is admitted now.
 *
 * A closed breaker admits. An open breaker admits nothing until its cooldown elapses, at which
 * point it moves to half-open and admits exactly one probe. A half-open breaker admits a probe
 * only if none is already in flight.
 */
export function admit(
  state: BreakerState,
  now: number,
  policy: BreakerPolicy = DEFAULT_BREAKER,
): BreakerAdmission {
  if (state.status === "closed") {
    return { allowed: true, state, reason: "closed" };
  }
  if (state.status === "open") {
    const elapsed = state.openedAt === undefined ? Infinity : now - state.openedAt;
    if (elapsed < policy.cooldownMs) {
      return { allowed: false, state, reason: "open; cooldown not elapsed" };
    }
    return {
      allowed: true,
      state: { status: "half-open", consecutiveFailures: 0, probeInFlight: true },
      reason: "cooldown elapsed; probing half-open",
    };
  }
  // half-open
  if (state.probeInFlight) {
    return { allowed: false, state, reason: "half-open; a probe is already in flight" };
  }
  return {
    allowed: true,
    state: { ...state, probeInFlight: true },
    reason: "half-open; probing",
  };
}

/**
 * Fold a call outcome back into the breaker.
 *
 * Closed: a success resets the failure count; a failure trips open at the threshold. Half-open:
 * a success closes the breaker; a failure reopens it and restarts the cooldown.
 */
export function recordOutcome(
  state: BreakerState,
  ok: boolean,
  now: number,
  policy: BreakerPolicy = DEFAULT_BREAKER,
): BreakerState {
  if (state.status === "open") {
    // No call should have been admitted while open; keep the open state untouched.
    return state;
  }
  if (state.status === "half-open") {
    return ok ? newBreaker() : { status: "open", consecutiveFailures: 0, openedAt: now };
  }
  // closed
  if (ok) {
    return { status: "closed", consecutiveFailures: 0 };
  }
  const failures = state.consecutiveFailures + 1;
  return failures >= policy.failureThreshold
    ? { status: "open", consecutiveFailures: 0, openedAt: now }
    : { status: "closed", consecutiveFailures: failures };
}

/** One owner-facing line naming a provider that is currently not serving. */
export function breakerLine(provider: string, state: BreakerState): string | undefined {
  if (state.status === "closed") {
    return undefined;
  }
  return state.status === "open"
    ? `provider ${provider}: open (failing; calls paused)`
    : `provider ${provider}: half-open (probing)`;
}
