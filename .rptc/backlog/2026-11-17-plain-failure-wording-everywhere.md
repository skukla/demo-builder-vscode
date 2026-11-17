---
id: PL-102
kind: fix
area: platform
needs: []
value: med
status: backlog
---

# Failure text a person reads, in plain words, everywhere outside the datapack windows

Filed 2026-11-17 from the beta.153 release walk (finding F221, U2.3 step 4). The owner read the
datapack engine's failure text and said it is very hard to read regardless of layout: rows named
like code ("products p2"), Commerce's raw message passed through, API routes, and "Debug Logs",
which sends an SC to a developer tool.

F221 fixed it for the datapack windows and the engine's failures, before the release: a branded
type, `PlainText` (`src/features/data-installer/plainFailure.ts`), that only `plainFailure()` and the
literal-only `plain()` make, typed onto every field a datapack screen draws a failure from, and
`tests/sop/datapack-words.test.ts` failing on API routes, "Debug Logs", raw status codes and kind
keys in the data installer's words. This item is the same job for the rest of the extension, which
F221 deliberately did not touch.

## Where raw text still reaches a person

Measured 2026-11-17 on `fix/release-walk-fixes`, after F221.

**1. The core progress window passes a caught error's message through.** A compiler inventory
(the progress payload's `error` and a result row's `note` branded for one `tsc` run, then
restored) found every feature's failure funnelling through these, untranslated:

- `src/core/vscode/withOperationProgress.ts:95`
- `src/core/vscode/operationProgress.ts:163`
- `src/core/vscode/operationProgress.ts:175`
- `src/core/ui/components/feedback/OperationProgressBody.tsx:185`

**2. The engine's failure on the creation screen.** Project creation shows the datapack install's
reason raw: "Datapack could not be installed", then the record's reason as Commerce gave it:

