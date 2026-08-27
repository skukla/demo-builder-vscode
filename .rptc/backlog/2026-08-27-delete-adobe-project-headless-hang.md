---
id: AI-5
kind: fix
area: ai
needs: []
value: med
status: shipped
---

# delete_adobe_project hangs on the headless path

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27, from the owner-directed Console-lifecycle spike.

The MCP tool `delete_adobe_project` (adobeResourceTools.ts) hangs indefinitely
when called headless: the `[MCP] ... args` line is the last thing logged, no
teardown phase ever reports, and the project survives. The raw Console SDK
`deleteProject` on the same projects answers 200 in about a second, so the hang
is in our pre-delete teardown chain (`createTeardownDeps` →
`teardownConsoleProject`: workspace enumeration, S2S credential scan, event
entity sweep) — not in Adobe's delete.

Two fixes wanted:

1. Find and unblock the hanging step (suspects: `getWorkspaces`,
   `getWorkspaceS2SCredential`, `IoEventsClient` calls — none carry a timeout
   visible from the hang site).
2. Give `teardownConsoleProject` debug logging per step. Today it reports only
   through the phase channel, so a hang is silent in Debug Logs and the next
   person starts from zero.

## Shipped so far

- 2026-08-27  MEASURED LIVE 2026-08-27 (owner-directed lifecycle spike): delete_adobe_project HANGS on the headless/MCP path — two attempts (60s and 240s probe timeouts) produced zero progress: the args log line appears, then nothing — no teardown phase, no [Entity Fetcher] getWorkspaces line, no completion — and the project survives (checked 5+ min later). Meanwhile the raw Console SDK deleteProject on the SAME projects answered 200 in ~1s each (three in a row), so the hang is in OUR pre-delete teardown chain (createTeardownDeps -> prepareTeardown / scanWorkspaceCredentials / event-entity sweep), not Adobe. The webview/dashboard delete path may be fine (different context) — untested tonight. Repro: probe call delete_adobe_project with confirm+confirmName on a fresh spike project. Also note: teardownConsoleProject logs ONLY through the phase channel, so when it hangs it is silent in Debug Logs — whatever the fix, give the teardown steps debug logging so the next hang names its step.
- 2026-08-27  DIAGNOSED AND FIXED same-day (2026-08-27 night). The 'hang' was never a hang: destructive MCP calls carrying confirm:true raise a MODAL consent dialog in the VS Code window (createAgentConsentGate — the designed human floor), and when nobody is watching that window the await blocked FOREVER with zero logging. Live bisection: the new [delete_adobe_project] step logs + teardown step logs never fired, placing the block in the wrapper's consent gate before the handler. Fix shipped, three parts: (1) the gate logs '[MCP] <tool> awaiting the user consent dialog…' BEFORE opening the dialog, so the wait names itself; (2) the modal races a TIMEOUTS.LONG (3 min) timer — unanswered resolves into a 'Nobody answered' prose refusal telling the agent the user may be away and how to proceed (a late click grants nothing); (3) teardownConsoleProject now debug-logs every step + outcome, so the next slow step is findable from Debug Logs alone. PROVEN LIVE: the identical delete call that previously sat 240s+ with no output now answers the Nobody-answered refusal at 180s; declines still answer the decline refusal; fake-timer race test + step-log assertions added, full suite 15,059 green. Bonus: read_debug_logs (new tool, same session) located the block in two calls — the tool this defect justified is the tool that found it.
