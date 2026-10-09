---
id: PL-69
kind: chore
area: platform
needs: []
value: med
status: active
---

# Every clone pair gets a verdict, and the 34 that are the same job get extracted

Filed 2026-10-08 during the EDS-8 loop, after the owner asked whether the 40 copy-paste
pairs the duplication ratchet pins were "accounted for somehow". They were not: the ledger
(`scripts/source-duplication.ledger.json`) carries one blanket sentence from September,
"adjudicated variants and two-instance pairs below the Rule of Three", and no pair carries
its own verdict. 15 of its 33 file pairs are a block repeated inside ONE file, which is the
easiest kind to extract and the hardest to call a variant.

## The read (2026-10-08, a Sonnet agent reading every fragment; verdicts are LEADS until a sitting re-reads them)

The scan the ledger names found 40 pairs, matching the pin. Verdicts: **34 EXTRACT, 5 TWO
COPIES (leave), 1 VARIANT.** The 7 "inert JSON pairs" the ledger mentions are already
excluded by the scan's ignore flag and are not among the 40.

| # | File A:lines | File B:lines | Fragment | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | eds/services/helix/helixPageContent.ts:140-151 | same file:94-105 | publishPage/previewPage setup | TWO COPIES | preview treats a 403 as an expired session and re-prompts; publish throws "Access denied". See the finding below. |
| 2 | helixPageContent.ts:153-168 | same file:107-122 | POST, 401 and 403 handling | TWO COPIES | same pair as 1 |
| 3 | eds/services/helix/helixBulkPublish.ts:215-242 | same file:101-128 | bulk preview/publish POST | TWO COPIES | same 403 split, bulk version |
| 4 | eds/services/helix/helixApiKeys.ts:208-218 | same file:169-179 | DELETE apiKey request | EXTRACT | identical request; helper `deleteKeyOnServer(org, site, id)`; no named suite |
| 5 | eds/services/github/githubHelpers.ts:58-70 | eds/services/github/githubTokenService.ts:218-230 | mapToGitHubUser | EXTRACT | byte-identical; delete the private copy, use the exported one |
| 6 | eds/services/daLive/daLiveConfigService.ts:203-224 | same file:116-136 | read config, error wrap | EXTRACT | site and org reads differ only in URL and a word; `readConfigAt(url, label)` |
| 7 | daLiveConfigService.ts:229-249 | same file:141-161 | PUT config via FormData | EXTRACT | same shape for update; `putConfigAt(url, label, config)` |
| 8 | eds/services/daLive/daLiveBlockLibraryOperations.ts:62-75 | eds/services/daLive/daLiveContentOperations.ts:289-302 | createBlockLibraryFromTemplate signature | GONE | a one-line forwarder; only the parameter list repeated. Retired 2026-10-08 in the EDS-8 cut; callers use `blockLibOps` directly |
| 9 | eds/services/daLive/daLiveApiClient.ts:125-143 | eds/services/daLive/daLiveOrgOperations.ts:263-281 | HTTP status to error | EXTRACT | `createErrorFromResponse` copied; only the 401 case differs; check every response reaching it passed the 401-throwing wrapper first |
| 10 | eds/services/configService/siteAccessManagerHeadless.ts:313-325 | same file:274-286 | admin mutation failure mapping | EXTRACT | grant and revoke repeat resolve + "not ok" mapping + confirm; `failedMutation(result, site)`; small gain |
| 11 | components/ui/hooks/useComponentConfig.ts:321-329 | dashboard/ui/configure/hooks/useConfigureFieldValues.ts:146-155 | updateField start | EXTRACT | the second file's header says it is a moved copy |
| 12 | useComponentConfig.ts:331-343 | useConfigureFieldValues.ts:157-169 | linked PAAS_URL write | EXTRACT | same fragment; pure `applyFieldUpdate(...)` beside `resolveWriteTargets` in `components/services/componentConfigWrites.ts` |
| 13 | components/ui/components/ConfigFieldRenderer.tsx:96-109 | same file:76-89 | TextField props block | EXTRACT | text and password differ by `type` and the url `onBlur`; hoist shared props |
| 14 | updates/commands/updateExecutor.ts:463-474 | updates/services/updateCore.ts:89-100 | find library, warn, skip | EXTRACT | `findInstalledLibrary(item, ctx)` in updateCore; updateCore has no named suite |
| 15 | projects-dashboard/handlers/projectsListOpen.ts:96-106 | same file:72-82 | resolve project preamble | EXTRACT | one cluster with 16, 17 and 3 sites in projectsListLifecycle.ts: 7 sites |
| 16 | projectsListOpen.ts:130-140 | same file:72-106 | same | EXTRACT | same cluster |
| 17 | projectsListOpen.ts:162-172 | same file:72-106 | same | EXTRACT | `withProject(handler)` in projectFromPath.ts; no named suite for either handler file |
| 18 | project-creation/handlers/checkGitHubAppHandler.ts:108-120 | eds/services/github/githubAppService.ts:107-119 | isAppInstalled result type | EXTRACT | the interface restates the return type by hand; export `AppInstalledResult`, import type-only. Also an orphaned JSDoc ("@returns True if Helix accepted the request") sits above `CheckGitHubAppService` |
| 19 | prerequisites/services/PrerequisitesManager.ts:177-185 | same file:165-173 | log, cache, return success | EXTRACT | same success tail in both branches; `recordComplete(...)` |
| 20 | prerequisites/handlers/checkHandler.ts:145-159 | prerequisites/handlers/continueHandler.ts:22-36 | per-node variant status | EXTRACT | same signature and guard; continue inlines what `buildUninstalledPerNodeStatus` does; move the type and builder to perNodeVersionStatus.ts |
| 21 | checkHandler.ts:375-385 | continueHandler.ts:122-132 | status payload literal | TWO COPIES | `message`, `canInstall`, `plugins` already diverge |
| 22 | lifecycle/services/projectResetService.ts:200-216 | project-creation/handlers/executorComponentLoading.ts:154-170 | stamp type, install options | EXTRACT | identical tail; reset must match creation; `toComponentDefinitionEntry(def, comp)`; executorComponentLoading has no named suite |
| 23 | eds/services/errorFormatters.ts:474-485 | same file:283-294 | match error by code | EXTRACT | three tables share the lookup; `formatByPatterns(error, table)` |
| 24 | errorFormatters.ts:485-502 | same file:294-311 | match error by regex | EXTRACT | same as 23 |
| 25 | data-installer/handlers/exportHandlers.ts:191-200 | data-installer/handlers/importHandlers.ts:437-447 | access, project, credentials | EXTRACT | the whole gate repeats; `resolveWriteGate(context, verb)`; after the EDS-8 data-installer sitting lands |
| 26 | dashboard/handlers/consoleApiHandlers.ts:366-380 | same file:319-333 | validate, project, guards | EXTRACT | three handlers share the prefix (line 90 too); `loadProjectAndGuard(context)` |
| 27 | dashboard/commands/showIntegrations.ts:194-205 | projects-dashboard/commands/showProjectsList.ts:208-219 | createHandlerContext | EXTRACT | identical wrapper over `createPanelHandlerContext` |
| 28 | dashboard/commands/showDashboard.ts:383-409 | showProjectsList.ts:197-219 | createHandlerContext | EXTRACT | same |
| 29 | dashboard/commands/openAi.ts:137-148 | showProjectsList.ts:208-219 | createHandlerContext | EXTRACT | same |
| 30 | dashboard/commands/configure.ts:147-160 | project-creation/commands/createProject.ts:231-244 | getWebviewContent bundle HTML | EXTRACT | `StandalonePanelCommand` already does this with a `bundleName` |
| 31 | dashboard/commands/configure.ts:853-873 | showProjectsList.ts:208-219 | createHandlerContext | EXTRACT | same as 27 |
| 32 | components/handlers/componentHandlers.ts:143-155 | same file:102-114 | frontend/backend payload check | EXTRACT | identical guard in two handlers; `readStackPayload(payload)` |
| 33 | authentication/services/types.ts:80-95 | same file:65-80 | identical interface body | EXTRACT | `AdobeContext` and `AdobeConsoleWhereResponse` have identical bodies; alias one |
| 34 | authentication/services/adobeWorkspaceCredentials.ts:212-228 | same file:97-113 | resolve org/project/workspace ids | EXTRACT | same lookup in get and create; private `resolveWorkspaceIds()` |
| 35 | authentication/handlers/projectHandlers.ts:266-285 | authentication/handlers/workspaceHandlers.ts:143-162 | auth guard, permission re-check | EXTRACT | same policy, only the noun differs; `checkCreatePermission(context, noun)`; the refresh after it differs on purpose and stays |
| 36 | app-builder/services/appManagementInstaller.ts:307-320 | app-builder/services/appManagementUninstaller.ts:147-159 | resolve target, appData, auth | EXTRACT | identical tail; `prepareAppManagementCall(...)` returning inputs or an error string |
| 37 | core/utils/progressUnifier/timedProgress.ts:169-179 | same file:66-76 | "Complete" progress payload | EXTRACT | same determinate payload, detail text differs |
| 38 | progressUnifier/exactProgress.ts:71-86 | progressUnifier/timedProgress.ts:137-152 | determinate progress payload | EXTRACT | same shape |
| 39 | exactProgress.ts:118-138 | same file:67-152 | percent output parser | EXTRACT | 37 to 39 take one helper, `determinateProgress(context, percent, detail)` |
| 40 | core/communication/webviewCommunicationManager.ts:341-361 | core/ui/utils/WebviewClient.ts:103-123 | settle pending response | TWO COPIES | the two ends of one wire protocol in two runtimes; a shared module would cross ADR-015 and ADR-017 for ten lines |

