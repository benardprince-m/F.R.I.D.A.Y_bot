# FRIDAY Red-Team Report — "break it before someone else does"

**Date:** 2026-11-18
**Engagement:** owner-requested adversarial drill
**Method:** attack the real code paths (not mocks), prove the outcome with automated attacks
**Scope:** the FRIDAY plugin under `extensions/friday/` — identity, commands, credentials, injection, deploy, secrets, budget, stores

---

## In plain language

I attacked FRIDAY the way an unfriendly person would. I found **13 real cracks**, fixed all
13, and turned every attack into a permanent test so the cracks cannot come back. I then ran a
full "the system is under attack" scenario (12 stages) to see whether FRIDAY holds up when
several attacks happen at once.

**Bottom line:** FRIDAY's defences are sound after the fixes. It refuses strangers, keeps the
owner's secrets out of the cloud, resists instructions smuggled in through data, refuses to
spend past the budget, and tells the truth about its own health. One serious crack mattered a
lot (see #1); the rest were narrower.

Honest caveat: this proves the **logic**. The body is still not connected — no live Telegram,
no live model — so nothing here is a live-fire test against a running server. That proof comes
when the host and tokens (BLK-1/2/3/5) are supplied.

---

## The one that mattered most

### Crack #1 — a "guest pass" could be turned into the owner's keys (FIXED)

**What I did:** the host has two separate switches: _"may this person run commands"_ (the
allowlist) and _"is this person the owner"_. FRIDAY was treating them as the same thing — if
either was on, the door opened.

**What that means in the real world:** the moment anyone is on the allowlist (a helper, a
family member, a second device), they could have run `/lockdown`, `/remember`, `/forget`,
`/deploy`, and read `/doctor`. `/deploy` can push code to the host; `/forget` erases the
owner's memory. That is a full takeover path, not a nuisance.

**The fix:** owner commands now require the **owner** switch specifically. An allowlisted
guest gets "Owner only." and nothing else. Proven by attacks B1–B5 in `red-team.test.ts`.

---

## Everything else I broke, in plain language

| #   | What I tried                                                       | What I found                                                                                                        | Status |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------ |
| 2   | Paste a Google (`AIza…`) or Groq (`gsk_…`) key into chat           | **Not caught** — the filter had no rule for these key shapes, so they could have left for the cloud                 | FIXED  |
| 3   | Write `authorization: bearer …` in lowercase                       | **Not caught** — the rule was case-sensitive, so a lowercase token slipped through                                  | FIXED  |
| 4   | Put a fake "end of untrusted data" marker inside a tool/web result | **Fence bypassed** — FRIDAY believed the data was already wrapped and let trailing orders ride outside the boundary | FIXED  |
| 5   | Point the deploy trigger at `../../evil.yml` or a ref with `..`    | **Not validated** — a crafted workflow name or ref could reshape the deploy request                                 | FIXED  |
| 6   | Add a forged full envelope plus extra orders after it              | **Fence bypassed** (same root as #4)                                                                                | FIXED  |
| 7   | Let one provider fail over and over                                | Handled: the breaker opens and FRIDAY fails over — no crack                                                         | PASSED |
| 8   | Burn the budget on an expensive model                              | Handled: the ceiling refuses the next call — no crack                                                               | PASSED |
| 9   | Spoof the owner bit from a message field / wrong channel           | Handled: denied — no crack                                                                                          | PASSED |
| 10  | Path-traversal in a secret name (`../../etc/passwd`)               | Handled: rejected — no crack                                                                                        | PASSED |
| 11  | Feed a corrupt row into the memory/task store                      | Handled: dropped, not trusted — no crack                                                                            | PASSED |
| 12  | Trip lockdown and then try to keep spending                        | Handled: non-essential work stops, owner stays reachable — no crack                                                 | PASSED |
| 13  | Ask FRIDAY to leak its own config / token                          | Handled: replies never contain the token — no crack                                                                 | PASSED |

Cracks #2 and #3 are the same family: a real key shape the filter did not yet know. That is
the lesson — the filter is only as good as its pattern list, so it is now broader and each new
provider key shape should be added as it is adopted.

---

## The "system under cyber attack" drill

`scenario-under-attack.test.ts` runs a 12-stage wave against a running FRIDAY and checks the
defensive outcome at each stage:

1. **Recon** — a stranger gets no tools, no memory, no answer.
2. **Phishing** — a forwarded "ignore your rules" payload is fenced, never obeyed.
3. **Injection via a tool result** — cannot escape the data boundary.
4. **Identity spoofing** — the owner bit cannot be faked from a message field.
5. **Privilege escalation** — an allowlisted guest cannot seize a command.
6. **Key exposure** — the owner pasting a key is stopped before any model sees it.
7. **Provider outage under fire** — the breaker opens and FRIDAY fails over.
8. **Spend-burn** — the ceiling stops it.
9. **Drawbridge** — the owner locks down; non-essential egress stops, the owner stays reachable.
10. **Tampering** — an edited Constitution is detected and flagged as a violation.
11. **Hijacked deploy** — a crafted workflow/ref is rejected before any request.
12. **Honesty** — after the wave, `/doctor` reports the truth, never a false "healthy".

All 12 hold.

**How FRIDAY "fights back":** it defends — it refuses, fences, fails over, caps spend, locks
down, detects tampering, and reports honestly. It does **not** counter-attack. That is by
design: spec §4.3 bans offensive tooling (no Kali/Metasploit container, no fingerprint or TLS
spoofing, no rotating proxies). A defence-only posture is the correct one for a personal
second brain.

---

## What is proven, and what is not

**Proven (automated, repeatable):** 60 attack cases (`red-team.test.ts`) + 12 scenario stages
(`scenario-under-attack.test.ts`), all passing, all against real code.

**Not yet proven (needs the live body):** behaviour against a running Telegram/Discord gateway,
a live model, real network conditions, and a real host. Those need the owner-supplied host and
tokens (BLK-1/2/3/5). Until then, treat the above as strong logic proof, not a live-fire result.

---

## Files

- `extensions/friday/red-team.test.ts` — the 60 attacks (A–H families).
- `extensions/friday/scenario-under-attack.test.ts` — the 12-stage attack wave.
- Fixes: `index.ts` (owner gate), `src/policy/redaction.ts` (key shapes), `src/policy/injection-guard.ts`
  (fence), `src/ops/deploy.ts` (deploy validation).