- `src/features/project-creation/handlers/executorDatapackPhase.ts:98`
- `src/features/project-creation/handlers/executorDatapackPhase.ts:150`
- `src/features/project-creation/handlers/executorEditDatapack.ts:118` (an Edit's removal note)

**3. Handlers that hand a caught `.message` to a webview or an agent.** The 63 sites outside
the data installer still listed in `tests/sop/user-facing-errors.ledger.json` (`rawMessageToUser`,
"predates the rule, not yet triaged"):

- `src/commands` (2): `src/commands/claudeCodeFootprint.ts:163`, `src/commands/diagnosticsChecks.ts:419`
- `src/core` (1): `src/core/communication/webviewCommunicationManager.ts:433`
- `src/features/ai` (10): `src/features/ai/server/agentProjectCleanup.ts:213`, `src/features/ai/server/agentProjectCleanup.ts:256`, `src/features/ai/server/authTools.ts:194`, `src/features/ai/server/cloudResourceTools.ts:177`, `src/features/ai/server/cloudResourceTools.ts:268`, `src/features/ai/server/createProjectTool.ts:420`, `src/features/ai/server/createProjectTool.ts:611`, `src/features/ai/server/deleteProjectTool.ts:150`, `src/features/ai/server/edsResetTool.ts:210`, `src/features/ai/server/mcpToolProbe.ts:106`
- `src/features/app-builder` (1): `src/features/app-builder/services/appDeployment.ts:366`
- `src/features/components` (5): `src/features/components/handlers/componentHandlers.ts:141`, `src/features/components/handlers/componentHandlers.ts:185`, `src/features/components/handlers/componentHandlers.ts:234`, `src/features/components/handlers/componentHandlers.ts:86`, `src/features/components/services/componentManager.ts:105`
- `src/features/dashboard` (4): `src/features/dashboard/commands/configure.ts:392`, `src/features/dashboard/handlers/exportDemoBundleHandler.ts:112`, `src/features/dashboard/handlers/exportDemoBundleHandler.ts:138`, `src/features/dashboard/handlers/projectManagementHandlers.ts:117`
- `src/features/eds` (29): `src/features/eds/handlers/daLive/edsDaLiveAuthHandlers.ts:263`, `src/features/eds/handlers/daLive/edsDaLiveAuthHandlers.ts:92`, `src/features/eds/handlers/daLive/edsDaLiveAuthHandlers.ts:94`, `src/features/eds/handlers/edsGitHubHandlers.ts:104`, `src/features/eds/handlers/edsGitHubHandlers.ts:106`, `src/features/eds/handlers/edsGitHubHandlers.ts:325`, `src/features/eds/handlers/edsGitHubHandlers.ts:327`, `src/features/eds/handlers/importStorefrontZipHandler.ts:119`, `src/features/eds/handlers/importStorefrontZipHandler.ts:215`, `src/features/eds/handlers/storefrontSetup/storefrontSetupHandlers.ts:408`, `src/features/eds/handlers/storefrontSetup/storefrontSetupPhases.ts:476`, `src/features/eds/services/blockCollectionHelpers.ts:357`, `src/features/eds/services/commerceStoreDiscovery.ts:236`, `src/features/eds/services/commerceStoreDiscovery.ts:258`, `src/features/eds/services/configService/configServiceAccess.ts:187`, `src/features/eds/services/configService/configServiceProbe.ts:259`, `src/features/eds/services/configService/configServiceProbe.ts:290`, `src/features/eds/services/configService/configServiceProbe.ts:302`, `src/features/eds/services/configService/configServiceProbe.ts:354`, `src/features/eds/services/daLive/daLiveBlockLibraryOperations.ts:123`, `src/features/eds/services/daLive/daLiveBlockLibraryOperations.ts:297`, `src/features/eds/services/daLive/daLiveSiteCopy.ts:80`, `src/features/eds/services/daLive/daLiveSourceOperations.ts:159`, `src/features/eds/services/daLive/daLiveSourceOperations.ts:292`, `src/features/eds/services/helix/helixPageContent.ts:94`, `src/features/eds/services/pdp/publishKeyRegistrar.ts:153`, `src/features/eds/services/refreshBlockLibraryHeadless.ts:206`, `src/features/eds/services/storefront/storefrontProbe.ts:164`, `src/features/eds/ui/hooks/useRepoCreation.ts:190`
- `src/features/mesh` (5): `src/features/mesh/handlers/checkHandler.ts:379`, `src/features/mesh/handlers/deleteHandler.ts:110`, `src/features/mesh/services/deployMeshHeadless.ts:267`, `src/features/mesh/services/meshDeployment.ts:270`, `src/features/mesh/services/meshVerifier.ts:283`
- `src/features/prerequisites` (1): `src/features/prerequisites/handlers/installHandler.ts:648`
- `src/features/project-creation` (3): `src/features/project-creation/handlers/checkGitHubAppHandler.ts:307`, `src/features/project-creation/handlers/wizardLifecycleHandlers.ts:205`, `src/features/project-creation/ui/components/add-demo/useAddDemoFlow.ts:190`
- `src/features/projects-dashboard` (2): `src/features/projects-dashboard/services/edsExternalCleanup.ts:249`, `src/features/projects-dashboard/services/edsExternalCleanup.ts:346`

**4. Text that sends a person to Debug Logs.** 18 string literals outside the data installer
("See Debug Logs for details", "Details are in Debug Logs"); the user-facing-errors SOP's own
"honest generic" recommends this wording, so that rule needs changing too:

- `src/extension.ts:991`
- `src/extension.ts:997`
- `src/core/shell/ensureNodeVersion.ts:94`
- `src/core/shell/ensureNodeVersion.ts:152`
- `src/core/vscode/operationProgress.ts:175`
- `src/features/eds/commands/cleanupDaLiveSites.ts:301`
- `src/features/eds/services/configService/siteAccessManagerHeadless.ts:175`
- `src/features/eds/services/storefront/missingPages.ts:63`
- `src/features/updates/services/templateSyncMessages.ts:55`
- `src/features/updates/handlers/updatesModalHandlers.ts:76`
- `src/features/updates/services/localStorefrontRefresh.ts:216`
- `src/features/dashboard/handlers/runtimePackageHandlers.ts:40`
- `src/features/dashboard/handlers/runtimeActivationHandlers.ts:48`
- `src/features/ai/server/resetProjectTool.ts:148`
- `src/features/authentication/handlers/renameAdobeProjectHandler.ts:26`
- `src/features/authentication/services/authenticationErrorFormatter.ts:138`
- `src/features/authentication/services/authenticationErrorFormatter.ts:163`
- `src/commands/repairSiteConfiguration.ts:67`

## Recommendation

Do it after the release, area by area, the way F221 did the data installer:

1. Move `PlainText`, `plain()` and `plainFailure()` from `features/data-installer/` to `core/`
   (the Commerce-specific translations stay a data-installer layer on top), so every feature can
   use the one door.
2. Brand the core progress payload's `error` and `ResultBody`'s lines. Let `tsc` list the sites;
   fix each with a domain's own words or `plainFailure`. The raw text goes to Debug Logs and to the
   agent's tool response, never to the screen.
3. Extend the words SOP from the data installer to the whole tree, and change the user-facing-errors
   SOP's honest generic so it no longer sends anyone to Debug Logs.
4. Burn down the ledger in section 3 as part of the same pass.
