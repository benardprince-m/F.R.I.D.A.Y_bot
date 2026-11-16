// FRIDAY ops: the chat-driven secret store (Product Specification §7.11, §6.3; G-06, F-04).
//
// The owner is phone-only, so a credential is handed over by pasting it into chat. This
// module owns the *safe* part of that: validating the name, resolving a path that can never
// escape the owner-controlled secret directory, and describing the write. The actual atomic
// write and the chat-message deletion are performed by the caller (index.ts) using the
// engine's fs-safe secret helpers and the channel's delete action.
//
// Contract: see docs/contracts/phone-only.md. Pure: no I/O, no logging, never echoes a value.

const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

export type SecretPlan =
  | { ok: true; name: string; filePath: string; content: string }
  | { ok: false; reason: string };

/**
 * Resolve where a named secret is stored, refusing anything that could escape `secretDir`.
 *
 * The name is strictly `[A-Z][A-Z0-9_]{1,63}`; the file is `<secretDir>/<NAME>.secret`. A
 * rejected name (path separators, dots, leading digit) returns `ok: false` rather than a path.
 */
export function planSecretWrite(secretDir: string, name: string, value: string): SecretPlan {
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      reason:
        "Secret name must be UPPER_SNAKE_CASE (letters, digits, underscore), e.g. TELEGRAM_BOT_TOKEN.",
    };
  }
  if (value.length === 0) {
    return { ok: false, reason: `No value provided for ${name}.` };
  }
  return {
    ok: true,
    name,
    filePath: `${secretDir}/${name}.secret`,
    // Trailing newline: a file-based secret read trims surrounding whitespace.
    content: `${value}\n`,
  };
}

/** The owner-facing confirmation. Never contains the value. */
export function secretStoredReply(name: string): string {
  return `Stored ${name}. I deleted your message. Use it by name; I will never echo the value.`;
}
