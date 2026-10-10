---
id: PL-69
kind: chore
area: platform
needs: []
value: med
status: built
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
| 4 | eds/services/helix/helixApiKeys.ts:208-218 | same file:169-179 | DELETE apiKey request | DONE 2026-10-09 (sitting 2, `e8a0fb593`) | identical request; helper `deleteKeyOnServer(org, site, id)`; no named suite |
| 5 | eds/services/github/githubHelpers.ts:58-70 | eds/services/github/githubTokenService.ts:218-230 | mapToGitHubUser | DONE 2026-10-09 (sitting 2, `e8a0fb593`) | byte-identical; delete the private copy, use the exported one |
| 6 | eds/services/daLive/daLiveConfigService.ts:203-224 | same file:116-136 | read config, error wrap | DONE 2026-10-09 (sitting 2, `e8a0fb593`) | site and org reads differ only in URL and a word; `readConfigAt(url, label)` |
| 7 | daLiveConfigService.ts:229-249 | same file:141-161 | PUT config via FormData | DONE 2026-10-09 (sitting 2, `e8a0fb593`) | same shape for update; `putConfigAt(url, label, config)` |
| 8 | eds/services/daLive/daLiveBlockLibraryOperations.ts:62-75 | eds/services/daLive/daLiveContentOperations.ts:289-302 | createBlockLibraryFromTemplate signature | GONE | a one-line forwarder; only the parameter list repeated. Retired 2026-10-08 in the EDS-8 cut; callers use `blockLibOps` directly |
| 9 | eds/services/daLive/daLiveApiClient.ts:125-143 | eds/services/daLive/daLiveOrgOperations.ts:263-281 | HTTP status to error | DONE 2026-10-09 (sitting 2, `e8a0fb593`) | `createErrorFromResponse` copied; only the 401 case differs; check every response reaching it passed the 401-throwing wrapper first |
| 10 | eds/services/configService/siteAccessManagerHeadless.ts:313-325 | same file:274-286 | admin mutation failure mapping | DONE 2026-10-09 (sitting 2, `e8a0fb593`) | grant and revoke repeat resolve + "not ok" mapping + confirm; `failedMutation(result, site)`; small gain |
| 11 | components/ui/hooks/useComponentConfig.ts:321-329 | dashboard/ui/configure/hooks/useConfigureFieldValues.ts:146-155 | updateField start | DONE 2026-10-09 (sitting 7) | same edit on both surfaces; now `applyFieldUpdate(configs, field, value, { backendId, touchedFields })` in `components/services/componentConfigWrites.ts` |
| 12 | useComponentConfig.ts:331-343 | useConfigureFieldValues.ts:157-169 | linked PAAS_URL write | DONE 2026-10-09 (sitting 7) | same fragment; the PaaS URL to GraphQL link is inside `applyFieldUpdate` |
| 13 | components/ui/components/ConfigFieldRenderer.tsx:96-109 | same file:76-89 | TextField props block | DONE 2026-10-09 (sitting 7) | text and password differ by `type` and the url `onBlur`; now one `textFieldProps()` builder spread into both |
| 14 | updates/commands/updateExecutor.ts:463-474 | updates/services/updateCore.ts:89-100 | find library, warn, skip | DONE 2026-10-09 (sitting 8) | `findInstalledLibrary(item, ctx)` in updateCore, with its first suite (`updateCore.test.ts`, 3 cases); both apply paths open with it |
| 15 | projects-dashboard/handlers/projectsListOpen.ts:96-106 | same file:72-82 | resolve project preamble | DONE 2026-10-09 (sitting 4, `187c4a089`) | one cluster with 16, 17 and 3 sites in projectsListLifecycle.ts: 7 sites |
| 16 | projectsListOpen.ts:130-140 | same file:72-106 | same | DONE 2026-10-09 (sitting 4, `187c4a089`) | same cluster |
| 17 | projectsListOpen.ts:162-172 | same file:72-106 | same | DONE 2026-10-09 (sitting 4, `187c4a089`) | `withProject(handler)` in projectFromPath.ts; no named suite for either handler file |
| 18 | project-creation/handlers/checkGitHubAppHandler.ts:108-120 | eds/services/github/githubAppService.ts:107-119 | isAppInstalled result type | DONE 2026-10-09 (sitting 9) | now the exported `AppInstalledResult` in githubAppService.ts, imported type-only by the handler's `CheckGitHubAppService` (the module itself stays lazy-loaded); the orphaned `triggerCodeSync` JSDoc sits above its function |
| 19 | prerequisites/services/PrerequisitesManager.ts:177-185 | same file:165-173 | log, cache, return success | DONE 2026-10-09 (sitting 5) | same success tail in both branches; now `recordCheckComplete(...)` |
| 20 | prerequisites/handlers/checkHandler.ts:145-159 | prerequisites/handlers/continueHandler.ts:22-36 | per-node variant status | DONE 2026-10-09 (sitting 5) | same guard and uninstalled answer; now `resolvePerNodeVariantStatus` in perNodeVersionStatus.ts, the installed step a callback |
| 21 | checkHandler.ts:375-385 | continueHandler.ts:122-132 | status payload literal | TWO COPIES | `message`, `canInstall`, `plugins` already diverge |
| 22 | lifecycle/services/projectResetService.ts:200-216 | project-creation/handlers/executorComponentLoading.ts:154-170 | stamp type, install options | DONE 2026-10-09 (sitting 9) | identical tail; now `toComponentDefinitionEntry(definition, type)` in `project-creation/services/componentDefinitionEntry.ts` (own suite), beside the type it builds; not in the orchestrator, whose importers' suites mock it with two functions |
| 23 | eds/services/errorFormatters.ts:474-485 | same file:283-294 | match error by code | DONE 2026-10-09 (EDS-8 errorFormatters cut, `f9980a19c`) | three tables share the lookup; `formatByPatterns(error, table)` |
| 24 | errorFormatters.ts:485-502 | same file:294-311 | match error by regex | DONE 2026-10-09 (EDS-8 errorFormatters cut, `f9980a19c`) | same as 23 |
| 25 | data-installer/handlers/exportHandlers.ts:191-200 | data-installer/handlers/importHandlers.ts:437-447 | access, project, credentials | DONE 2026-10-09 (sitting 11) | the whole gate repeated; now `resolveDatapackWriteAccess(context, write)` in `data-installer/handlers/datapackWriteGate.ts` (own suite), copy verbatim per write; the payload checks stay in each caller |
| 26 | dashboard/handlers/consoleApiHandlers.ts:366-380 | same file:319-333 | validate, project, guards | DONE 2026-10-09 (sitting 8) | `loadProjectAndGuard(context)` opens add and set; list keeps its own opening because its no-org refusal sits between the load and the guards |
| 27 | dashboard/commands/showIntegrations.ts:194-205 | projects-dashboard/commands/showProjectsList.ts:208-219 | createHandlerContext | DONE 2026-10-09 (sitting 3, `dd6b02b7b`) | identical wrapper over `createPanelHandlerContext` |
| 28 | dashboard/commands/showDashboard.ts:383-409 | showProjectsList.ts:197-219 | createHandlerContext | DONE 2026-10-09 (sitting 3, `dd6b02b7b`) | same |
| 29 | dashboard/commands/openAi.ts:137-148 | showProjectsList.ts:208-219 | createHandlerContext | DONE 2026-10-09 (sitting 3, `dd6b02b7b`) | same |
| 30 | dashboard/commands/configure.ts:147-160 | project-creation/commands/createProject.ts:231-244 | getWebviewContent bundle HTML | DONE 2026-10-09 (sitting 3, `dd6b02b7b`) | `StandalonePanelCommand` already does this with a `bundleName` |
| 31 | dashboard/commands/configure.ts:853-873 | showProjectsList.ts:208-219 | createHandlerContext | DONE 2026-10-09 (sitting 3, `dd6b02b7b`) | same as 27 |
| 32 | components/handlers/componentHandlers.ts:143-155 | same file:102-114 | frontend/backend payload check | DONE 2026-10-09 (sitting 8) | `readStackPayload(payload)` in all three selection handlers; validateSelection keeps its own dependencies check after it |
| 33 | authentication/services/types.ts:80-95 | same file:65-80 | identical interface body | DONE 2026-10-09 (sitting 6) | `AdobeConsoleWhereResponse` is now a type alias of `AdobeContext` |
| 34 | authentication/services/adobeWorkspaceCredentials.ts:212-228 | same file:97-113 | resolve org/project/workspace ids | DONE 2026-10-09 (sitting 6) | same lookup in get and create; now private `resolveCachedTarget(purpose)` |
| 35 | authentication/handlers/projectHandlers.ts:266-285 | authentication/handlers/workspaceHandlers.ts:143-162 | auth guard, permission re-check | DONE 2026-10-09 (sitting 6) | same policy, only the noun differs; now `gateConsoleCreate(context, payload, noun)` in consoleCreateGate.ts; the refresh after it differs on purpose and stays |
| 36 | app-builder/services/appManagementInstaller.ts:307-320 | app-builder/services/appManagementUninstaller.ts:147-159 | resolve target, appData, auth | DONE 2026-10-09 (sitting 10) | identical opening; now `prepareAppManagementCall(project, componentId, getAuth, verb)` in appManagementInstaller.ts (own suite), answering the target, appData and auth or the first refusal; the base-URL check stays in each caller (install fails, uninstall skips) |
| 37 | core/utils/progressUnifier/timedProgress.ts:169-179 | same file:66-76 | "Complete" progress payload | DONE 2026-10-09 (sitting 1, `92a661187`) | same determinate payload, detail text differs |
| 38 | progressUnifier/exactProgress.ts:71-86 | progressUnifier/timedProgress.ts:137-152 | determinate progress payload | DONE 2026-10-09 (sitting 1, `92a661187`) | same shape |
| 39 | exactProgress.ts:118-138 | same file:67-152 | percent output parser | DONE 2026-10-09 (sitting 1, `92a661187`) | 37 to 39 take one helper, `determinateProgress(context, percent, detail)` |
| 40 | core/communication/webviewCommunicationManager.ts:341-361 | core/ui/utils/WebviewClient.ts:103-123 | settle pending response | TWO COPIES | the two ends of one wire protocol in two runtimes; a shared module would cross ADR-015 and ADR-017 for ten lines; re-read in sitting 11 and its verdict written into the ledger's `_verdicts` |

