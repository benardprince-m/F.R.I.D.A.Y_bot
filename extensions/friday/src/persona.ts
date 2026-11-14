// FRIDAY persona + Constitution system context.
//
// The persona and Constitution are owner-authored, protected files (see
// `policy/integrity.ts`). They are injected as cached system context so the provider can
// reuse the prompt prefix across turns; the composition is deterministic so the prefix
// stays stable byte-for-byte. Reading is best-effort: a missing file yields empty text
// rather than crashing the turn.

import fs from "node:fs";
import path from "node:path";

/** Bound the injected context so a runaway file cannot blow the prompt budget. */
const MAX_SECTION_BYTES = 64 * 1024;

export interface SystemContextSources {
  persona?: string;
  constitution?: string;
}

/**
 * Compose the persona and Constitution into one system-context string.
 *
 * Order is fixed (persona first, Constitution second) and empty sections are omitted, so
 * the same inputs always produce the same bytes. Pure — safe to unit-test.
 */
export function composeSystemContext(sources: SystemContextSources): string {
  const sections = [sources.persona, sources.constitution]
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter((text) => text.length > 0);
  return sections.join("\n\n");
}

function readBounded(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      return undefined;
    }
    if (stat.size > MAX_SECTION_BYTES) {
      return undefined;
    }
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Load the persona and Constitution from `dir` (the owner-controlled directory holding
 * `PERSONA.md` and `CONSTITUTION.md`). Missing or oversized files are skipped.
 */
export function loadSystemContext(dir: string): string {
  return composeSystemContext({
    persona: readBounded(path.join(dir, "PERSONA.md")),
    constitution: readBounded(path.join(dir, "CONSTITUTION.md")),
  });
}
