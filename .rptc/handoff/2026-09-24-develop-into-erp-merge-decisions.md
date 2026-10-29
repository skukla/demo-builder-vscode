# develop → loop/2026-09-24-erp-programme merge decisions (2026-09-24)

Ancestor 0c98b76e9. "ours" = the ERP branch, "develop" = develop.

- Docs counts (CLAUDE.md, handbook, conventions, CONTRIBUTING): ours for now; the pins re-measure after the merge.
- CHANGELOG, agent-alerts, mcp-tools rows: both sides kept. mcp-tools count re-measured by its pin.
- webview-command-handler SKILL: ours (names the stage constant develop's wording lost).
- runtimeNamespace / runtimePackageHandlers / their tests / adobeOrgServices-saved.test: ours — same feature, built further on the branch (entities not just packages; per-integration workspace).
- orgServicesSavedCatalog: ours + develop's three exports (SavedCatalog, readSavedCatalog, saveCatalog) so develop's importers compile.
- operationStages.ts, ComponentOperationModal.tsx (moved on the branch by PL-59), adobeEntityFetcher.ts (layer removed on the branch): deleted; develop's edits were ellipsis removals and a store param the branch's AdobeOrgServices already takes.
- mutation ledger: union of both sides' entries; re-anchored after the merge.
- edsContentSetup, projectResetService, meshDeployment, edsResetUI hunks 2–6, adobeOrgServices: ours — develop stripped trailing ellipses from the base labels; the branch replaced those lines with the progress model (OPERATION_STAGES / report), which has none.
- edsResetUI hunk 1: both — develop's added-demo repository checks + the branch's progress options.
- agentOperationNotifier: ours — the branch's title ("Agent · <label(tool, args)>", owner 2026-09-16/19) postdates develop's agentNotice() (owner 2026-09-12) and its landOutcome makes a hand-back or failure visible; develop's phaseLine/agentNotice therefore unused here (checked below).
- edsResetService, consoleProjectTeardown, projectDeletionService: ours — plain-English step names over develop's ellipsis strip; the branch also replaced unpublishCdnContent with the teardown helper (hunk 1/3).
- appBuilderComponentRunner: ours — undeploy/verify moved out of the runner on the branch; develop's runtimeNamespace refactor of that code is checked against the branch's teardown module below.
- dashboardHandlers-map.test: both tables; total 61 = base 40 + branch 12 + develop 9, confirmed by the run.
- Every other progress/label hunk (buildComponent, destinationHandlers, edsResetConfigStep, syncStorefront, executor*, edsContentHandlers, edsReset*Helper, deployMeshHeadless, componentInstallationOrchestrator, manageSiteAccess, configure, ensureProjectOrgContext, deleteAdobeProjectHandler, checkUpdates, configSyncService, appManagementInstaller): ours — the branch's plain-English/stage-constant pass supersedes develop's ellipsis strip. Where ours had kept an ellipsis (edsPipeline, storefrontRepublishService, executorAppBuilderPhase detail, executorSampleDataPhase detail) it was stripped as develop did.
- projectHandlers, workspaceHandlers, AdobeProjectPicker, useElapsedStage, meshSetupService, projectFinalizationService: develop — the branch had not touched the strings (or kept ellipses), develop's strip is the owner's direction.
- useDashboardActions + ProjectDashboardScreen: neither side's callbacks — the branch removed delete/republish/reset, develop removed export; both removals stand, tests likewise.
- cloudResourceTools: develop's token choice (DA.live session first, IMS second) + the branch's tokenProvider on the result, which its teardown reads.
- appBuilderComponentHandlers: ours (cleanupWarning became runtimeWarning/detachWarning); develop's remedy copy ("Ask the agent to run list_runtime_packages") ported onto runtimeWarning.
- dashboard handler map imports: develop's demoPackageHandlers (its map entries came over), not componentOperationProgress (moved to core on the branch).
- ImportDatapackModal: ours — the branch removed WatchProgress; verified by tsc after the merge.
- webviewRequests imports: both (develop's shared-demo types are used below), one viewMode import.
- IntegrationsGrid, IntegrationsScreen, showIntegrations, index.tsx, projectsListHandlers, webviewPayloads: ours (already carries develop's view-mode work via cherry-pick plus the branch's settings/systems work).
- Tests: each follows its source's decision (ours where the branch's wording/stage constants won; develop where develop's strip was taken).
- tool-auth-declarations: pins set to the merged surface — 129 tools; adobe 42, commerce 2, dalive 21, github 18, none 50.
- dashboardHandlers-map: 60 = base 40 + branch 12 + develop 9 − listRuntimePackages both had.
- webview-architecture-rules exemptions: the branch's lower dynamic-class ceiling (50) kept; the ratchet accepted it.

## Fallout the merged tree's enforcers named, and what was done

- develop's no-trailing-ellipsis rule: 17 branch strings stripped (progress labels and log lines), and the six branch tests that pinned them updated.
- develop's one-notification-spelling rule (agentNotice): the branch's notifier titles and warnings now go through agentNotice(label(tool, args)); its tests respelled.
- the branch's 32-character narration rule: five develop phrases shortened.
- develop's phaseLine (keeps the "(n/m)" counter) replaced the branch's ellipsis regex in the notifier.
- god-file ceilings: 68 / 32, the union of both trees' oversized files.
- conventions 126 (125 enforced), enforcer suites 58; conventions.md and mcp-tools.md regenerated.
- mutation ledger: union, re-anchored by neighbourhood; 2 entries whose code the branch deleted removed; 66 duplicates collapsed.
- progress-surface ledger: 4 moved sites re-keyed; 4 of develop's new dialogs/progress sites given reasons.
- progress-wording ledger: 6 stale lines dropped (the messages no longer break the rule).
- user-facing-errors ledger: 5 moved sites re-keyed; 16 exemptions whose sites no longer violate deleted.
