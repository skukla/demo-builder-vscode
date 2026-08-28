---
id: EDS-9
kind: feature
area: eds
needs: []
value: med
status: shipped
---
# DA.live sign-in has no command palette entry

## Index hook

*The item in one paragraph.*

**Same gap as `PL-5`, different provider and a harder flow.** DA.live sign-in is
reachable from surfaces that happen to offer it, never by typing what you want.
The implementation already exists — `sign_in(provider:"dalive")` calls
`showDaLiveAuthQuickPick` — so this is a command contribution over a working
path. **What makes it not a copy of PL-5**: DA.live has no headless token grant,
so sign-in completes in a browser and the tool returns as soon as the prompts
open rather than when auth succeeds. A palette command has the same problem and
needs to say so, or it looks like it silently failed. Filed 2026-08-26.

## Why it is not just PL-5 with a different string

Adobe's flow resolves: `authManager.login()` returns whether it worked. DA.live's
does not — `authTools.ts` says so plainly, and its own tool description tells the
caller to "poll `get_auth_status` until `dalive.authenticated` is true".

So the command finishes in an unknown state. A palette entry that returns
immediately, with the browser still open and auth incomplete, reads as a no-op.
It needs to either report progress or say plainly that it is waiting on the
browser.

## What exists to build on

| Piece | What it gives |
|---|---|
| `authTools.ts` `sign_in` | `provider: 'dalive'` calls `showDaLiveAuthQuickPick` |
| `get_auth_status` | `dalive.authenticated` and `orgName` — the poll target |
| `open-dalive-login` | An existing message the tool deliberately bypasses; check why before reusing it |

## Its own entry — settled 2026-08-26

A shared "Sign in…" picker was considered and dropped. GitHub is out of scope
entirely (VS Code owns it via `vscode.authentication.getSession`), so there are
only two providers, and at two a picker costs a keystroke and hides them both.
One command each. See `PL-5`.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  docs(backlog): settle the sign-in question — two commands, not a picker (`faea7a40a`)
- 2026-08-26  docs(backlog): PL-5 and EDS-9 — sign-in is not in the command palette (`b45ceae5c`)
- 2026-08-27  SHIPPED: demoBuilder.signInDaLive. Delegates to the one shared showDaLiveAuthQuickPick flow (org -> browser -> token), awaited since a palette command IS the user. No second sign-in path to drift.
- 2026-08-27  Owner verified working live — re-authenticated the expired DA.live session via the palette command.
