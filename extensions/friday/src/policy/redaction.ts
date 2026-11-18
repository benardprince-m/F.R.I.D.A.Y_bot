// FRIDAY policy: PII and secret filtering that runs BEFORE any content leaves for a
// third-party model (Product Specification §7.15, §6.3, §9; Constitution Article IV).
//
// Contract: see docs/contracts/friday-core.md (F-01). Deterministic; identical input
// yields identical tokens; raw secret values never appear in the output, in findings,
// or in any log. This module is pure — it takes a string and returns a string — so it
// is testable without credentials, network, or a running Gateway.

export type RedactionKind =
  | "email"
  | "phone"
  | "national-id"
  | "card"
  | "ip"
  | "api-key"
  | "bearer-token"
  | "private-key"
  | "password-assignment";

export interface RedactionFinding {
  kind: RedactionKind;
  /** Stable placeholder that replaced the value, e.g. "[[EMAIL_1]]". */
  token: string;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
  /** True when a hard credential (key, token, private key, password) was found. */
  blocked: boolean;
}

/** Credential classes are "hard": their presence blocks egress, not just masks it. */
const HARD_KINDS: ReadonlySet<RedactionKind> = new Set([
  "api-key",
  "bearer-token",
  "private-key",
  "password-assignment",
]);

interface Pattern {
  kind: RedactionKind;
  regex: RegExp;
}

// Order matters: private keys and explicit credential assignments are matched before
// looser numeric patterns so a PEM block is never partially eaten by the card rule.
const PATTERNS: readonly Pattern[] = [
  {
    kind: "private-key",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "password-assignment",
    regex: /\b(?:password|passwd|pwd|secret)\s*[:=]\s*["']?([^\s"',;]{4,})["']?/gi,
  },
  {
    kind: "bearer-token",
    regex: /\bBearer\s+([A-Za-z0-9._~+/-]{16,}=*)/gi,
  },
  { kind: "api-key", regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { kind: "api-key", regex: /\bgsk_[A-Za-z0-9]{20,}\b/g },
  { kind: "api-key", regex: /\b(?:sk|rk|pk|api[_-]?key|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/gi },
  { kind: "api-key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "api-key", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "ip", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: "card", regex: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: "national-id", regex: /\b\d{7,9}\b/g },
  // A phone number needs at least 9 digits and uses space/paren/dash separators (never a dot,
  // so it cannot swallow a date like 2026-11-18); the lookarounds stop it eating a longer number.
  { kind: "phone", regex: /(?<![\d-])\+?(?:\d[\s()-]*){9,}(?<![\s()-])(?![\d-])/g },
];

/**
 * Replace PII and secrets with stable placeholders.
 *
 * `opts.allow` lists kinds the caller has explicitly permitted to pass through
 * (for example, an owner-provided value the owner asked to send). Hard credential
 * kinds cannot be allowed through; `blocked` stays true if one is present.
 */
export function redactForEgress(
  input: string,
  opts: { allow?: RedactionKind[] } = {},
): RedactionResult {
  const allow = new Set(opts.allow ?? []);
  const counts = new Map<RedactionKind, number>();
  const findings: RedactionFinding[] = [];
  let text = input;

  for (const { kind, regex } of PATTERNS) {
    if (allow.has(kind) && !HARD_KINDS.has(kind)) {
      continue;
    }
    text = text.replace(regex, (match) => {
      const n = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, n);
      const token = `[[${kind.toUpperCase().replace(/-/g, "_")}_${n}]]`;
      findings.push({ kind, token });
      // Preserve the key name for a password assignment so context survives.
      if (kind === "password-assignment") {
        const label = match.slice(0, match.indexOf(match.match(/[:=]/)?.[0] ?? ""));
        return `${label}=${token}`;
      }
      return token;
    });
  }

  const blocked = findings.some((f) => HARD_KINDS.has(f.kind));
  return { text, findings, blocked };
}
