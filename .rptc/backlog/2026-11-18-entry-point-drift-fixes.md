---
id: PL-104
kind: chore
area: platform
needs: []
value: high
status: backlog
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

Numbers are the ones the ledger's `fix` fields cite. Audit row in brackets.

| # | Fix | Size |
|---|---|---|
| 1 | One storefront reset for every door [5]. Move the pre-flight (org check, GitHub App check, `whileRunning('resetting')`) out of `resetEdsProjectWithUI` into a function the agent's `runEdsReset` also calls, with a "cannot ask" adapter that refuses instead of showing a dialog. Decide the block-library and CDN defaults once, in the spine, so no door passes `includeBlockLibrary`/`verifyCdn` | medium |
| 2 | One GitHub sign-in [2]. `manageGitHubRepos.ts` and `edsExternalCleanup.ts` call `signInToGitHub`, so the stored token always has `GITHUB_SCOPES`, not `['repo','delete_repo']` | small |
| 3 | One datapack job runner [12]. `runSampleDataJob` (creation, reset) gets the handler path's validation step, or both build the request through `prepareImport` | medium |
| 4 | The agent's mesh deploy (`handleDeployApiMesh`) takes `meshDeployLock` and fires `meshActionTaken`, like the palette and the screen button [10] | small |
| 5 | `delete_mesh` (`handleDeleteApiMesh`) takes the lock too and records the mesh as gone on the project [11] | small |
| 6 | Delete project: the agent calls `runProjectDelete` with a no-prompt adapter; `cleanUpProjectCloud` is deleted [7] | medium |
| 7 | One DA.live token rule for storefront teardown [4]. Three doors fall back to the Adobe IMS token (`firstUsableDaLiveToken`), the button uses the DA.live session only. Decide one, then fix the false comment in `agentProjectCleanup.ts` | small |
| 8 | `delete_adobe_project` validates ids and acts on `shouldClearConsoleSelection`; better, the spine clears the selection itself [23] | small |
| 9 | `open_url` with target `commerceAdmin` goes through `openCommerceAdmin` and leaves the URL out of its answer; `projectsListOpen.ts` calls `openCommerceAdmin` too [15] | small |
| 10 | The agent's republish runs `recheckCodeStep`; better, `republishStorefrontContent` runs it on success [8] | small |
| 11 | The Repair command passes `ensureDaLiveSession`; make the field required, with an explicit `null` for callers with nobody to ask [9] | small |
| 12 | The three hand-rolled restart copies (env watcher, port change, Configure) call `demoBuilder.restartDemo` with the project path [14] | small |
| 13 | `create_github_repo` goes through `createRepoFromSource`, so a source that is not a template works [17] | small |

## Also open in the ledger (not fixes yet)

- **Leads to finish reading**: `createProjectTool.ts` (no `withTimeout`, wizard state rebuilt
  by hand), `mcp/storefrontSyncHandler.ts` (skips the Helix publish with no credentials), and
  `mcp/blockLibraryPublish.ts` (block-library promote and remove reuse the sync; untraced).
- **Handlers only an agent reaches**: 13 descriptor types no webview sends. The audit named
  three (`deploy-api-mesh`, `delete-api-mesh`, `exportProjectSettings`); the check found ten
  more (`setErpSettings`, `setErpAppearance`, `deleteUndeclaredRuntimeCode`,
  `setCommerceConfig`, `writeErpApi`, `invokeRuntimeAction`, `addConsoleApis`,
  `verify-datapack-install`, `build-datapack-from-export`, `mark-team-datapack`). Each needs
  reading: a real second door, or an agent-only capability by design (then its reason says so).
