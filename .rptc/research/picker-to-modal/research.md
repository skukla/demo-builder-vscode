# Should every VS Code picker become a webview modal?

Owner question, 2026-10-05. "Picker" here means VS Code's own quick input: `showQuickPick`,
`createQuickPick`, `showInputBox`, which open at the top of the window. Native
`showWarningMessage({ modal: true })` confirms (28 files) are a separate surface and are out of
scope except where noted.

## Answer

**No, not all of them.** Move only the pickers that ask a question in the middle of something
started from a webview. Keep the pickers that are command-palette tools. The codebase already
states this rule: `operationPrompt.ts` (PL-59, owner 2026-09-20) asks the question "where the
SC is already looking", and says that "the modal should own the form elements". The rule has
been applied to buttons and text fields, but not yet to choices, so the pickers that ask for
a choice are still left over.

**Five move:** delete cleanup, Save to GitHub, copy settings, and the sync commit message move
into the progress modal. **Site access** (user management) becomes its own window, the one palette
tool that moves (owner-accepted, below). Everything else stays a picker.

## Why not all of them

- **A modal needs a webview that is already open.** Most palette commands (Manage DA.live Sites,
  Manage GitHub Repositories, Site access, Content readers) run with no Demo Builder panel open.
  Opening a webview just to ask one question is the pattern VS Code's own guidelines warn against:
  "Only use webviews when absolutely necessary… Don't repeat existing functionality"
  (code.visualstudio.com/api/ux-guidelines/webviews).
- **Quick pick is better at long filterable lists.** The DA.live sites and GitHub repos cleanups
  are multi-selects over every site or repo in an org (unbounded), with typed filtering and keyboard selection. That is
  the job the quick pick was designed for (code.visualstudio.com/api/ux-guidelines/quick-picks).
- **Agents already have their own route.** Under an agent with no modal hosting, questions go to
  a native VS Code modal (`askAsModal`). A quick pick is the wrong surface there, because it can
  close when the window loses focus (`.rptc/complete/mcp-agent-consent`,
  `2026-08-23-mcp-destructive-ops-native-consent`). Webview modals do not fix that path; the
  native modal already does.

## Why some should move

When a webview starts an operation and the extension then asks with a quick pick, there are two
surfaces for one operation. The bug fixed in `c8e233880` showed this: the progress modal opened
under the delete/reset quick pick before the SC had answered. `useOperationRunner` now waits
for that answer, which treats the symptom. Asking inside the modal removes the cause.

## Inventory (16 call sites across 12 files)

| Site | Opened from | Asks | Verdict |
|---|---|---|---|
| `projectDeletionService.ts:317`, cleanup on delete | Projects list kebab; `delete_project` | multi-select: also delete repo / DA.live site | **Move.** This is the c8e233880 bug class. Needs a checkbox field. |
| `appBuilderComponentPromote.ts:68,80`, Save to GitHub | integration card (webview) | choose owner, then type repo name | **Move.** Needs a choice field. |
| `settingsTransferService.ts:159`, Copy settings from project | Projects list (webview) | choose a project | **Move.** Needs a choice field. |
| `syncStorefront.ts:89`, commit message | dashboard "Sync Storefront"; palette | text | **Move when started from the dashboard** (`askForDetailsDuringOperation` exists today). Keep the input box when started from the palette. |
| `daLiveAuthPrompt.ts:323,346`, DA.live namespace / token | mid-operation | text | **Already done:** asks in the modal first, falls back to an input box. |
| `appBuilderComponentRename.ts:74`, rename integration | fallback when no `name` payload | text | **Already done:** the card renames inline. The input box only runs when no name is sent. |
| `checkUpdates.ts:227`, choose updates | palette | multi-select | **Keep.** Palette tool. |
| `cleanupDaLiveSites.ts:146,351` | palette | namespace, then multi-select of sites | **Keep.** Long filterable list. |
| `manageGitHubRepos.ts:141` | palette | multi-select of repos | **Keep.** Long filterable list. |
| `manageSiteAccess.ts:112,344`, `manageContentReaders.ts:95–147`, user management | palette; "Manage Site Access" buttons on two error toasts | roster: list, add by email, remove | **Replace with a Site access window** (owner-accepted 2026-10-05). It is an exception to the rule above; see "User management" below. |
| `showPromptsPicker.ts` (`showWebviewQuickPick`) | palette / status bar | choose a prompt | **Keep.** It is a launcher. |
| `configure.ts:42,96`, "Legacy" configure menu | `viewStatus` only | menu, then port | **Delete** (see findings). It duplicates the Configure webview. |

## User management (follow-up, same day)

"Manage Site Access" (`manageSiteAccess.ts` + `manageContentReaders.ts`, 679 lines) lists who
can **administer** the storefront (Configuration Service admins) and who can **read** its
DA.live content. It is the one palette tool that should move. It is not a question asked in the
middle of an operation; it is a **roster**, and a quick pick handles a roster badly:

- **One action per run.** Pick a row, the picker closes, and the change runs. You cannot see
  the result, or make a second change, without running the command again.
