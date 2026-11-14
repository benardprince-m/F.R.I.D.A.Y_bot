// FRIDAY policy: owner admission. Only the authenticated owner may invoke tools or read
// memory; unknown senders are denied (Product Specification MSG-01, §9; Constitution
// Article IV). Contract: see docs/contracts/friday-core.md (A-01). Fail-closed.

export type Admission = "owner" | "denied";

export interface SenderIdentity {
  channel: string;
  senderId: string;
}

export interface AdmissionDecision {
  admission: Admission;
  /** Human-readable and safe to log: it never echoes the raw sender id. */
  reason: string;
  allowTools: boolean;
  allowMemory: boolean;
}

const DENIED: Omit<AdmissionDecision, "reason"> = {
  admission: "denied",
  allowTools: false,
  allowMemory: false,
};

/**
 * Decide whether a sender is the owner.
 *
 * Exact match on (channel, senderId). Anything else — a different channel, a
 * near-miss id, an empty owner list — is denied with no tools and no memory.
 */
export function decideAdmission(
  sender: SenderIdentity,
  owner: SenderIdentity[],
): AdmissionDecision {
  if (owner.length === 0) {
    return { ...DENIED, reason: "no owner identity configured; denying all senders" };
  }
  const match = owner.some((o) => o.channel === sender.channel && o.senderId === sender.senderId);
  if (match) {
    return {
      admission: "owner",
      reason: "sender matches configured owner identity",
      allowTools: true,
      allowMemory: true,
    };
  }
  return { ...DENIED, reason: "sender is not the configured owner; tools and memory withheld" };
}
