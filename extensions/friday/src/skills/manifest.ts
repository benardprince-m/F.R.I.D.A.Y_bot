// FRIDAY skills: the skill manifest.
//
// Every skill declares its permissions, data classes, egress, cost, and failure behavior
// (Product Specification §6.3). This module is the manifest shape and its validation, so an
// incomplete or unsafe skill cannot be registered.
//
// Contract: see docs/contracts/friday-core.md (D-02). Pure: it validates a manifest object.

export type DataClass = "public" | "owner-private" | "customer" | "credential";

export type FailureBehavior = "retry-backoff" | "fail-fast" | "quarantine";

export interface SkillManifest {
  name: string;
  version: string;
  /** What the skill may do, in plain terms. */
  description: string;
  /** Capabilities the skill requests. */
  permissions: string[];
  /** Data classes the skill may read or write. */
  dataClasses: DataClass[];
  /** Where it sends data (hostnames), or [] if it is fully local. */
  egress: string[];
  /** Monthly cost in USD, or 0 for free. */
  costUsdPerMonth: number;
  /** How it behaves when it fails. */
  failureBehavior: FailureBehavior;
  /** How to disable it. */
  disablePath: string;
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_DATA_CLASSES: ReadonlySet<string> = new Set([
  "public",
  "owner-private",
  "customer",
  "credential",
]);
const VALID_FAILURE: ReadonlySet<string> = new Set(["retry-backoff", "fail-fast", "quarantine"]);

/**
 * Validate a skill manifest.
 *
 * Hard errors block registration: missing fields, a customer-data class (the DeepMark
 * boundary is open — customer data is not permitted until the owner decides), a credential
 * data class (skills never hold credentials directly), and an incomplete manifest.
 */
export function validateManifest(m: Partial<SkillManifest>): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!m.name || !/^[a-z][a-z0-9-]*$/.test(m.name)) {
    errors.push("name must be lower-case kebab-case");
  }
  if (!m.version) {
    errors.push("version is required");
  }
  if (!m.description || m.description.trim().length === 0) {
    errors.push("description is required");
  }
  if (!Array.isArray(m.permissions) || m.permissions.length === 0) {
    errors.push('permissions must be declared (at least one entry, e.g. "none")');
  }
  if (!Array.isArray(m.dataClasses) || m.dataClasses.length === 0) {
    errors.push("dataClasses must be declared");
  } else {
    for (const dc of m.dataClasses) {
      if (!VALID_DATA_CLASSES.has(dc)) {
        errors.push(`unknown data class: ${dc}`);
      }
    }
    if (m.dataClasses.includes("customer")) {
      errors.push(
        "customer data is not permitted until the owner resolves the DeepMark boundary (§7.12, §12 #7)",
      );
    }
    if (m.dataClasses.includes("credential")) {
      errors.push("skills must not declare a credential data class; secrets come from the vault");
    }
  }
  if (!Array.isArray(m.egress)) {
    errors.push("egress must be an array (use [] for a fully local skill)");
  }
  if (typeof m.costUsdPerMonth !== "number" || m.costUsdPerMonth < 0) {
    errors.push("costUsdPerMonth must be a number >= 0");
  } else if (m.costUsdPerMonth > 0) {
    warnings.push("paid skill: requires explicit owner approval before enablement (§7.10)");
  }
  if (!m.failureBehavior || !VALID_FAILURE.has(m.failureBehavior)) {
    errors.push("failureBehavior must be one of retry-backoff, fail-fast, quarantine");
  }
  if (!m.disablePath || m.disablePath.trim().length === 0) {
    errors.push("disablePath is required");
  }
  if (Array.isArray(m.egress) && m.egress.length > 0 && m.egress.some((h) => !h.includes("."))) {
    warnings.push("egress entries should be hostnames");
  }

  return { valid: errors.length === 0, errors, warnings };
}