## Sittings (worst first; re-run the scan after each, jscpd shifts when code moves)

| Sitting | Pairs | Count after |
|---|---|---|
| 1. Progress unifier | 37, 38, 39 | 37 |
| 2. EDS services (helix, github, daLive, configService, errorFormatters) | 4, 5, 6, 7, 9, 10, 23, 24 | 29 |
| 3. Webview command base (`createHandlerContext` and the bundle-HTML method into `BaseWebviewCommand`, modelled on `StandalonePanelCommand`) | 27, 28, 29, 30, 31 | 24 |
| 4. Projects-dashboard handlers | 15, 16, 17 | 21 |
| 5. Prerequisites | 19, 20 | 19 (landed at 18: sitting 4 had already reached 20) |
| 6. Authentication | 33, 34, 35 | 16 (landed at 15: sitting 5 had already reached 18) |
| 7. UI (field update logic, TextField props) | 11, 12, 13 | 13 (landed at 12: sitting 6 had already reached 15) |
| 8. Small handlers (updates, console API, component payload) | 14, 26, 32 | 10 (landed at 9: sitting 7 had already reached 12) |
| 9. Cross-feature | 18, 22 | 8 (landed at 7: sitting 8 had already reached 9) |
| 10. App Builder | 36 | 7 (landed at 6: sitting 9 had already reached 7) |
| 11. Data installer (after the EDS-8 sitting on those files) | 25 | 6 (landed at 5: sitting 10 had already reached 6) |

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

