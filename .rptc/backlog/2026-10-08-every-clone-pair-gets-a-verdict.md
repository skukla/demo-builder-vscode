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
| 1 | eds/services/helix/helixPageContent.ts:140-151 | same file:94-105 | publishPage/previewPage setup | DECIDED, fixed on another branch | owner 2026-10-09: publish handles a refused session like preview. Fixed and extracted under EDS-34 on fix/copy-second-integration (`e3dd47a54`); still counted here until that branch merges into this one. |
| 2 | helixPageContent.ts:153-168 | same file:107-122 | POST, 401 and 403 handling | DECIDED, fixed on another branch | same pair as 1 |
| 3 | eds/services/helix/helixBulkPublish.ts:215-242 | same file:101-128 | bulk preview/publish POST | DECIDED, fixed on another branch | same decision, bulk version; same EDS-34 commit |
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

**Pairs 23 and 24 DONE 2026-10-09** in the EDS-8 errorFormatters sitting. Re-read: the GitHub
and Helix formatters were the same function apart from the table, both reading `status`; the
DA.live formatter was a third copy reading `statusCode`, and had never had a caller, so it was
deleted rather than folded. One `formatByTable(error, table)` now serves both. Proved by the
four existing suites run unchanged (81 tests) and an old-against-new comparison of 3,808 inputs
(planted control caught). cloneCeiling 36 -> 34. Sitting 2's other pairs (4 to 7, 9, 10) are
untouched by this cut.

**Sitting 2's other pairs (4 to 7, 9, 10) DONE 2026-10-09.** Re-scanned first: line numbers
had barely moved. Each pair re-read on both sides and confirmed the same job:

- **4** (Helix key DELETE): `deleteAdminApiKey` and the superseded-key cleanup (`deleteOldApiKey`) sent the same
  request and differed only in their log lines and what they return. Now one private
  `deleteKeyOnServer(org, site, keyId)` in `helixApiKeys.ts`.
- **5** (GitHub user mapper): byte-identical. The private copy in `githubTokenService.ts`
  is deleted; it imports `mapToGitHubUser` from `githubHelpers.ts`.
- **6, 7** (DA.live config read and write): the org and site versions differed only in URL
  and one word of the message. Now private `readConfigAt` and `putConfigAt` in
  `daLiveConfigService.ts`; every thrown message is the same text as before.
- **9** (HTTP status to error): `DaLiveOrgOperations` carried its own copy of the shared
  client's `createErrorFromResponse` without the 401 case. Checked: both callers get their
  response through the class's own `fetchWithRetry`, which throws on 401 first, so the
  shared version's 401 branch is unreachable from there. It now delegates, and its identical
  `getImsToken` copy delegates too. The class had no suite; a new one
  (`daLiveOrgOperations-errors.test.ts`) was written first and passed against the old code.
- **10** (site-admin grant and revoke): same resolve, call, failure mapping and re-read
  check. Now `changeSiteAdmin` in `siteAccessManagerHeadless.ts`; grant passes its
  "did not verify" warning as a callback, so revoke still logs nothing there.

Proof: the 49 touched suites (895 tests) ran unchanged before and after. cloneCeiling
34 -> 28. Mutation rows for the three measured files were re-measured against the
committed file as well as the old row; all three rows were stale and all three files now
score higher than their committed version.

**Sitting 3 (pairs 27 to 31) DONE 2026-10-09.** Re-scanned first: line numbers had not
moved. All five pairs were real, and wider than the table said:

- **27, 28, 29, 31** (`createHandlerContext`): byte-identical in configure, showDashboard,
  openAi, showIntegrations and showProjectsList, and a sixth copy in
  `StandalonePanelCommand` that the scan did not pair. The wizard's version is a variant: it
  passes its shared state by reference and adds its own loggers. It now builds on the shared one.
- **30** (the page HTML): eight copies, not two. They differed only in the bundle name, the
  title, and whether the page gets a `dist/` base URI (the wizard, Configure and the
  Prompt Library do). The wizard's page title is "Adobe Demo Builder" while its tab says create
  or edit, so that stays as a one-line override.

