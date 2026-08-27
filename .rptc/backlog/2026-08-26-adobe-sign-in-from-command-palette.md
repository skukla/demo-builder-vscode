---
id: PL-5
kind: feature
area: platform
needs: []
value: med
status: shipped
---
# Adobe sign-in has no command palette entry

## Index hook

*The item in one paragraph.*

**There is no way to sign in to Adobe from the command palette — 24 contributed
commands and not one of them is a sign-in.** Raised by the owner 2026-08-26 after
an expired Adobe token stopped a measurement mid-session: the token had gone
stale hours earlier, nothing said so, and recovering meant finding a surface that
happens to offer sign-in rather than typing what you want. **The work is
plumbing, not design**: `sign_in(provider:"adobe")` already does it in one line —
`ctx.authManager?.login()` — so this is a `package.json` command contribution and
a handler that calls the same path. Filed 2026-08-26.

## Why it came up

An expired Adobe session is invisible until something fails, and what fails is
usually a tool answering "Adobe sign-in required" in the middle of other work. On
2026-08-26 that cost a battery run: four prompts came back as errors, the results
were compared against a signed-in baseline, and a wrong conclusion was drawn
before anyone noticed the token had expired.

The extension already knows. `get_auth_status` reports
`adobe.expiresInMinutes` — it was `-9` while everything carried on regardless.

## What exists to build on

| Piece | What it gives |
|---|---|
| `authTools.ts` `sign_in` | `provider: 'adobe'` calls `ctx.authManager?.login()` and returns success |
| `get_auth_status` | Already reports authenticated state and minutes to expiry |
| `package.json` `contributes.commands` | 24 entries; the pattern to copy is any of them |

## Worth deciding while building

- **Should the title say what state you are in?** A palette entry reading
  "Demo Builder: Sign in to Adobe" is fine, but the useful version knows you are
  already signed in and for how long.
## Two entries, not a picker — settled 2026-08-26

**GitHub is NOT in scope**, and that decided it. GitHub auth goes through
`vscode.authentication.getSession` (`edsGitHubHandlers.ts:232`), so VS Code owns
the flow and prompts on demand — there is nothing for us to contribute. That
leaves Adobe and DA.live (`EDS-9`), and at two providers a picker costs a
keystroke and hides them: you would type "sign in" and then choose, instead of
typing "adobe" and landing on it.

So: one command each. Revisit only if a third provider appears that VS Code does
not already handle, and none is expected.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  docs(backlog): settle the sign-in question — two commands, not a picker (`faea7a40a`)
- 2026-08-26  docs(backlog): PL-5 and EDS-9 — sign-in is not in the command palette (`b45ceae5c`)
- 2026-08-27  SHIPPED: demoBuilder.signInAdobe. Checks state first — a valid session offers a forced re-login (the org-switch recovery) instead of a silent no-op; expiry minutes shown in the offer. Progress notification during login.