**Sitting 5 (pairs 19 and 20) DONE 2026-10-09.** Re-scanned first: 20 clones, the three
prerequisites fragments where the table said. Both pairs were real:

- **19** (`PrerequisitesManager.checkPrerequisite`): the per-Node branch and the standard
  branch ended with the same eight lines (duration, debug log, cache the status). Now one
  private `recordCheckComplete(prereq, status, startTime, nodeVersion)`; the per-Node branch
  no longer returns early, it falls through to the same call. The only touch on that file,
  which is on EDS-8's hold list.
- **20** (`detectPerNodeVariantStatus` in checkHandler, `checkContinuePerNodeVariants` in
  continueHandler): the same guard (not per-Node, or no Node versions required, means
  nothing to report) and the same "tool not installed, so missing in every required major"
  answer. Moving only the uninstalled builder, as the table suggested, left a ten-line
  clone (signature, guard, majors lookup), so the whole decision is now one
  `resolvePerNodeVariantStatus(requiredMajors, installed, whenInstalled)` in
  `perNodeVersionStatus.ts`, exported through `shared.ts`. The one step that differs on
  purpose, what to do when the tool IS installed, arrives as a callback: the first pass
  reuses cached per-version results, the continue pass re-checks. The handlers still call
  `hasNodeVersions` and `perNodeVersionMajors` themselves and pass the majors in, because
  every check and continue suite mocks those through the `shared` barrel and a shared module
  calling them directly would bypass the mocks (the suites would then test something else).
  `PerNodeVariantStatus` is now one exported type instead of four hand-written literals.

**21 stays TWO COPIES**, re-read: the ten shared lines of the status payload are field
names, and `message`, `canInstall` and `plugins` already differ in substance (display
message vs status message; computed vs inline rule; hidden on a missing variant vs always
sent). Verdict written into the ledger's `_verdicts`.

