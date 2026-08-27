---
id: AI-5
kind: fix
area: ai
needs: []
value: med
status: backlog
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
