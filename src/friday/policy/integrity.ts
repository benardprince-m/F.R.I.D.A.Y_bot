// FRIDAY integrity: protected-file check against an owner-approved baseline.
//
// The Constitution and the persona are protected files. A nightly check compares them with
// an owner-approved baseline; an unexpected change triggers an immediate alert and a safe
// rollback. Rollback never edits the Constitution "to fix" an incident (Product
// Specification §7.5; Constitution Article VIII.4).
//
// Contract: see docs/contracts/friday-core.md (F-05). Pure: it hashes content and compares
// against a baseline map. It does not read the filesystem or perform the rollback itself —
// the caller does, using this report as the trigger.

import { createHash } from "node:crypto";

export interface ProtectedFile {
  path: string;
  content: string;
}

/** path -> sha256 hex of the owner-approved content. */
export type IntegrityBaseline = Record<string, string>;

export type IntegrityStatus = "ok" | "changed" | "missing" | "unexpected";

export interface IntegrityFinding {
  path: string;
  status: IntegrityStatus;
  /** Present for "changed"/"missing"/"unexpected": the hash we computed or expected. */
  actual?: string;
  expected?: string;
}

export interface IntegrityReport {
  findings: IntegrityFinding[];
  /** True only when every protected file matches the baseline and nothing is missing. */
  clean: boolean;
  /** Findings that require an alert and a rollback decision. */
  violations: IntegrityFinding[];
}

/** sha256 hex of a string — the same digest the baseline stores. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Build a baseline from current files. The owner approves this once and stores it. */
export function buildBaseline(files: ProtectedFile[]): IntegrityBaseline {
  const out: IntegrityBaseline = {};
  for (const f of files) {
    out[f.path] = hashContent(f.content);
  }
  return out;
}

/**
 * Compare the current protected files against the baseline.
 *
 * A file whose content differs is "changed"; a baseline entry with no current file is
 * "missing". Files present now but absent from the baseline are reported only when the
 * caller passes them in — the baseline defines the protected set, so an unknown file is not
 * itself a violation unless it shadows a protected path.
 */
export function checkIntegrity(
  files: ProtectedFile[],
  baseline: IntegrityBaseline,
): IntegrityReport {
  const findings: IntegrityFinding[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    seen.add(f.path);
    const actual = hashContent(f.content);
    const expected = baseline[f.path];
    if (expected === undefined) {
      findings.push({ path: f.path, status: "unexpected", actual });
    } else if (actual === expected) {
      findings.push({ path: f.path, status: "ok", actual, expected });
    } else {
      findings.push({ path: f.path, status: "changed", actual, expected });
    }
  }

  for (const path of Object.keys(baseline)) {
    if (!seen.has(path)) {
      findings.push({ path, status: "missing", expected: baseline[path] });
    }
  }

  const violations = findings.filter((f) => f.status !== "ok");
  return { findings, clean: violations.length === 0, violations };
}

/** Render the owner-facing integrity alert. Never includes file contents, only hashes. */
export function renderIntegrityReport(report: IntegrityReport): string {
  if (report.clean) {
    return "Integrity check: clean. Protected files match the owner-approved baseline.";
  }
  const lines = ["Integrity check: VIOLATION — protected files changed unexpectedly."];
  for (const v of report.violations) {
    if (v.status === "changed") {
      lines.push(
        `- ${v.path}: content changed (expected ${short(v.expected)}, got ${short(v.actual)})`,
      );
    } else if (v.status === "missing") {
      lines.push(`- ${v.path}: missing (expected ${short(v.expected)})`);
    } else {
      lines.push(`- ${v.path}: not in the baseline (got ${short(v.actual)})`);
    }
  }
  lines.push(
    "Action: alert the owner and roll back to the baseline. Do not edit the Constitution.",
  );
  return lines.join("\n");
}

function short(hash: string | undefined): string {
  return hash ? hash.slice(0, 12) : "none";
}