**The home is not `BaseWebviewCommand`.** The sitting named it, but it lives in `core/`,
and core may not import the context factory (it builds feature managers). So there is one new
class, `BundledPanelCommand` in `src/commands/bundledPanelCommand.ts`, between the core
base and the panels; `StandalonePanelCommand` now extends it. A panel names its
`bundleName` and, if needed, `servesLocalMedia`.

Proof: the 79 touched suites ran unchanged (1,063 tests before; 1,058 after, the five fewer
being the factory SOP's per-file rows for files that no longer build a context). Two SOP
enforcers changed with the structure: the base-class detector now follows a chain of
intermediate bases, and the factory rule accepts `super.createHandlerContext(`. New tests:
a suite for the base (6 cases, 100% mutation score), a first suite for
`ShowIntegrationsCommand` (it had none), and one case each that killed a survivor the move
exposed (the Prompt Library's base URI, the wizard's page title). cloneCeiling 28 -> 23.

**Sitting 4 (pairs 15 to 17) DONE 2026-10-09.** Re-scanned first: the three self-pairs in
`projectsListOpen.ts` sat exactly where the table said. All three were real: the same
ten-line opening (resolve the project from the payload, return the failure, unwrap) in
`handleOpenAiForProject`, `handleOpenLiveSite`, `handleOpenDaLive` and `handleOpenAdminPanel`,
and a fifth copy in `handleResetProject` next door. Now one `withProjectFromPath(run)` in
`projectFromPath.ts`: the handler is given the context, the loaded project and its payload.

Left inline on purpose, with the reason on the helper: `handleDeleteProject` and
`handleEditProject` wrap the load in their own try/catch, so a load that throws answers with
that handler's message ("Failed to delete project"); the wrapper would move the load outside
the catch and change the answer. Neither was a scan pair.

Proof: the 39 touched suites (794 tests) ran unchanged before and after. New: a first suite
for `projectFromPath.ts` (6 cases, the resolve and the wrapper, arguments asserted).
cloneCeiling 23 -> 20.

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

## Finding for the owner (decided 2026-10-09)

**Publish and preview handled an expired session differently (pairs 1 to 3).** Preview
treated a refused session as expired and re-prompted; publish threw a plain "Access
denied". **Owner, 2026-10-09: publish handles a refused session like preview.** That was
fixed, and the publish/preview copies extracted, under EDS-34 on the
fix/copy-second-integration branch (`e3dd47a54`), not on this branch. Here the three pairs
still count in the pin (28) and carry a "clears on merge" verdict in
`scripts/source-duplication.ledger.json`. **When that branch merges into this one:**
re-run the scan, resolve any conflict in `helixPageContent.ts` and `helixBulkPublish.ts`
in favour of the EDS-34 version, and lower the pin. That also turns the floor of 6 into 3.

## Shipped so far

- 2026-10-08  The read: 40 pairs, 34 EXTRACT / 5 TWO COPIES / 1 VARIANT, recorded here.
- 2026-10-08  Pair 8 gone (uncommitted on refactor/eds-8-god-files): the EDS-8 cut of daLiveContentOperations retired the forwarder; cloneCeiling 40 -> 39.
- 2026-10-09  Sitting 1 (progress unifier), pairs 37 to 39 extracted: all three re-read and confirmed one job, the determinate progress update. New `determinateProgress(context, percent, detail, confidence)` in `core/utils/progressUnifier/progressPayload.ts` (own suite) replaces four hand-built copies in timedProgress and exactProgress; the fnm parser now passes percent lines to the generic parser instead of repeating it. The 12 progressUnifier suites ran unchanged. Left alone on purpose: the configureFnmShell update in timedProgress (it shows the raw `step.name`, not the resolved `context.stepName`) and milestoneProgress (it adds milestone fields); neither is a scan pair. cloneCeiling 39 -> 36.
- 2026-10-09  refactor(progress): share the determinate progress update (`92a661187`)
- 2026-10-09  ensureSDKReady folded to one function (in the EDS-8 adobeConsoleProjectOps split): four identical copies (adobeEntityReads' SdkEntityFetch method, adobeOrgServices, adobeWorkspaceCredentials, adobeConsoleProjectOps) became `ensureSDKReady(sdkClient)` in adobeEntityReads.ts; below jscpd's floor, so the clone pin does not move.
- 2026-10-09  refactor(authentication): Console project ops keep the project; workspace create, delete and Runtime namespace get their own file (`5fada61ff`)
- 2026-10-09  refactor(eds): error formatters keep the message tables with one matcher; GitHub write rejections get their own file (`f9980a19c`)
- 2026-10-09  Sitting 2 (EDS services), pairs 4 to 7, 9 and 10 extracted: deleteKeyOnServer (helixApiKeys), the shared mapToGitHubUser (githubTokenService), readConfigAt and putConfigAt (daLiveConfigService), DaLiveOrgOperations delegating to DaLiveApiClient, changeSiteAdmin (siteAccessManagerHeadless). 895 touched tests unchanged and green; full gate green. Pairs 1 to 3 recorded as decided and fixed under EDS-34 on fix/copy-second-integration, to clear when that branch merges. New tests: a DaLiveOrgOperations error suite, plus four cases that killed real survivors (the site a grant or revoke reports, the identity explanation never given for a 401, the response body in config failure messages). cloneCeiling 34 -> 28.
- 2026-10-09  refactor(eds): one copy each of the DA.live, Helix, GitHub and site-access requests (`e8a0fb593`)
- 2026-10-09  Sitting 3 (webview command base), pairs 27 to 31 extracted: one `BundledPanelCommand` (src/commands) now owns the page HTML and the handler context for every bundled panel; six copies of the context builder and eight of the page method are gone. Not on `BaseWebviewCommand`: core may not import the context factory. 79 touched suites unchanged and green; full gate green. Mutation: the five panel rows re-measured; the showDashboard row was stale (committed file 93.71%, new 93.87%). cloneCeiling 28 -> 23.
- 2026-10-09  Needs a live check (sitting 3): open each panel once in the Extension Dev Host (Create Project, Edit Project, Project Dashboard, Configure, Prompt Library, Integrations, Projects list, Data Installer, Site access) and confirm it renders and answers its first request. Tests cover the HTML and the context; nothing here ran a real webview.
- 2026-10-09  refactor(commands): one base for every bundled panel's page and handler context (`dd6b02b7b`)
- 2026-10-09  Sitting 4 (projects-dashboard handlers), pairs 15 to 17 extracted: one `withProjectFromPath(run)` in `projectFromPath.ts` now opens the four open handlers (AI chat, live site, DA.live, Admin Panel) and the reset handler; delete and edit keep the inline resolve because their try/catch must cover the load (reason on the helper). 39 touched suites (794 tests) unchanged and green; full gate green. New: a first suite for projectFromPath (6 cases, 100% mutation). Measured projectsListOpen at 95.52% (one survivor, a log string) and projectsListLifecycle at 73.72% (the ledgered debug-log block in edit, log strings, and six uncovered mutants in the two progress-modal id lambdas), but neither gets a baseline row: their suites are the dashboardHandlers-* family named for the barrel they were split from, so the pairing enforcer has no mirrored suite to re-measure them with (the StandalonePanelCommand precedent from sitting 3). cloneCeiling 23 -> 20.
- 2026-10-09  For the owner (sitting 4): `reports/mutation/baseline.json` still carries a row for `projects-dashboard/handlers/dashboardHandlers.ts` at 88.56% (387 killed), measured before the EDS-8 split made that file a 42-line re-export barrel. The row is a ghost: nothing in the file can be mutated to those numbers again. Not deleted here because removing a row is a baseline decision, not a sitting's bookkeeping. Recommendation: delete the row in the next sweep.
- 2026-10-09  Part B (the gap sitting 3 found): the Integrations command (`dashboard/commands/showIntegrations.ts`) had a suite covering only its page HTML and scored 5.26% with 54 mutants no test reached. Its suite (`showIntegrations.test.ts`, now 16 cases in one file rather than a split family) pins its panel names, the init payload it seeds the grid with (from a live project, from a bare one with no Adobe block or stack, and from none), the two handler maps it wires and their order (the add-integration flow first, then the whole dashboard map, so the dashboard's `switchOrg` wins), what each registered listener hands `dispatchHandler`, how it disposes a sibling's panel, and execute(). 98.25% after; the one survivor is the dispose guard inside a swallowing catch, ledgered as equivalent.
- 2026-10-09  refactor(projects-dashboard): one opening for every handler that takes a project path (`187c4a089`)
- 2026-10-09  test(dashboard): the Integrations command's behaviour, not only its page (`8675b5e40`)
