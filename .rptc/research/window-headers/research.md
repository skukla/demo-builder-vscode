# Window headers: audit against the 2026-11-04 convention

The convention (owner, 2026-11-04; handbook, beside the Title Case rule): a window's header names
the kind of thing and what happened to it, generically ("Couldn't Create Datapack", "Projects
Deleted"); the specific thing (a name, a count) goes in the details beneath. A header is a
statement, never the reason, and carries no comma. A button may carry a count.

Audit read the code at `aeb110743`, 2026-11-04. Counts are per header string or template variant,
by hand, so about ±5.

## Counts

| Where headers come from | Total | Conforming | To change |
|---|---|---|---|
| A. Progress windows (webview `title` / `successTitle` / `failureTitle`) | 81 | 32 | 49 |
| B. House `Modal` titles | 112 | 69 | 41 (2 not determinable) |
| C. In-window question titles (`Question.title`) | 17 | 13 | 4 |
| D. VS Code progress notification titles | 60 | 26 | 34 |
| D. Agent narration that names its target (`toolNarration.ts` `NAMED_NARRATION`) | 19 | 0 | 19 |
| E. VS Code modal dialogs whose first line names something (separate, lower priority) | 16 | — | 16 |

About 125 of the changes embed a name, count or version; about 22 break only "statement, Title
Case, no comma".

## Where most of it comes from

A few shared builders take a name, so fixing them clears most of A and the matching notifications:
`titlesFor` in `useComponentOperation.ts`, `titlesOf` in `useGuideRun.ts`, the
`withComponentProgress` template (`appBuilderComponentOperation.ts:243`), and the reset and delete
titles in `useDashboardOperations.ts` and `projects-dashboard/ui/index.tsx`. Model to copy:
`useClearDemoData.tsx` ("Clearing Demo Data", the store in `subject`).

Two structural defects:
- `questionFrame` (`OperationProgressBody.tsx:136`) falls back to `prompt.message` when a question
  has no title, putting a whole sentence in the header. Make `title` required, or drop the fallback.
- "Run in Background" (`OperationProgressModal.tsx:241`) sends `${title}: ${subject}` as the
  notification's title, putting the name back in a header. The subject belongs in its message.

## Decisions needed from the owner

1. **Decided 2026-11-04: the remove confirm's header becomes "Remove Datapack?"**, and the store
   view and website it removes from ("From Justrite Store View (Justrite Website)") is the FIRST
   line of the details. The 2026-10-31 reason (a removal nearly went to the real website) is kept by
   that line coming first; the header follows the rule.
2. **Decided 2026-11-04: agent notifications keep naming their target**, as part of the convention
   (the handbook's exception): nobody pressed anything, so the notification is how the SC sees what
   the agent touches. The 19 `NAMED_NARRATION` forms are not findings.
3. **Decided 2026-11-04: section E is in scope.** VS Code draws a confirmation's first argument
   bold at the top, so it is the header: it becomes the short generic question ("Delete
   Repository?") and the name and consequences move to the dialog's `detail`.

## The findings

The full list, file:line by file:line with a proposed header for each, is the audit agent's report
of 2026-11-04 in the session that wrote this; its tables are reproduced below by section.

### A. Progress windows (to change)

- `data-installer/ui/hooks/useSaveStoreChanges.tsx:92-93`: `Creating/Saving ${name}`, `Couldn't Create/Save ${name}` → "Creating Datapack" / "Saving Datapack", "Couldn't Create Datapack" / "Couldn't Save Datapack"; name in `subject`.
- `dashboard/ui/hooks/useDashboardOperations.ts:54-56, 65-67, 98-100`: reset, delete, republish with the project's name → "Resetting Project" / "Couldn't Reset Project" / "Project Reset"; "Deleting Project" / …; "Republishing Storefront" / "Couldn't Republish Storefront" / "Storefront Republished".
- `projects-dashboard/ui/index.tsx:262-264, 356-358`: delete and reset → as above.
- `dashboard/ui/hooks/useComponentOperation.ts:91, 95-97, 162-164, 191-193, 211-213`: integration card actions, ERP fill, add → "Deploying Integration", "Couldn't Install Integration", "ERP Filled", "Integration Added", "ERP Added", and so on.
- `dashboard/ui/components/integrations/ErpAssignDialogs.tsx:84-86, 98-100` → "Assigning Products" / …; "Undoing Assignment" / ….
- `dashboard/ui/components/integrations/useGuideRun.ts:56, 58, 60` → "Applying Demo Setup" / …; step runs borderline.

### B. Modals (to change)

- Data Installer: `importModalView.ts:270, 275/277, 287/292, 290`; `importResult.ts:122, 175, 180, 195, 199`; `ExportDatapackResult.tsx:61`; `SaveFromStoreModal.tsx:43`; `LoadDatapackFileModal.tsx:169, 178, 188-189`; `packRootStep.ts:50`.
- Dashboard: `ManageApisModal.tsx:88`; `AssignErpProductsModal.tsx:43, 45`; `ErpDowntimeDialog.tsx:56-58`; `IntegrationSettingsModal.tsx:43-44`; `ErpResetDialog.tsx:27-28`; `AppBuilderComponentRemoveDialog.tsx:53`; `ErpAssignDialogs.tsx:27`; `ErpConfirmDialogs.tsx:96`; `FlaggedCardDialogs.tsx:56, 90`; `PrepareOnAddConfirm.tsx:11-12`; `SetupGuideModal.tsx:174`.
- Project creation: `PairedSystemNameDialog.tsx:84`; `addDemoOutcome.ts:73`; `addDemoFlow.ts:98`.
- Projects dashboard: `UpdatesModal.tsx:131` "Some updates didn't apply".

### C. Question titles (to change)

`destinationHandlers.ts:318`; `packRootStep.ts:145`; `updateQuestionsInModal.ts:43, 57`.

### D. Notification titles (to change)

Names: `storeChangesHandlers.ts:310`; `erpAssignHandlers.ts:249, 317`; `erpAddHandler.ts:463`; `erpFillHandler.ts:84`; `erpResetHandlers.ts:180`; `destinationHandlers.ts:100`; `edsContentHandlers.ts:167`; `appBuilderComponentPromote.ts:290`; `appBuilderComponentOperation.ts:243` (template for six callers); `projectDeletionService.ts:100`; `projectResetService.ts:441`; `edsResetUI.ts:367`; `ImportDatapackModal.tsx:278`; `OperationProgressModal.tsx:241`; versions in `extensionUpdater.ts:31`, `demoBuilderNodeSweep.ts:113`.
Style only: `syncStorefront.ts:149`, `stopDemo.ts:139`, `startDemo.ts:264`, `refreshBlockLibrary.ts:51` (sentence case); `erpOwnerSetsHandlers.ts:115, 155`; `thirdPartyToolingSettingListener.ts:105` (a prefix); `BaseCommand.showSuccessMessage` callers (`deployMesh.ts:92`, `syncStorefront.ts:444, 452, 633, 636`, `checkUpdates.ts:76`, `configure.ts:582`, `repairSiteConfiguration.ts:126`, `refreshBlockLibrary.ts:64`) put a sentence in a title.

### E. VS Code confirmation dialogs naming something (separate)

`forgetAddedDemoHandler.ts:173, 186`; `edsResetUI.ts:128, 391`; `edsResetOtherData.ts:159`; `edsResetSampleData.ts:94`; `projectResetService.ts:418`; `destinationHandlers.ts:325`; `appBuilderComponentPromote.ts:136, 331`; `executorEditApply.ts:239`; `deleteAdobeProjectHandler.ts:127`; `deletionConfirmation.ts:40`; `cleanupDaLiveSites.ts:162`; `manageGitHubRepos.ts:252`; `migrateStorefrontNames.ts:137`.

## Before an enforcer

Once the shared builders take no name, a check becomes possible: a header-building call site
(`title`, `successTitle`, `failureTitle`, `Modal title`, `withOperationProgress({ title })`)
whose value is a template literal interpolating a variable fails, unless ledgered with a reason.
The ui-label-case scan already reads every bundle with the compiler and is the natural home.
