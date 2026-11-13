# FRIDAY — your second brain, on your own hardware

FRIDAY is a personal, owner-controlled AI assistant: an always-on second brain that meets you in the chat apps you already use, keeps working while you are away, remembers what matters with evidence, uses tools safely, and comes back with a verified result. One Gateway runs it. State, memory, and credentials live on your hardware.

Built and owned by **Benard Prince**. This is a private project.

## What FRIDAY is

- **Messaging first.** Telegram is the first-build channel; the product is the chat you already have, not another dashboard.
- **Truth before confidence.** FRIDAY distinguishes verified fact, inference, uncertainty, failure, and opinion. "Done" is never accepted without evidence.
- **Owner-owned memory.** Memory is portable, inspectable, exportable, and deletable. "Forget X" purges X across every layer and proves it.
- **Safe by design.** Secrets live in a separate vault the model cannot read. Risky, public, financial, or irreversible actions require explicit approval.
- **Affordable by design.** Local models are preferred; cost is a first-class constraint.

Read [`CONSTITUTION.md`](CONSTITUTION.md) for the owner-locked boundaries, [`PERSONA.md`](PERSONA.md) for the voice, [`ROADMAP.md`](ROADMAP.md) for the phase plan, and [`AGENT_LOG.md`](AGENT_LOG.md) for the append-only implementation record.

## Development

The repository is a pnpm workspace. Plain `npm install` at the repository root is not supported.

```bash
pnpm install
pnpm build
pnpm ui:build
```

Requirements: Node 24.16+ LTS or 26.1+ (Node 26 recommended), pnpm 12.11.1 (pinned; use `corepack pnpm`).

## Run

```bash
pnpm dev            # dev profile, isolated state
openclaw onboard    # first-run wizard
openclaw gateway status
```

## Upstream

FRIDAY is built on the [OpenClaw](https://github.com/openclaw/openclaw) engine (MIT), used as the messaging gateway and agent runtime. FRIDAY owns its product-specific personality, memory, safety, and roadmap; the engine's internal contracts and imports are preserved.

## License

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for incorporated or adapted code, including the OpenClaw engine and its dependencies.
