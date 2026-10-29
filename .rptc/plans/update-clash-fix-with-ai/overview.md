# EDS-57: a storefront update that stops on a clash can be fixed with AI

Backlog: `.rptc/backlog/2026-10-21-update-clash-fix-with-ai.md`.
Research: 2026-10-20 (a code trace, a measurement over the storefronts on the owner's
machine, and the AI engines' own docs; findings cited inline, paths from the repo root).

## The outcome

When the colleague's template update or the Adobe boilerplate update stops because a file
clashes with an edit in the storefront, the SC sees three choices, none of which involves
reading code:

| Choice | What happens |
|---|---|
| **Fix with AI** | The clash is kept in the project's local storefront copy and the SC's chosen AI opens on it. When it is fixed, the next Apply finishes the update |
| **Leave it as it is** | Nothing changes. The update stays offered |
| **Reset to template** | Colleague's row only, as today: replaces the clashing files with the template's |

An agent already in chat gets the same: `apply_updates` names the clash and where it is
kept, and finishes the update once the markers are gone.

## What the code does today (the facts the steps rest on)

- Both update rows apply in a throwaway clone (`templateCheckout.ts:58`, depth 50). On a
  clash it is `git reset --hard` (`templateMergeBase.ts:132-139`) and deleted in `finally`
  (`templateCheckout.ts:95-101`). Only the file names survive, as `TemplateSyncResult.conflicts`.
- The file list is then dropped: both apply paths turn the result into an error sentence
  (`updateApplyTemplate.ts:104`, `:134`). `CategoryResult` has no field for it
  (`updateApplyResult.ts:13-33`), so `apply_updates` returns only the sentence.
- Every EDS project has a persistent local clone at the eds-storefront instance's `path`
  (`<project>/components/eds-storefront`, cloned at creation, `executor.ts:279`). AGENTS.md
  tells agents to edit there (`agentsMdStorefrontSections.ts:37`). Nothing pulls it after
  an update commits through GitHub; only Sync Storefront does
  (`storefrontSyncService.ts:201,233`). Measured: JustRite's copy is 11+ commits behind its
  GitHub main, with an uncommitted `config.json`.
- That clone can push with the SC's GitHub token (`storefrontSyncService.ts:13,159`).
- Sync Storefront already leaves a clash in the real files and waits for markers to go
  (`syncStorefront.ts:269-294`, marker check `:550-572`), but it waits only 5 minutes
  (`TIMEOUTS.VERY_LONG`) and asks the SC to "Accept Current / Incoming / Both".
- The chat launch is engine-neutral: `demoBuilder.openInClaude` with `{ prompt, fresh }`
  routes to Copilot (`workbench.action.chat.open`, `openInClaude.ts:240-241`) or Claude
  Code (a terminal at the projects root) from `demoBuilder.ai.engine`. VS Code is opened at
  the projects root (`extension.ts:558-566`), so project files are inside the workspace for
  both engines. `workbench.action.chat.open` also takes `attachFiles` (VS Code
  `chatActions.ts`, `IChatViewOpenOptions`); we do not pass it yet.
- The patch canary runs the same update in CI with no local clone (`canary/`,
  `src/features/updates/README.md`). The throwaway-clone apply must keep working there.

## Decisions

| # | Decision | Who | Status |
|---|---|---|---|
| D1 | Fix with AI is the only way to fix a clash; it opens the chosen engine and names none | owner, 2026-10-20 | approved |
| D2 | No "fix it myself" (no SC reads code) | owner, 2026-10-20 | approved |
| D3 | Other ways out: "Leave it as it is", and "Reset to template" on the colleague's row | owner, 2026-10-20 | approved |
| D4 | The clash is kept in the local storefront copy, not a separate folder: one copy of the code, the one AGENTS.md already points agents at | owner, 2026-10-20 | approved |
| D5 | The update with no clash keeps applying in the throwaway clone (the canary depends on it); only a clash moves to the local copy | plan | proposed |
| D6 | A kept clash is recorded on the storefront (`pendingClash`) so it survives a reload and the next check offers "Finish"; it is dropped if the update it belongs to moves on | plan | proposed |
| D7 | The AI is told to fix only the named files and never to commit or push; the builder does the GitHub work, after checking no markers are left and nothing else changed | plan | proposed |
| D8 | Sync Storefront's own clash screen moves to Fix with AI only if EDS-58 keeps the button | plan | proposed |

## Steps

1. `step-01-refresh-local-copy.md`: bring the local copy up to date after every update push.
2. `step-02-keep-the-clash.md`: on a clash, apply the same change in the local copy and record it.
3. `step-03-choices.md`: the three choices in the Updates modal, and the file list for the agent.
4. `step-04-fix-with-ai.md`: open the chosen engine on the clash.
5. `step-05-finish.md`: the next Apply checks, commits, pushes and records the version.
6. `step-06-docs-and-test-plan.md`.

## Open questions (found by the research; each is answered in the step that needs it)

- Why JustRite's local `config.json` is uncommitted, and whether it is ahead of GitHub's
  (step 01 must not throw away a config write).
- What the local copy does when it has commits GitHub lacks (step 01 refuses rather than
  guesses).

## Hit every surface

| Surface | Applies? |
|---|---|
| Eight webview bundles | The Updates modal only (projects list bundle) |
| Creation and regeneration | No: nothing is generated |
| AI-bundle four seams | No: the prompt carries the instructions; AGENTS.md is unchanged |
| Human and agent surface | Both: the modal's choices and `apply_updates` (step 03, 05) |
| Config field in three places | `pendingClash` is project state: type in `src/types`, no JSON registry |
| Mocks of changed contracts | `CategoryResult` and `TemplateSyncResult` mocks in `updateApplyService.testUtils.ts` |
| Docs | `src/features/updates/README.md`, CHANGELOG, release test plan |