## Sittings (worst first; re-run the scan after each, jscpd shifts when code moves)

| Sitting | Pairs | Count after |
|---|---|---|
| 1. Progress unifier | 37, 38, 39 | 37 |
| 2. EDS services (helix, github, daLive, configService, errorFormatters) | 4, 5, 6, 7, 9, 10, 23, 24 | 29 |
| 3. Webview command base (`createHandlerContext` and the bundle-HTML method into `BaseWebviewCommand`, modelled on `StandalonePanelCommand`) | 27, 28, 29, 30, 31 | 24 |
| 4. Projects-dashboard handlers | 15, 16, 17 | 21 |
| 5. Prerequisites | 19, 20 | 19 |
| 6. Authentication | 33, 34, 35 | 16 |
| 7. UI (field update logic, TextField props) | 11, 12, 13 | 13 |
| 8. Small handlers (updates, console API, component payload) | 14, 26, 32 | 10 |
| 9. Cross-feature | 18, 22 | 8 |
| 10. App Builder | 36 | 7 |
| 11. Data installer (after the EDS-8 sitting on those files) | 25 | 6 |

The floor of 6 is the 5 TWO COPIES plus the 1 VARIANT, each with its reason above. Each
sitting: re-read the pairs it covers (the table is a lead), extract, run the touched
suites unchanged (the behaviour proof), run `npm run validate:source-duplication`, bank
the drop (cloneCeiling, filePairs, a `_recorded` line), and write the per-pair verdicts
for the pairs that REMAIN into the ledger so the next reader does not redo this read.