- **Rows that can't be clicked, used as display.** The two systems' lists and the "you can't
  manage this" state are drawn as quick-pick items (`action: 'noop'`). That is a list view
  standing in for a screen.
- **No button anywhere.** The header says "neither had a button before" (EDS-22). Today it is
  still reachable only from the palette and from two error toasts (`byomOverlay.ts:266`,
  `repairSiteConfiguration.ts:154`). The dashboard has no way in.
- **It is project data.** The roster belongs to the current project's storefront, so it sits
  naturally beside the project's other settings, unlike the cleanup tools, which act on a whole org.
- **Small list.** A handful of people, so the quick pick's filtering adds nothing.

The work behind it is already separated from the UI: `siteAccessManagerHeadless` and
`contentAccessManagerHeadless` do the reading, writing and verify-after-write, and the MCP
tools (`get_site_access`, `set_site_admin`, `set_content_reader`, `siteTools.ts`) call them
directly. A dialog would be a new screen over code that already exists. Two cautions:

- **Keep the human and agent paths on one route.** The MCP tools call the services directly
  today. New webview handlers should become the route both use (Pattern B), not a third caller.
- **Keep the no-project case, in the same window.** With no project open, the command asks
  for an org and site today (`manageContentReadersByInput`) so someone can share a storefront
  they did not build. The window asks the same thing at its top instead, so there is one
  interface, not a window plus a picker.

### Decision (owner, 2026-10-05)

Defended both ways in the session. Keeping the picker held only while a dashboard dialog could
not cover the no-project case: that would have left two interfaces for one job. A palette
command can open its own webview, as `showIntegrations`, `showDataInstaller` and `openAi`
already do, so one window covers every case. Accepted trade-off: the window opens in a tab in
about a second, where the picker was instant.

**The shape:**
- **One Site access window**, its own webview opened by `demoBuilder.manageSiteAccess`. It has
  two lists, *Can manage the site* (Configuration Service admins) and *Can read the content*
  (DA.live readers). Each list has an Add box (email) and a Remove per person, and refreshes
  in place after each change. Each change is verified on re-read, and one that does not verify
  says so.
- **No project open:** org and site fields at the top, then the content list.
  **Project open:** filled in from the project.
- **Three ways in:** the Command Palette, a new dashboard button (storefront projects only), and
  the "Manage Site Access" button on the two error notifications (`byomOverlay.ts:266`,
  `repairSiteConfiguration.ts:154`).
- **One route for people and agents.** New handlers over `siteAccessManagerHeadless` /
  `contentAccessManagerHeadless`; `get_site_access`, `set_site_admin` and `set_content_reader`
  dispatch through them.
- **The picker is deleted** (`manageSiteAccess.ts`'s picker UI and `manageContentReaders.ts`'s
  rows), not kept alongside. The refusal states (no role → who can grant it, the Code Sync app,
  GitHub email settings) move into the window.
- **Every surface:** it is a 9th webview bundle, so it needs `WEBVIEW_ENTRIES`, its own stylesheet
  imports (ADR-017) and the visual baseline.

## What it would take

1. **Add choice fields to the modal's question form.** `OperationPromptField` (`src/types/webviewPayloads.ts:360`)
   is text-only today. Add `kind: 'text' | 'choice' | 'checkboxes'` with `options`, render it
   in `OperationPromptForm.tsx`, and widen `PromptAnswer.values` to carry string arrays. This one
   change unlocks the three "Move" rows that need a choice.
2. **Use the same switch at every site:** `modalIsAsking()` ? `askForDetailsDuringOperation` :
   the existing quick pick. The daLive auth prompt already works this way, so it is the model to
   copy. The palette and agent paths stay exactly as they are.
3. **Per site:** delete cleanup, then promote, then copy settings, then the sync commit message.
   Site access is separate work: its own window, and it does not need step 1.
   Each one is behaviour-preserving on the palette path, so its existing tests should stay green
   except for the pins on the modal path.

Estimated size: one small shared change (field kinds plus form rendering), then four call
sites. Low risk, because each site keeps its fallback. The Site access window is the largest
single item: a new webview over existing services, replacing about 679 lines of picker flow.

## Findings along the way (not acted on)

- **Dead sidebar wiring.** `sidebarProvider.ts:91–92` maps `openConfigure` to the legacy
  `demoBuilder.configure` quick pick, and maps `checkUpdates` to `demoBuilder.checkUpdates`, a
  command that is **not registered** (the real one is `demoBuilder.checkForUpdates`,
  `commandManager.ts:255`). Neither button renders: `Sidebar.tsx:77–78` takes them as
  `_onOpenConfigure` / `_onCheckUpdates`. The handlers in `sidebar/ui/index.tsx` and the
  provider map are all dead.
- **Legacy configure quick pick** (`src/commands/configure.ts`, registered as "Legacy - command
  palette", and not in `package.json` contributes). It is reachable only from `viewStatus.ts:120`.
  It duplicates the Configure webview (`demoBuilder.configureProject`). Under the
  no-soft-deprecation rule it should be deleted, and `viewStatus` pointed at the webview.
