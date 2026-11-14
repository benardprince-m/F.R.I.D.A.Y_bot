// FRIDAY policy: quiet modes and the escalation ceiling.
//
// During school, focus, DND, and sleep the owner must not be spammed. Non-urgent items are
// batched into a single debrief; an urgent item gets one initial ping and at most one
// follow-up, then waits. Only an explicitly defined L2+ emergency may override sleep/DND
// (Product Specification MSG-06, §5.3, §7.14; Constitution Article II.4).
//
// Contract: see docs/contracts/friday-core.md (A-05). Pure: it decides deliver-now vs
// queue, and whether a follow-up is permitted, given the owner's mode and the item urgency.

export type OwnerMode = "free" | "school" | "focus" | "dnd" | "sleep";
export type Urgency = "routine" | "urgent" | "emergency";

export interface DeliveryDecision {
  /** Deliver immediately, or hold for the next debrief. */
  action: "deliver" | "queue";
  /** Whether a follow-up ping is permitted (at most one). */
  allowFollowUp: boolean;
  reason: string;
}

/** L2+ emergencies may override quiet modes; nothing else may. */
const OVERRIDING_URGENCY: Urgency = "emergency";

/**
 * Decide how to deliver an item given the owner's mode and its urgency.
 *
 * - free: deliver everything; follow-ups allowed for urgent/emergency.
 * - school / focus: only emergencies deliver now; routine and urgent queue.
 * - dnd: only emergencies deliver now.
 * - sleep: only emergencies deliver now (per the approved playbook).
 * The one-follow-up ceiling is always enforced: `allowFollowUp` is at most one ping.
 */
export function decideDelivery(mode: OwnerMode, urgency: Urgency): DeliveryDecision {
  if (urgency === OVERRIDING_URGENCY) {
    return {
      action: "deliver",
      allowFollowUp: true,
      reason: "emergency: may override quiet modes per the approved playbook",
    };
  }

  if (mode === "free") {
    return {
      action: "deliver",
      allowFollowUp: urgency === "urgent",
      reason: "owner is free; deliver now",
    };
  }

  // Quiet modes: routine and urgent queue into a single debrief.
  return {
    action: "queue",
    allowFollowUp: false,
    reason: `${mode} mode: non-emergency items queue for the next debrief`,
  };
}

export interface FollowUpState {
  /** How many pings have already been sent for this item. */
  pingsSent: number;
}

/**
 * Whether one more follow-up ping is permitted. The ceiling is one follow-up (two pings
 * total: the initial ping and one follow-up). Beyond that, FRIDAY waits.
 */
export function mayFollowUp(state: FollowUpState): boolean {
  return state.pingsSent < 2;
}
