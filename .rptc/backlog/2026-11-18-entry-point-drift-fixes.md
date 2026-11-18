---
id: PL-104
kind: chore
area: platform
needs: []
value: high
status: built
---

# Make the drifted doors of 13 user actions agree

Filed 2026-11-18 from the beta.153 walk (finding F250). The owner asked for one canonical
path per user action, entry points included. A read-only audit
(`.rptc/research/entry-point-drift-audit/research.md`) found 13 actions besides Adobe sign-in
whose doors (the button, the command, the agent tool) disagree about policy.

Each one is now written down as an exemption in `tests/templates/action-doors.ledger.json`
(a `drift` door, or a `bypasses` row, whose `fix` names the number below), checked every
jest run by `tests/templates/action-doors.test.ts`. Fixing one makes its row go stale and
fail, so the fix deletes or re-labels the row in the same change, and lowers
`exemptionCeiling`.

## The fixes, wrong outcome for an SC first

Fixes 1 to 13 are done (2026-11-18); the ledger's `exemptionCeiling` fell from 26 to 2, the two
left being fixes 14 and 15.

Numbers are the ones the ledger's `fix` fields cite. Audit row in brackets.

| # | Fix | Size | Status |
|---|---|---|---|
| 1 | One storefront reset for every door [5]. Move the pre-flight (org check, GitHub App check, `whileRunning('resetting')`) out of `resetEdsProjectWithUI` into a function the agent's `runEdsReset` also calls, with a "cannot ask" adapter that refuses instead of showing a dialog. Decide the block-library and CDN defaults once, in the spine, so no door passes `includeBlockLibrary`/`verifyCdn` | medium | Done (F256) |
| 2 | One GitHub sign-in [2]. `manageGitHubRepos.ts` and `edsExternalCleanup.ts` call `signInToGitHub`, so the stored token always has `GITHUB_SCOPES`, not `['repo','delete_repo']` | small | Done (F259) |
| 3 | One datapack job runner [12]. `runSampleDataJob` (creation, reset) gets the handler path's validation step, or both build the request through `prepareImport` | medium | Done (F264) |
| 4 | The agent's mesh deploy (`handleDeployApiMesh`) takes `meshDeployLock` and fires `meshActionTaken`, like the palette and the screen button [10] | small | Done (F265) |
| 5 | `delete_mesh` (`handleDeleteApiMesh`) takes the lock too and records the mesh as gone on the project [11] | small | Done (F266) |
| 6 | Delete project: the agent calls `runProjectDelete` with a no-prompt adapter; `cleanUpProjectCloud` is deleted [7] | medium | Done (F260) |
| 7 | One DA.live token rule for storefront teardown [4]. Three doors fall back to the Adobe IMS token (`firstUsableDaLiveToken`), the button uses the DA.live session only. Decide one, then fix the false comment in `agentProjectCleanup.ts` | small | Done (F261) |
| 8 | `delete_adobe_project` validates ids and acts on `shouldClearConsoleSelection`; better, the spine clears the selection itself [23] | small | Done (F262, F270) |
| 9 | `open_url` with target `commerceAdmin` goes through `openCommerceAdmin` and leaves the URL out of its answer; `projectsListOpen.ts` calls `openCommerceAdmin` too [15] | small | Done (F267) |
| 10 | The agent's republish runs `recheckCodeStep`; better, `republishStorefrontContent` runs it on success [8] | small | Done (F257) |
| 11 | The Repair command passes `ensureDaLiveSession`; make the field required, with an explicit `null` for callers with nobody to ask [9] | small | Done (F258) |
| 12 | The three hand-rolled restart copies (env watcher, port change, Configure) call `demoBuilder.restartDemo` with the project path [14] | small | Done (F268) |
| 13 | `create_github_repo` goes through `createRepoFromSource`, so a source that is not a template works [17] | small | Done (F263) |
| 14 | One creation run for every door [16] (found F269). The agent's `runProjectCreation` (`createProjectTool.ts:710`) has no overall timeout or abort, where the wizard wraps `executeProjectCreation` in `withTimeout` (30 minutes) with an abort controller (`createHandler.ts:236-243`); and the agent rebuilds the wizard state by hand twice (`createProjectTool.ts:392-411`, `583-620`; EDS-51 was a field this copy dropped). Move the timeout into the shared run, sized past the 30-minute GitHub App wait the agent can pause for, and build both doors' state through one function | medium | Open |
| 15 | One console-API subscription guard [new] (found F269). `add_console_apis` refuses an integration the project does not have (`consoleApiHandlers.ts:364-370`); Manage APIs and `set_console_apis` (both `setConsoleApis`, `:405-406`) do not, so a bad `componentId` saves picks for a phantom integration and subscribes them on the shared workspace. Move the check into `reconcileExtras` | small | Open |

## Also open in the ledger

Read 2026-11-18 (F269); every entry point is now assigned in
`tests/templates/action-doors.entry-points.json`, checked by `action-doors-coverage.test.ts`.

- **The three leads**: `createProjectTool.ts` is real drift, fix 14. `mcp/storefrontSyncHandler.ts`
  and `mcp/blockLibraryPublish.ts` agree with the command (same session tokens, injected at
  `extension.ts:723-728`; the audit's "env vars" was stale), now `same-policy`.
- **Handlers only an agent reaches**: `deploy-api-mesh` and `delete-api-mesh` were debt until
  fixes 4 and 5; both now share the person's lock and record, and are `byDesign`. The other 11 are
  agent-only on purpose (`byDesign` in the ledger, each with its reason);
  `addConsoleApis` shares its spine with `setConsoleApis`, whose missing guard is fix 15.
- **Writes with no action row**: the `write` bucket of the entry-point ledger lists every one. A
  second entry point doing the same job is the signal to give the job a row. Candidates seen while
  assigning, not compared: repair site configuration (handler, command, tool), storefront name
  migration (command, tool), added demos (four handler/tool pairs), and Adobe project create and
  rename (handler, tool).

## Shipped so far

- 2026-11-18  fix(conventions): agent project creation shares the wizard's limit and stop; Manage APIs refuses unknown integrations (PL-104 fixes 14, 15) (`a45e5f6e3`)
- 2026-11-18  fix(conventions): every user action has one path, and every entry point is assigned to one (PL-104) (`b1c60f137`)
- 2026-11-18  feat(conventions): every user action's entry points are listed and checked; Sign In Again is a fresh sign-in (F250, F251) (`cee5790b1`)
