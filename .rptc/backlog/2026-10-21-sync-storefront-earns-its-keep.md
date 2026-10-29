---
id: EDS-58
kind: question
area: eds
needs: []
value: med
status: open
---

# Does the Sync Storefront button earn its keep when no SC edits code?

Filed 2026-10-20 while researching EDS-57. Owner: "If I told you no SCs are comfortable
with code, does Sync Storefront still earn its keep as a button/feature?"

## What it does

The dashboard's Sync Storefront (`src/features/lifecycle/commands/syncStorefront.ts`)
commits and pushes the edits in the project's local storefront copy
(`<project>/components/eds-storefront`) and publishes the code. On a clash it leaves the
markers in the files, opens Source Control with "Accept Current / Incoming / Both", and
waits up to 5 minutes (`TIMEOUTS.VERY_LONG`) before undoing everything. The agent's
`sync_storefront` tool aborts on any clash.

## Evidence so far (owner's machine, 2026-10-20)

- If SCs do not write code, the only author of edits in that folder is the AI agent: the
  generated AGENTS.md tells agents "git clone of the GitHub repo — edit files here"
  (`agentsMdStorefrontSections.ts:37`), and the agent has its own `sync_storefront` tool.
- Claude Code sessions run against SC projects made 28 tool calls in total; none was
  `sync_storefront` (the count found the 5 Bash calls, so it works). Copilot chats are
  not recorded there, so this says nothing about Copilot users.
- The newest commits in each local copy are Demo Builder's own
  ("chore(demo-builder): vendor brand-assets snippet into head.html"), not a person's.
- Nothing pulls the local copy after an update commits through GitHub. JustRite's is 11+
  commits behind its GitHub main, with an uncommitted `config.json`. Agents are being sent
  to edit an old copy. EDS-57 step 1 fixes the refresh either way.

## Recommendation

Remove the human button, or fold it into something the SC already presses, keeping the
agent tool. Before deciding: find what the extension itself writes into the local copy
(the "vendor … into head.html" commits) and how those reach GitHub, because removing the
button must not strand them.