## Below the scan's threshold, found by reading (2026-10-08)

The same five-line `ensureSDKReady` method is copied into four authentication files:
`adobeEntityReads` (now its shared helper), `adobeOrgServices`, `adobeWorkspaceCredentials`
and `adobeConsoleProjectOps`. Five lines is under jscpd's eight-line floor, so the pin never
counted it. Four copies is past the Rule of Three: one shared function, taken in the
authentication sitting (6) with pairs 33 to 35.

DONE 2026-10-09 in the EDS-8 adobeConsoleProjectOps sitting: all four read and confirmed
identical; `ensureSDKReady(sdkClient)` is now one exported function in `adobeEntityReads.ts`,
and the `SdkEntityFetch` method, the three private copies and the three reads' calls all use
it. Pairs 33 to 35 are not touched by that split and stay with sitting 6.

## Finding for the owner

**Publish and preview handle an expired session differently (pairs 1 to 3).** `previewPage`
and bulk preview call `throwCredentialRefused`, which tells the user the session may have
expired and triggers a re-login. `publishPage` and bulk publish throw a plain "Access
denied". The doc on `throwCredentialRefused` (`helixAdminErrors.ts`) exempts only
DELETE /live, so publish reads as an oversight, and nothing says otherwise. **Decide:** make
publish match preview (recommended; it also turns pairs 1 to 3 into EXTRACT, floor 3), or
record why publish must not re-prompt.

## Shipped so far

- 2026-10-08  The read: 40 pairs, 34 EXTRACT / 5 TWO COPIES / 1 VARIANT, recorded here.
- 2026-10-08  Pair 8 gone (uncommitted on refactor/eds-8-god-files): the EDS-8 cut of daLiveContentOperations retired the forwarder; cloneCeiling 40 -> 39.
- 2026-10-09  Sitting 1 (progress unifier), pairs 37 to 39 extracted: all three re-read and confirmed one job, the determinate progress update. New `determinateProgress(context, percent, detail, confidence)` in `core/utils/progressUnifier/progressPayload.ts` (own suite) replaces four hand-built copies in timedProgress and exactProgress; the fnm parser now passes percent lines to the generic parser instead of repeating it. The 12 progressUnifier suites ran unchanged. Left alone on purpose: the configureFnmShell update in timedProgress (it shows the raw `step.name`, not the resolved `context.stepName`) and milestoneProgress (it adds milestone fields); neither is a scan pair. cloneCeiling 39 -> 36.
- 2026-10-09  refactor(progress): share the determinate progress update (`92a661187`)
- 2026-10-09  ensureSDKReady folded to one function (in the EDS-8 adobeConsoleProjectOps split): four identical copies (adobeEntityReads' SdkEntityFetch method, adobeOrgServices, adobeWorkspaceCredentials, adobeConsoleProjectOps) became `ensureSDKReady(sdkClient)` in adobeEntityReads.ts; below jscpd's floor, so the clone pin does not move.
- 2026-10-09  refactor(authentication): Console project ops keep the project; workspace create, delete and Runtime namespace get their own file (`5fada61ff`)
