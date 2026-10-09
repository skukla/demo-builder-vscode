---
id: AI-14
kind: fix
area: ai
needs: []
value: med
status: built
---

# Agent-run project creation waited for the AEM Code Sync App and told nobody

**What happened (2026-10-08, 23:21 to 23:49 local).** The owner asked an agent to create
a project (`bodea-jen`, EDS stack) through the MCP server. The repository was created and
pushed, the site registered, and the code publish answered `[admin] github bot not
installed on repository`, which is the one step only the repository's owner can do:
install the AEM Code Sync GitHub App. The storefront setup did what it does in the
wizard: it sent `storefront-setup-github-app-required` and paused, re-trying the publish
every 18 seconds for up to 30 minutes (`TIMEOUTS.EDS_CODE_SYNC_INSTALL_WAIT`). In the
wizard that event opens the install dialog. On the agent path it went into the progress
capture's buffer and to a no-op. The VS Code card read "Agent · Creating the project"
with no phase for 27 minutes, the agent sat inside its blocking tool call ("Are you still
working?"), and the User Logs filled with the retry's warning. The owner pressed F5,
which ended the run; the repository `skukla/bodea-jen` was left behind with no project on
disk.

Two gaps, both on the agent surface only:

1. **The hand-back reached nobody.** Fixed: the phase channel (`agentPhaseChannel.ts`)
   carries a structured hand-back (`reportHandBack`: title, detail, one action) beside
   its phases; the progress capture raises it when it sees the event; the window-side
   notifier renders it as a toast whose button opens the App's install page, and the
   same wait reaches the chat and the progress card as a phase line. The agent's
   timeline shows it as a progress entry, and `create_project`'s description says the
   call can pause for the user and must not be retried while it runs.
2. **The storefront setup's phases never reached the card.** The creation executor
   reports its phases to the agent channel; the storefront setup, which an EDS creation
   runs first, only ever sent to the webview. Fixed: the capture forwards
   `storefront-setup-progress` lines (and only that type, so a handler that already
   reports is not narrated twice).

Not fixed here, recorded:

- The agent trace of the previous host was not on disk after the F5: `get_agent_trace`
  listed one session file, written by the NEW host. The previous host's calls (the
  create itself) were lost with it. Whether the trace is flushed only at a clean
  shutdown is the question.
- Whether the tool should block for the whole wait at all. The pause-in-place design
  (EDS-20) is right for the run; an MCP client with a short timeout still sees a hang.
  The sign-in tools already answer at once and let the agent poll; a creation cannot,
  because it holds the run. Left as designed, now that the person is told.

## Shipped so far