Proof: the 69 pre-existing prerequisites suites (738 tests) ran unchanged before and after.
New: `perNodeVersionStatus-resolve.test.ts` (4 cases: the three branches and that the
caller's array is not handed back). Mutation: all three rows re-measured against the
committed file first; PrerequisitesManager (row 82.74, committed 82.89, now 83.77) and
continueHandler (row 90.82, committed 92.91, now 92.68) were stale; checkHandler reproduced
80.59 and now reads 79.93 with the SAME survivors minus the two that moved out with the
code (18 killed mutants moved with them), so the fall is arithmetic and the row was written
with that reason. `perNodeVersionStatus.ts` measured 22 killed, 0 survived on the new
resolver but 65 uncovered elsewhere in the file, because its only mirrored suite is the new
one and `checkPerNodeVersionStatus` is tested by `shared-per-node-status.test.ts`, which
the mirror cannot see: no baseline row (it would pin a 25% floor that is not the truth);
the number lives here. Three mutation-ledger entries deleted as stale (their code moved
into the resolver, and the new suite pins both early returns), two re-anchored.
cloneCeiling 20 -> 18.

**Sitting 6 (pairs 33 to 35) DONE 2026-10-09.** Re-scanned first: 18 clones, the three
authentication fragments where the table said (lines had barely moved). The ensureSDKReady
fold from the adobeConsoleProjectOps sitting was confirmed in place first: one exported
function, zero private copies. All three pairs were real:

- **33** (`types.ts`): `AdobeContext` and `AdobeConsoleWhereResponse` had the same body.
  The where-response is the parsed `aio console where` answer and the context is what the
  resolver builds; same three selections, same shapes. `AdobeConsoleWhereResponse` is now a
  type alias of `AdobeContext`. The header comment that said these entity types live in
  `src/core/ui/types/index.ts` named a file that does not exist; it now names `src/types/webview.ts`.
- **34** (`adobeWorkspaceCredentials.ts`): `getWorkspaceCredential` and
  `createWorkspaceCredential` opened with the same lookup (the three cached ids, then the
  SDK-up check), differing only in the two debug lines. Now one private
  `resolveCachedTarget(purpose)`; the four log lines keep their exact text.
- **35** (`projectHandlers.ts`, `workspaceHandlers.ts`): the create handlers refused the
  same three ways (no auth service, no developer permission with `AUTH_FORBIDDEN`, empty
  name) and only the noun in the copy differed. Now `gateConsoleCreate(context, payload, noun)`
  in `handlers/consoleCreateGate.ts` (own suite, 12 cases, probe argument asserted). Two
  things moved inside each handler's try on purpose: the no-auth-service refusal and the
  name trim, neither of which can throw. The post-create refresh differs on purpose and stays.

Proof: the 109 pre-existing authentication suites (1,512 tests) ran unchanged before and
after; 1,527 with the new cases (12 for the gate, 3 for the credential read). cloneCeiling 18 -> 15.

Found by the re-measure, fixed here: `listCredentialIds` (the read the subscribe shortcut
asks for) had shipped with no test entering it, seven uncovered mutants. It now has three
cases in the s2s suite, and its `?? []` fallback became an `Array.isArray` guard so no
equivalent mutant needed recording. And `handleGetProjects` never asserted the UNKNOWN code
on a generic failure, so a mutant that calls every failure a timeout survived; one
assertion in `projectHandlers-fetch` kills it.

Mutation: all three rows re-measured against the committed file first; all three were
stale, credentials DOWNWARD (row 79.27, committed 75.87, because of the untested read).
Now: projectHandlers 87.66 (openGaps 0), workspaceHandlers 87.65 (same ten survivors as
the committed file minus one moved string; 26 killed mutants moved out with the gate, so
the ratio fell while nothing lost a test), adobeWorkspaceCredentials 78.29 (the six
optional-chain survivors of the duplicated lookup are three; the four `if (!target)` guard
mutants are ledgered as equivalent, the try/catch swallows the destructure throw into the
same undefined), consoleCreateGate 100 (41 killed, 0 survived). Ledger: entry for the
cache reads re-anchored to the helper, the projectHandlers name/description entry deleted
(those mutants are killed in the gate), one entry added.

**Sitting 7 (pairs 11 to 13) DONE 2026-10-09.** Re-scanned first: 15 clones, the three UI
fragments exactly where the table said. All three pairs were real:

- **11, 12** (`updateField` in the wizard's `useComponentConfig` and Configure's
  `useConfigureFieldValues`): the same edit, line for line, apart from one comment: write
  the value where `resolveWriteTargets` says, and when the PaaS Commerce URL changes, fill
  the GraphQL endpoint from it unless the user has already touched that field. Now one pure
  `applyFieldUpdate(configs, field, value, { backendId, touchedFields })` in
  `components/services/componentConfigWrites.ts`, beside `resolveWriteTargets` (seven cases
  in that suite). Each hook's `updateField` is now the touched-set add and one call. The
  touched set the helper reads is the one the hook's callback closed over, as before.
- **13** (`ConfigFieldRenderer`): the text/url and password `TextField` blocks differed only
  by `type` and the url-only `onBlur`. Now one `textFieldProps()` builder spread into both;
  the two differing props stay on the element. `useSelectableDefault` returns only `onFocus`,
  so the spread order cannot collide with either.

Found on the way, fixed here: the two `normalizeUrlField` copies were not a scan pair but
differed in one argument. Configure's inlined exactly what `writeFieldValue(..., backendId)`
does; the wizard's called `writeFieldValue` WITHOUT the backend id, so a URL-typed
backend-owned scope key normalized on blur would have been written to every declaring
component, the copy-per-component shape `resolveWriteTargets` exists to prevent. No scope
key is URL-typed today (the four ACCS keys are `text`; the PaaS ones are in no registry), so
it is unobservable, and both hooks now go through `writeFieldValue` with the backend id.

Proof: the 10 pre-existing suites for the four touched files (205 tests) ran unchanged before
and after; 212 with the seven new cases. cloneCeiling 15 -> 12.

Mutation: all four rows re-measured against the committed file first, in one focused run
(the four files share suites). useComponentConfig (row 88.52, committed 85.65 with 230
mutants against the row's 305, now 84.79) and useConfigureFieldValues (row 94.62, committed
95.16, now 94.55) were stale, and both falls are arithmetic: the same survivors (32 and 6)
before and after, with 13 and 14 killed mutants moved out to the shared helper.
componentConfigWrites stays at 100 with 14 more mutants, all killed. ConfigFieldRenderer
reproduced 86.27 and now reads 84.91 with two NEW survivors, both strings: `width: '100%'`
and `marginBottom: 'size-200'` in the hoisted builder. As JSX attributes Stryker never
mutated them; as object-literal strings it does, and the suite renders the mocked Spectrum
TextField (`tests/__mocks__/@adobe/react-spectrum.tsx`), which drops both props, so a test
there could only assert the mock. Not ledgered as equivalent (a real browser would show the
change); the row carries the reason. The stale useComponentConfig row had also hidden two open
gaps the committed file already carried: the first `if (cancelled) return;` guard and the URL
block's `!result.valid && result.error`, each the twin of a ledgered line whose reason already
covered both sites but accounted for one mutant. Two ledger rows added with those reasons;
open gaps are 0 on every row. Four equivalents ledger entries re-anchored to the lines the
import changes moved.

**Sitting 8 (pairs 14, 26 and 32) DONE 2026-10-09.** Re-scanned first: 12 clones, the three
handler fragments exactly where the table said. All three pairs were real:

- **14** (`updateExecutor.ts`, `updateCore.ts`): both block-library apply paths opened with
  the same lookup, the project's record of the library or a warning and a skip. Now
  `findInstalledLibrary(item, ctx)` in updateCore, beside the resolved apply it serves; the
  UI path still asks it before prompting, so a dropped library never raises a dialog.
  updateCore had no suite of its own; `updateCore.test.ts` now holds the helper's three
  cases and one for the resolved path's skip.
- **26** (`consoleApiHandlers.ts`): add and set opened with the same load-the-project,
  run-the-guards prefix. Now one private `loadProjectAndGuard(context)` that answers the
  project or the refusal to return. The list handler keeps its own opening on purpose: its
  no-org refusal sits between the load and the guards, and folding it would change which
  refusal an org-less project sees.
- **32** (`componentHandlers.ts`): check-compatibility and load-dependencies carried the
  same object-then-string-fields guard. Now one private `readStackPayload(payload)`;
  validate-selection reads its stack through it too and keeps its own dependencies check
  after, with the same 'Invalid payload' refusal.

Proof: the 53 pre-existing suites for the four touched files (747 tests) ran unchanged
before and after; 55 suites and 764 tests with the new ones. cloneCeiling 12 -> 9.

Found by the re-measure, fixed here: the consoleApiHandlers row (89.53) predated the
per-workspace reconcile code of 2026-09-21, and the committed file measured 81.05 with seven
branch survivors and eight uncovered mutants in it. A new suite,
`consoleApiHandlers-persistedPicks` (13 cases), pins each by what reaches
`subscribeRequiredApis` or the saved project: an owner emptied by a set is removed, a code
Adobe refused is dropped from the asking owner only (another workspace's picks survive), the
own-workspace and shared catalog filters, the subscribe's progress pushes, and the reads of
an integration or mesh entry the project does not list. Two of those were planted by hand
first and each failed the new suite.

Mutation: three rows re-measured against the committed file first. consoleApiHandlers 81.05
(stale row 89.53) -> 89.75, openGaps 0 (the debug-log forwarder survives because no suite may
assert log wording); two ledger rows added (the emptied-owner condition,
which the save-time empty filter makes unobservable, and the add handler's
`payload?.componentId`, twin of the ledgered set line). componentHandlers 94.24 (stale row
86.25) -> 94.64; its one ledger entry re-anchored to readStackPayload. updateExecutor 88.94
reproduced -> 88.58 and NOT a gap: the same 25 survivors, 7 killed mutants moved out with the
lookup. updateCore gets no row on purpose (owner note below): 65.08 -> 74.63 measured with
every related suite, nothing surviving in the new helper.

**Sitting 9 (pairs 18 and 22) DONE 2026-10-09.** Re-scanned first: 9 clones, the two
cross-feature fragments exactly where the table said. Both pairs were real:

- **18** (`checkGitHubAppHandler.ts`, `githubAppService.ts`): the handler's
  `CheckGitHubAppService` seam restated `isAppInstalled`'s seven-field return type by
  hand. Now one exported `AppInstalledResult` on the service, imported type-only by the
  handler, so the module it lazy-loads at runtime stays lazy-loaded. The `triggerCodeSync`
  JSDoc that had been stranded above the interface ("@returns True if Helix accepted the
  request") now sits above its function; nothing else in the handler moved.
- **22** (`projectResetService.ts`, `executorComponentLoading.ts`): both loops ended with
  the same entry tail (stamp the definition with the stack's type, skip dependencies, set
  the entry). Now `toComponentDefinitionEntry(definition, type)` in
  `project-creation/services/componentDefinitionEntry.ts`. Placement per ADR-015/022:
  not `core/` (it cannot import a feature's type, and the entry type is
  project-creation's), and not inside `componentInstallationOrchestrator` beside that type,
  because four suites that drive the callers replace that module with a two-function
  factory mock and the helper would be `undefined` under them. Lifecycle already imported
  the type from project-creation, so the direction of the dependency is unchanged.

Proof: the 34 pre-existing suites that reference the four touched files (558 tests) ran
unchanged before and after; 37 suites and 568 tests with the new ones (4 for the helper,
and 6 for the reset in two new suites, `-keptIntegrations` and `-modalProgress`). Those six
first went into `projectResetService-resetWithUI`, which took it past the 750-line limit,
so its mock wall, SUT import and defaults moved to
`projectResetService-resetWithUI.testUtils.ts` per the splitting playbook; the suite's 38
cases are byte-for-byte what they were, only the preamble is now one import.
cloneCeiling 9 -> 7.

Found by the re-measure, fixed here: the projectResetService row (93.51) predated AB-23
slice 7 (reset keeps integrations) and PL-59 (modal progress), and the committed file
measured 86.06 with nine behavioural survivors in that code: a mesh app-builder entry kept
like an integration, a kept folder matched by id rather than its instance path, a kept
integration with no instance record (two shapes), the modal id and branch, and the error
notification a modal reset must not repeat. Six new cases pin each by what reaches `fs.rm`
and the orchestrator, and by the modal's final push.

Mutation: four rows re-measured against the committed file first. githubAppService 70.16
(stale row 74.02: the 2026-09-30 x-error read and inner-400 log landed after it) -> 70.16,
unchanged by this sitting since the export is a type; its ten behavioural survivors are
log-only (a `coverageAnalysis: all` run reproduced the same set, so not an attribution
artefact) and are ledgered, openGaps 0. projectResetService 86.06 -> 91.18 (186 killed, 18
survived, all strings but one): the one left, `findComponentByType`'s dependency branch, is
unreachable from `buildComponentList` and ledgered; 4 killed mutants moved out with the tail.
checkGitHubAppHandler 60.22 reproduced -> 60.22, same survivors; its ledger anchor for the
`triggerCodeSync` catch re-pinned at line 153 (the interface shrank by eight lines, the
import added one). componentDefinitionEntry 100 (5 killed, 0 survived), new row.
executorComponentLoading has no row and gets none (owner note below).

**Sitting 10 (pair 36) DONE 2026-10-09.** Re-scanned first: 7 clones, the App Builder
fragment exactly where the table said. The pair was real:

- **36** (`appManagementInstaller.ts`, `appManagementUninstaller.ts`): install and
  uninstall opened with the same steps in the same order: derive the Commerce target,
  build the appData, get a sign-in, hand back the first refusal, build the client. Only
  the verb in the no-sign-in refusal differed. Now
  `prepareAppManagementCall(project, componentId, getAuth, verb)`, which answers the
  target, appData and auth, or the refusal as an error string. Each caller still builds its
  own client from it in one line, and keeps its own base-URL check, because that one
  differs on purpose: no URL fails the install but skips the uninstall (nothing was
  installed). The helper lives in the installer, which the uninstaller already imported.
  A new module was not possible: it would import `deriveCommerceTarget` from the installer
  while the installer imports the helper back, which is an import cycle. The target is now
  typed as the client's own
  `SetAssociationRequest` (the same two fields), and an orphaned JSDoc for
  `pollInstallation`, which moved to `appManagementInstallPolling.ts` long ago and has its
  own there, is deleted. That keeps the installer at 399 lines, under the 400-line service
  limit `god-file-ratchet` holds.

Proof: the 128 pre-existing suites related to the two touched files (`--findRelatedTests`
on both, plus every suite naming either file, including `spine-chokepoints`) ran
unchanged before and after: 2,058 tests both times. With the new cases: 129 suites, 2,066
tests (5 in the new `appManagementInstaller-prepareCall` suite, which hands in `getAuth` and
asserts it is not asked when the target or appData refuses; 2 in
`appManagementInstaller-edges`; 1 in `appManagementUninstaller`). cloneCeiling 7 -> 6.

Table reconciliation (done while the scan report was open): 20 rows still read EXTRACT,
and the scan measures none of them. For each one, `git log -S` on a line from its
fragment, run on this branch, named the commit that removed it. Pairs 4 to 7, 9 and 10:
`e8a0fb593` (sitting 2). Pairs 15 to 17: `187c4a089` (sitting 4). Pairs 23 and 24:
`f9980a19c` (the EDS-8 errorFormatters cut). Pairs 27 to 31: `dd6b02b7b` (sitting 3).
Pairs 37 to 39: `92a661187` (sitting 1). All are marked DONE with their commit. The six
pairs the scan still measures are 1 to 3 (decided, fixed on another branch), 21 and 40
(TWO COPIES), and 25, now the only EXTRACT row left (sitting 11). Pair 25's import side has
moved to `importHandlers.ts:221-231`. The export side is still at 191-200. No row outside
25 and 36 still measures, so there is nothing for the owner from the reconciliation.

Found by the re-measure, fixed here: the installer row (95.87) predated `followAfterTimeout`
(2026-09-30), and the committed file measured 95.63. No test reached the timed-out call
whose installation was still running when the poll gave up. That case produced one
behavioural survivor (the failed check forced true), two optional-chain survivors and
two uncovered strings. One new case pins it: the exact hand-back, the "following the
installation" progress line, and all 36 poll reads.

Mutation: two rows re-measured against the committed file first. appManagementInstaller
95.63 (stale row 95.87) -> 98.57 (205 killed, 2 survived, 1 uncovered), openGaps 0; the two
survivors are the hands-back constant every suite imports and the install-failed log line.
The helper's mutants count in this row, and the verb the installer passes is pinned by
one new case (the full no-sign-in refusal, and no client built). appManagementUninstaller
95.88 reproduced -> 95.51 and NOT a gap: the same three string survivors and one
uncovered string; 8 killed mutants moved out with the opening, and the `'uninstall'` verb
it passes is pinned by one new case. No equivalents-ledger entries name either file, so
nothing needed re-anchoring.

**Sitting 11 (pair 25) DONE 2026-10-09.** Precondition checked first: the EDS-8 sitting on
these files had landed (`c5464410f`, importHandlers 781 -> 341 lines, exportHandlers 252),
so both are under the 500-line handler limit. Re-scanned: 6 clones, the data-installer
fragment at `exportHandlers.ts:191-200` and `importHandlers.ts:221-231`. The pair was real:

- **25** (`exportHandlers.ts`, `importHandlers.ts`): `prepareExport` and `prepareImport`
  opened the same way after their payload checks: resolve Data Installer access, read the
  open project, resolve its Commerce credentials, and on a credential gap answer the
  per-gap wording with `INVALID_OPERATION` and the `needsAccsCredentials` offer flag. Each
  file also carried its own copy of the four-gap wording table. Only the verb differed
  ("an import cannot authenticate" / "an export cannot authenticate", "nothing to import
  into" / "nothing to export from"). Now `resolveDatapackWriteAccess(context, write)` in
  `data-installer/handlers/datapackWriteGate.ts`, which answers the base URL, token getter,
  project and credentials, or the refusal. The copy is kept verbatim per write, on the
  `consoleCreateGate` model, so a grep for a message still finds it. The payload checks
  stay in each caller because they differ on purpose: an import reads a target scope, an
  export reads selections.

Proof: the 29 pre-existing suites that touch the two files (`--findRelatedTests` on both,
plus every suite naming either) ran unchanged before and after: 610 tests both times. With
the new cases: 30 suites, 625 tests (14 in the new `datapackWriteGate.test.ts`, which
asserts what each collaborator is handed and that a non-ACCS gap never asks whether
provisioning could help; 1 in `exportHandlers.test.ts`). cloneCeiling 6 -> 5.

Found by the re-measure, fixed here: the exportHandlers row (92.37) predated the
2026-09-13 change that logs a failed export as a failure, and the committed file measured
85.61, with two branch survivors and two uncovered mutants on one untested case: a failed
export that names no data type. One new case pins it (a warning when it fails, none when a
success names no type).

Mutation: two rows re-measured against the committed file first; both were stale
downward. exportHandlers 85.61 -> 87.27 (branch/block survivors 2 -> 0, uncovered 5 -> 3,
all log strings). importHandlers 89.17 (stale row 90.45) -> 89.06 and NOT a gap: the same
survivors minus the two credential strings that moved, with 26 killed mutants moved out to
the gate. datapackWriteGate 100 (44 killed, 0 survived), new row. The equivalents-ledger
entries for both files anchor on payload reads that did not move, so none needed
re-anchoring. Three user-facing-errors ledger keys moved with their lines (exportHandlers
82 -> 68 and 114 -> 100, importHandlers 155 -> 133).

Pair 40 had a verdict in this table but none in the ledger's `_verdicts`. It was re-read
here: the same ten lines settle a pending request on both ends of the webview message
channel, one in the extension host and one in the webview bundle. The TWO COPIES verdict
stands and is now written into the ledger.

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

## Where PL-69 ends

It started at **40 clone pairs** (2026-10-08). It ends at **5** on this branch.

| Pair(s) | What it is | Verdict |
|---|---|---|
| 1, 2 | `helixPageContent.ts`: preview and publish of one page | Decided by the owner (publish handles a refused session like preview). Fixed and extracted under EDS-34 on fix/copy-second-integration (`e3dd47a54`). Counted here until that branch merges into this one |
| 3 | `helixBulkPublish.ts`: bulk preview and bulk publish | Same decision and the same commit as 1 and 2 |
| 21 | `checkHandler.ts` and `continueHandler.ts`: the status payload each pass builds | TWO COPIES: `message`, `canInstall` and `plugins` already differ in substance |
| 40 | `webviewCommunicationManager.ts` and `WebviewClient.ts`: settling a pending request | TWO COPIES: the two ends of one wire protocol in two runtimes, kept apart by ADR-015 and ADR-017 |

Each of the five carries its verdict in `scripts/source-duplication.ledger.json`
`_verdicts`. Of the other 35, 34 were extracted and 1 (pair 8) was deleted with its code
in an EDS-8 cut. When fix/copy-second-integration merges here, re-run the scan, keep the
EDS-34 side of `helixPageContent.ts` and `helixBulkPublish.ts`, and lower the pin to 2.
That is the floor: the two pairs that are TWO COPIES.

Every pair has a verdict, so the item is set to `built`. The merge step above is the one
thing left, and it belongs to that merge, not to a sitting.

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
- 2026-10-09  Sitting 5 (prerequisites), pairs 19 and 20 extracted: `recordCheckComplete` in PrerequisitesManager (the one touch on a hold-list file) and `resolvePerNodeVariantStatus` in perNodeVersionStatus.ts with the installed step as a callback; pair 21 re-read and kept as TWO COPIES with its verdict in the ledger. 69 touched suites (738 tests) unchanged and green; full gate green. New: a 4-case suite for the resolver. Three baseline rows re-measured (two were stale; checkHandler's fall is arithmetic, same survivors). cloneCeiling 20 -> 18.
- 2026-10-09  The ghost baseline row for projects-dashboard/handlers/dashboardHandlers.ts (88.56%, measured before EDS-8 made the file a 42-line barrel) is deleted, with the reason in the baseline note.
- 2026-10-09  For the owner (sitting 5): `perNodeVersionStatus.ts` has no baseline row on purpose. Its real suite is `shared-per-node-status.test.ts`, named for the `shared` barrel it was split from, so the mirror rule measures the file with only the new resolver suite (25%, 65 uncovered). Same shape as the dashboardHandlers-* family in sitting 4. If the owner wants the file on the ratchet, the fix is renaming that suite to `perNodeVersionStatus-check.test.ts` (one file, no test edits), which this sitting did not do because it changes a test-family ledger entry.
- 2026-10-09  refactor(prerequisites): one success tail per check, one per-Node variant decision (`8bac13dbe`)
- 2026-10-09  Sitting 6 (authentication), pairs 33 to 35 extracted: `AdobeConsoleWhereResponse` is a type alias of `AdobeContext`; `resolveCachedTarget(purpose)` in adobeWorkspaceCredentials; `gateConsoleCreate(context, payload, noun)` in handlers/consoleCreateGate.ts (own suite, 100% mutation). ensureSDKReady confirmed already one function. 109 pre-existing authentication suites (1,512 tests) unchanged and green. Also fixed on the way: `listCredentialIds` had no test (three cases now), and the generic-error code in handleGetProjects was never asserted (one assertion). Four baseline rows re-measured and written. cloneCeiling 18 -> 15.
- 2026-10-09  For the owner (sitting 6): the focused mutation run on projectHandlers and workspaceHandlers kills a Stryker worker eight times per run (`ChildProcessCrashedError`) and scores two mutants per file as RuntimeError, which the score ignores. Cause, read from the crash text: the suites stage `getProjects` / `getWorkspaces` with `mockRejectedValue`, and a mutant that throws before the handler awaits that promise leaves the rejection unhandled, which kills the worker. Pre-existing (the rows from 2026-09-03 carry the same two), not from this sitting, and the fix is test-side: create the rejected promise in the test, attach a no-op catch, and hand it over with `mockReturnValue`. Not done here because it is a harness change to suites this sitting did not otherwise touch.
- 2026-10-09  refactor(authentication): one create gate, one cached-target lookup, one context type (`27d90656d`)
- 2026-10-09  Sitting 7 (UI), pairs 11 to 13 extracted: `applyFieldUpdate(configs, field, value, { backendId, touchedFields })` in componentConfigWrites.ts now applies the field edit (and the PaaS URL to GraphQL endpoint link) for both the wizard and Configure; ConfigFieldRenderer's text/url and password fields share one `textFieldProps()` builder. Both hooks' blur-normalize now pass the backend id through `writeFieldValue` (the wizard's did not; unobservable today, no scope key is URL-typed). 10 touched suites (205 tests) unchanged and green; 212 with the seven new cases. Four baseline rows re-measured and written. cloneCeiling 15 -> 12.
- 2026-10-09  For the owner (sitting 7): `ConfigFieldRenderer.tsx` has two new string survivors (`width: '100%'`, `marginBottom: 'size-200'`) that nothing in its suite can kill, because the suite renders the mocked Spectrum TextField and the mock drops both props. They are presentational and the ratchet does not count them, but they are also not equivalent mutants, so they sit in the row's note rather than the ledger. If the owner wants them killed, the honest route is a test that renders the real Spectrum TextField for this one component (the `webview-visual-baseline` instrument already proves the real layout), not an assertion on the mock.
- 2026-10-09  refactor(components): one field edit for both config surfaces, one TextField props builder (`850e4e955`)
- 2026-10-09  Sitting 8 (small handlers), pairs 14, 26 and 32 extracted: `findInstalledLibrary(item, ctx)` in updateCore (first suite for that file), `loadProjectAndGuard(context)` for the add and set Console API handlers, `readStackPayload(payload)` for the three component selection handlers. 53 touched suites (747 tests) unchanged and green; 764 with the new cases. Also fixed on the way: the per-workspace Console API reconcile had seven branch decisions and eight mutants no test reached; a new 13-case suite covers them. Three baseline rows re-measured and written. cloneCeiling 12 -> 9.
- 2026-10-09  For the owner (sitting 8): `updateCore.ts` has no baseline row on purpose. Before this sitting it had no suite of its own, so the focus tool fell back to the import graph and measured it with the updateExecutor and updateApplyService suites. The new `updateCore.test.ts` is now its mirror suite, and the tool takes the mirror INSTEAD of the graph, so a re-measure would use only the four helper cases and report the rest of the file (the marker write, the re-install) as uncovered. Measured with every related suite it reads 74.63. Same shape as perNodeVersionStatus in sitting 5. Recommendation: let `focusModule.mjs` add the graph's suites when the mirror finds a suite that does not cover the module's other exports, or accept a lower mirror-only row; either is a change to the instrument, not to this sitting's code.
- 2026-10-09  refactor(handlers): one library lookup, one console API opening, one stack payload reader (`fea4ddb78`)
- 2026-10-09  Sitting 9 (cross-feature), pairs 18 and 22 extracted: `AppInstalledResult` exported from githubAppService.ts and imported type-only by the check-GitHub-App handler's seam (the orphaned triggerCodeSync JSDoc moved to its function); `toComponentDefinitionEntry(definition, type)` in project-creation/services/componentDefinitionEntry.ts (own suite, 100% mutation) now builds the orchestrator entry for both project creation and project reset. Also fixed on the way: the reset's keep-integrations rule and its modal-progress options had nine decisions no test reached (a mesh kept like an integration, a kept folder matched by id not path, a kept integration with no record, the modal id/branch, the repeated error notification); six new cases pin them (projectResetService-keptIntegrations and -modalProgress, sharing the resetWithUI wall through a new .testUtils). 34 touched suites (558 tests) unchanged; 37 suites, 568 tests after. Four baseline rows re-measured and written (two were stale downward). cloneCeiling 9 -> 7.
- 2026-10-09  For the owner (sitting 9): `executorComponentLoading.ts` has no baseline row and gets none. Its suites are `executor-meshComponentLoading` and `executor-appBuilderComponentLoading`, named for `executor.ts` they were split from, so the mirror rule finds nothing and the focus tool would measure it through the import graph with the whole executor family. Same shape as perNodeVersionStatus (sitting 5) and updateCore (sitting 8); the fix is still the instrument's (let the mirror rule accept a `<module>-` prefix inside a hyphenated suite name) or a rename of those two suites, neither of which this sitting did.
- 2026-10-09  For the owner (sitting 9): two rows were stale DOWNWARD before this sitting touched them (githubAppService 74.02 recorded, 70.16 measured; projectResetService 93.51 recorded, 86.06 measured), both because code landed after the row (2026-09-21 and 2026-09-30) without a re-measure. The ratchet only runs on a focus or sample run, so a row can sit above the truth for weeks. Recommendation: have the sweep re-measure any row whose module changed since `recorded` (the mutation-worklist already knows the modules; the date is in git).
- 2026-10-09  refactor(cross-feature): one GitHub App result type, one orchestrator entry builder (`669ed12b5`)
- 2026-10-09  Sitting 10 (App Builder), pair 36 extracted: `prepareAppManagementCall(project, componentId, getAuth, verb)` in appManagementInstaller.ts (own suite, 5 cases) now opens both the install and the uninstall (Commerce target, appData, sign-in, first refusal); each keeps its own base-URL check because no URL fails an install but skips an uninstall. Also fixed on the way: the installer's timed-out-and-still-running hand-back (2026-09-30) was never reached by a test; one case pins it. 128 related suites (2,058 tests) unchanged before and after; 129 suites, 2,066 tests with the new cases. Two baseline rows re-measured and written (the installer's was stale downward). Table reconciled: the 20 rows still marked EXTRACT that no longer measure are marked DONE with the commit that removed each. cloneCeiling 7 -> 6.
- 2026-10-09  For the owner (sitting 10): `appManagementInstaller.ts` is at 399 lines, one under the 400-line service limit that `god-file-ratchet` counts. The next addition will trip it. Recommendation: when it next grows, move `deriveCommerceTarget` and `prepareAppManagementCall` into their own module. That move changes the import line of the pre-existing `appManagementInstaller-edges` suite, which imports `deriveCommerceTarget` from the installer. This sitting's proof needed that suite unchanged, so it did not make the move.
- 2026-10-09  For the owner (sitting 10): a third row was stale downward (the installer, 95.87 recorded, 95.63 measured; the 2026-09-30 timeout follow-up landed after the row). Same cause as sitting 9's two; the recommendation there (have the sweep re-measure a row whose module changed since it was recorded) still stands.
- 2026-10-09  refactor(app-builder): one opening for the App Management install and uninstall (`94369d4cd`)
- 2026-10-09  Sitting 11 (data installer), pair 25 extracted, the last sitting: `resolveDatapackWriteAccess(context, write)` in data-installer/handlers/datapackWriteGate.ts (own suite, 14 cases, 100% mutation) now opens every datapack write (import, validate, reset and both export calls): Data Installer access, the open project, its Commerce credentials, and the per-gap refusal with the ACCS provisioning offer. The two copies of the gap wording became one table, verbatim per write. Also fixed on the way: a failed export that names no data type (logged as a failure since 2026-09-13) was never reached by a test; one case pins it. 29 pre-existing suites (610 tests) unchanged before and after; 30 suites, 625 tests with the new cases. Three baseline rows written (both old rows were stale downward). Pair 40's TWO COPIES verdict, missing from the ledger, written there. cloneCeiling 6 -> 5. Every pair has a verdict; item set to built.
- 2026-10-09  refactor(data-installer): one gate opens every datapack import and export (`123c23bf6`)
- 2026-10-09  feat(mutation): the sweep lists baseline rows older than their module (`27586ea0b`)
- 2026-10-09  chore(sweep): the sweep reports and never starts Stryker (`9ac4fc15f`)
- 2026-10-09  chore(mutation): re-measure the 405 stale baseline rows (`7fb1dcc8e`)
