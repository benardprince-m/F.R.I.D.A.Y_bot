// FRIDAY skills: the capability-acquisition protocol.
//
// FRIDAY's capability compounds only through a controlled protocol: detect a real gap,
// research, assess, sandbox, registry, log, and ask before production access or paid use
// (Product Specification §7.6). This module encodes the protocol as a state machine with
// explicit gates, so a capability can never silently reach production.
//
// Contract: see docs/contracts/friday-core.md (D-01). Pure: it tracks the protocol state and
// the gate decisions; the caller performs the research, sandbox run, and registry write.

export type AcquisitionStage =
  | "detected" // 1. a real capability gap was found
  | "researched" // 2. suitable repos/APIs/MCP/docs/releases assessed
  | "assessed" // 3. fit, license, security, data access, egress, cost, failure behavior
  | "sandbox-tested" // 6. isolated sandbox run with synthetic data, no prod credentials
  | "registered" // 7. added to the permissioned registry with a disable path
  | "production-approved"; // 8. owner approved production access (may be paid)

export interface AcquisitionRecord {
  id: string;
  /** The capability gap this acquisition addresses. */
  gap: string;
  stage: AcquisitionStage;
  /** Whether a suitable existing MCP/official integration was preferred (step 4). */
  existingIntegrationPreferred: boolean;
  /** Whether the assessment passed every required check (step 3). */
  assessmentPassed: boolean;
  /** Whether the sandbox test used synthetic data and no production credentials (step 6). */
  sandboxClean: boolean;
  /** How to disable the capability (required at registration, step 7). */
  disablePath?: string;
  /** Whether production access or paid use was explicitly owner-approved (step 8). */
  ownerApprovedProduction: boolean;
}

export interface GateResult {
  /** Whether the transition is permitted. */
  allowed: boolean;
  reason: string;
}

const ORDER: AcquisitionStage[] = [
  "detected",
  "researched",
  "assessed",
  "sandbox-tested",
  "registered",
  "production-approved",
];

function stageIndex(s: AcquisitionStage): number {
  return ORDER.indexOf(s);
}

/**
 * Whether a record may advance from its current stage to `next`.
 *
 * Each gate is enforced: an assessment must pass before sandbox testing; the sandbox must be
 * clean before registration; a disable path must exist before registration; and production
 * access requires explicit owner approval. Skipping a stage is never allowed.
 */
export function mayAdvance(record: AcquisitionRecord, next: AcquisitionStage): GateResult {
  const from = stageIndex(record.stage);
  const to = stageIndex(next);
  if (to !== from + 1) {
    return {
      allowed: false,
      reason: `must advance one stage at a time (from ${record.stage})`,
    };
  }

  switch (next) {
    case "assessed":
      return { allowed: true, reason: "research recorded; assessment may proceed" };
    case "sandbox-tested":
      if (!record.assessmentPassed) {
        return { allowed: false, reason: "assessment did not pass; cannot sandbox-test" };
      }
      return { allowed: true, reason: "assessment passed; sandbox test may proceed" };
    case "registered":
      if (!record.sandboxClean) {
        return { allowed: false, reason: "sandbox test not clean; cannot register" };
      }
      if (!record.disablePath || record.disablePath.trim().length === 0) {
        return { allowed: false, reason: "a disable path is required before registration" };
      }
      return { allowed: true, reason: "sandbox clean and disable path recorded; may register" };
    case "production-approved":
      if (!record.ownerApprovedProduction) {
        return {
          allowed: false,
          reason: "production/paid access requires explicit owner approval",
        };
      }
      return { allowed: true, reason: "owner approved production access" };
    default:
      return { allowed: true, reason: "advance permitted" };
  }
}
