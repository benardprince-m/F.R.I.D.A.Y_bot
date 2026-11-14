// FRIDAY phone-only control path: secret intake from chat.
//
// The owner is phone-only, so the only way to hand FRIDAY a credential is to paste it into
// the chat. That message must be consumed, stored in the secret store, and DELETED so the
// value does not linger in chat history (Product Specification §7.11, §6.3; Constitution
// Article IV.2). The value is never echoed back and never logged.
//
// Contract: see docs/contracts/phone-only.md. Pure function: it parses and decides; the
// caller performs the store and the message deletion.

export interface SecretIntakeStore {
  kind: "store";
  /** Name the owner chose, e.g. "TELEGRAM_BOT_TOKEN". */
  name: string;
  /** The secret value. Callers pass this straight to the secret store; never log it. */
  value: string;
  /** The caller MUST delete the originating chat message after storing. */
  deleteMessage: true;
  /** Owner-facing confirmation; never contains the value. */
  reply: string;
}

export interface SecretIntakeHelp {
  kind: "help";
  reply: string;
}

export interface SecretIntakeIgnore {
  kind: "ignore";
}

export type SecretIntakeResult = SecretIntakeStore | SecretIntakeHelp | SecretIntakeIgnore;

const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

const HELP: SecretIntakeHelp = {
  kind: "help",
  reply:
    "To give me a secret, send:\n" +
    "/secret NAME value\n" +
    "Example: /secret TELEGRAM_BOT_TOKEN 123456:ABC-...\n" +
    "I store it, then delete your message so it does not stay in the chat.",
};

/**
 * Parse an inbound chat message for a secret-paste command.
 *
 * Recognised forms (case-insensitive command):
 *   /secret NAME value
 *   /secret set NAME value
 *
 * The value is captured verbatim (it may contain spaces, e.g. a PEM key) and returned for
 * the caller to store. A bare `/secret` returns help. Anything else is ignored.
 */
export function parseSecretIntake(text: string): SecretIntakeResult {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n")[0] ?? "";
  if (!/^\/secret\b/i.test(firstLine)) {
    return { kind: "ignore" };
  }

  // Drop the command token; optional literal "set".
  let rest = trimmed.replace(/^\/secret\b/i, "").trimStart();
  rest = rest.replace(/^set\b\s*/i, "");

  if (rest.length === 0) {
    return HELP;
  }

  // NAME is the first whitespace-delimited token; the value is everything after it.
  const match = rest.match(/^(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) {
    return HELP;
  }
  const name = match[1] ?? "";
  const value = match[2] ?? "";

  if (!NAME_RE.test(name)) {
    return {
      kind: "help",
      reply:
        "Secret name must be UPPER_SNAKE_CASE (letters, digits, underscore), e.g. TELEGRAM_BOT_TOKEN.",
    };
  }
  if (value.trim().length === 0) {
    return {
      kind: "help",
      reply: `No value provided for ${name}. Send: /secret ${name} <value>`,
    };
  }

  return {
    kind: "store",
    name,
    value,
    deleteMessage: true,
    reply: `Stored ${name}. I deleted your message. Use it by name; I will never echo the value.`,
  };
}
