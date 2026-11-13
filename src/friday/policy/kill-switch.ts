// FRIDAY policy: /lockdown kill switch. Stop non-essential outbound traffic while keeping
// the owner able to message FRIDAY (Product Specification §7.15).
//
// Contract: see docs/contracts/friday-core.md (F-03).

export type EgressClass = "owner-messaging" | "essential" | "non-essential";
export type EgressDecision = "allow" | "block";

export interface EgressState {
  lockedDown: boolean;
}

/**
 * Decide whether one class of outbound traffic may proceed.
 *
 * When locked down, non-essential traffic is blocked; owner messaging and essential
 * system traffic are allowed so the owner can still reach FRIDAY and issue !unlock.
 */
export function decideEgress(kind: EgressClass, state: EgressState): EgressDecision {
  if (!state.lockedDown) {
    return "allow";
  }
  return kind === "non-essential" ? "block" : "allow";
}
