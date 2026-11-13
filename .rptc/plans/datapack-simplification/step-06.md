# Phase 6 build plan: Clear Demo Data and Clear Commerce Instance

Written 2026-11-13 by a read-only mapping pass (architect agent) from `decisions.md` Phase 6 (Clear)
and Open, overview Phase 6 item 3, the walked J1 (`mockups/flow/j1-windows.tsx`, `TypeSummary.tsx`,
`TreeList.tsx`, `scenarioClear.ts`), `step-05.md` C1-C6 and P5-Q9, `datapack-engine/step-10-wipe.md`,
`erp-order-close/overview.md`, and the code at `c65799909` plus the reset change (`b9c1946b2`).
Where they differ, `decisions.md` wins. Owner, 2026-11-13: built within beta.153 (P5-Q9).

## Found first
- `TreeList` is not in `src/`; only the prototype has it (`mockups/flow/TreeList.tsx:30-69`). Save
  From Store's categories are checkable rows named by path (`storeItems.ts:126`, "Gear / Bags";
  `StoreItemChecklist.tsx`), so the core component needs an optional row control.
- The summary table and spot check exist from step-03 S4: `typeSummary/TypeTable.tsx`,
  `typeSummary/TypeRail.tsx`. The rail has no Removed and Kept tabs (`TypeRail.tsx:5-8`) and one
  "Name" column (`:49-51`).
- The check returns at most three names per type: `WipeNamed` (`types/demoDataWipe.ts:41-45`),
  "never rows" (`:92`). The spot check needs full lists (J1-3b build item).
- The unit is still the store: `WipeStoreChoice` (`demoDataWipe.ts:17-20`), the store picker
  (`ClearDemoDataModal.tsx:35`, `:111`; `StorePickList.tsx`), the check defaults to the project's own
  store (`demoDataHandlers.ts:114-117`), the refusal copy names stores (`:138-151`), the progress
  window is titled by store codes (`useClearDemoData.tsx:34-38`).
- Clear never touches what an install record lists: `planWipe` reads `recordedIds(records)`
  (`wipePlan.ts:294-298`; header `:27-28`). Nothing calls the engine's removal first.
- A working removal for any project exists: `removeProjectSampleData(project, context, report,
  answering)` (`edsResetSampleData.ts:219-274`): settles changes with an answer given up front
  (`GivenSaveAs`, `:148-153`), waits for the job, clears `project.datapack` on the object it was
  handed (`forgetRemovedPack`, `:288-297`). The batch delete uses it for non-open projects
  (`datapackDataRemoval.ts:20`).
- Failed reads are filed as kept reasons: products "Commerce did not say" (`wipeProducts.ts:110`,
  `wipePlan.ts:123`), customers `unknownStore` (`wipeCustomers.ts:51`), companies `unread`
  (`wipeCompanies.ts:111`), catalogs (`wipeCatalogs.ts:160`), sets and attributes
  (`wipeAttributes.ts:216`, `:222`).
- The claims guard refuses a store another local project records as its own
  (`wipeClaims.ts:88-94`, `:118-120`); the picker locks it (`claimedBy`, `demoDataWipe.ts:31`).
- The order rule is built and passed live on 2026-11-11 (`erp-order-close/overview.md:57-66`). The
  "shared table of order states" (decisions, J1-3b build item) was skipped by the owner the same day
  (`erp-order-close/overview.md:46`, "Skip it."): P6-Q1.
- `docs/systems/mcp-server.md` (~line 980) still says "the store picker".
- Nothing opens Commerce Admin from the data-installer map; the house handler is
  `dashboard/handlers/openUrlHandlers.ts:125` over `core/utils/commerceAdmin.ts:70`.

## Map (today -> decided)
- Header button "Clear Demo Data" (`CatalogHeaderActions.tsx:116-119`) -> a "Clear" menu with "Clear
  Demo Data" and "Clear Commerce Instance", like New Project's menu (`ProjectsDashboard.tsx:261-287`).
- Store picker plus a fact list -> no picker. "Clear Luma Demo Data?", the lead names the project's
  websites, the summary is the type table; Review Records, Cancel, "Clear N Items"
  (`j1-windows.tsx:105-143`).
- Three example names a type -> Review Records: types left, records right, Removed and Kept tabs
  (Kept greyed when empty, notice `StatusDot` after the count and on the tab), column headers,
  categories as a `TreeList`.
- Datapack records left alone -> uninstalled first through the engine's removal, after "Save Your
  Changes First?" when it has changes.
- Kept reasons (five) -> none. Failed reads become a problem with Retry. Already-closed orders and
  protected settings are not listed.
- "with their customers" phrases -> each record under its own type. Orders read "23 closed".
- Payment review in the list -> reported by the run's result, with "Open Commerce Admin".
- No instance action -> Clear Commerce Instance: tick websites (`CheckboxRow` and Select All, each
  "Used by" two names then "and N more"), Next, then the summary, the warning and the "I understand"
  box (`j1-windows.tsx:179-238`).
- MCP: `check_demo_data` / `clear_demo_data` by stores (`dataInstallerDescriptors.ts:366-409`) -> by
  the project's websites; add `clear_commerce_instance`.

## Design
- **Scope is websites, always whole.** `ClearScope = { kind: 'project' } | { kind: 'instance';
  websites: string[] }`. Project scope: every website the project uses, from
  `resolveInstallTarget(project)` plus its records' `target.websiteCode` (as `wipeClaims.ts:97-102`
  reads it), mapped onto `WipeStoreChoice` with no `storeCode`, so `wipeScope` is unchanged at the
  edge. `websites.part` is then always empty; its branches are deleted (the Owner Unknown rules in
  `wipeProducts.ts`, `wipeCustomers.ts`).
- **One answer shape, typed in `types/demoDataWipe.ts`** (replaces `WipePreview` for the screen and
  the tools; `WipePlan` stays internal): `ClearCheck { websites: {code,name}[]; rows: TypeRow[];
  records: Record<type, { removed: string[]; kept: string[]; tree?: TreeListNode[] }>; total; token;
  datapack?: { name; changes: 'none'|'asks'|'saves'|'unchecked' }; problem?: string; refused?:
  string; projects?: string[] }`. `rows` uses `TypeRow` (`job/installRows.ts:19-27`). Instance
  choices: `{ code, name, projects: string[] }[]`.
- **Counts and kept.** Removed = this plan's deletes, plus taken-off products and rules, plus what the
  project's install records list (from `installedCounts`, `wipeRecorded.ts`). A catalog's group counts
  under Customer Groups; a company's members under Customers. Kept = what another project's records
  list on these websites, instance kinds another project's records list (`everyRecord`), and anything
  a website not chosen uses; no reasons stored. Already-closed orders (`alreadyClosed`) and protected
  settings (`settingsKept`) are not listed. Payment-review orders (`action: 'note'`) go to the result.
- **The plan is made as if the datapack were already gone.** The check plans with this project's own
  records dropped; the clearing runs the removal, then re-plans and holds to `withinPlan`
  (`wipePlan.ts:366-367`). What the removal took is "gone since"; what it left on purpose
  (`leftInStore`) is still recorded, so the re-plan respects it and the result says it. Planning with
  the record in place would make every Clear fail `WipeChangedError`.
- **Where the removal is called from.** The extension host, inside `clear-demo-data`
  (`demoDataHandlers.ts:183-197`): refuse unless `confirm` and a known token, then
  `removeProjectSampleData(project, context, report, { given })`, then `clearShown`. One handler, one
  progress window, the same path for the button and the agent. A failed save or removal stops before
  any wipe write, says why, offers Retry. No record: the wipe alone. The webview reads the changes
  from `get-datapack-removal-changes` (`removalChanges.ts:248`) and shows core `SaveFirstWindow` over
  `SaveChangesBody`, verb "Clear" ("Clear Without Saving", "Save and Clear").
- **A website another local project uses** (project scope): P6-Q2.
- **Clear Commerce Instance.** Instance scope ignores ownership (reverses step-10 decision 4, lines
  88-92, and "clean instance rejected", lines 53-54). Each local project using a chosen website gets
  `removeProjectSampleData` first, on its own `Project` from `loadOtherProjects`, its changes saved
  (P6-Q4). Then one wipe of the chosen websites, its plan dropping those projects' records and
  respecting records of projects on other websites. `I understand` and `confirm` both required in the
  handler.
- **A failed read** is collected into `problem` (one sentence naming what could not be read), shown
  as the reserved problem line with Retry; Clear waits (P6-Q3).
- **Payment review and unresettable list settings** come back on `WipeOutcome`; the result names
  them with "Open Commerce Admin" through a new `open-commerce-admin` entry on the data-installer map
  calling `openCommerceAdmin`.
- **Reversibility (property 1).** Clear Demo Data's datapack part is undoable: the save keeps the
  SC's changes and the library keeps the pack, so Install puts it back. Hand-added records, website
  settings set back and orders closed are not: Commerce cannot un-close an order and nothing records
  hand-added data. Clear Commerce Instance is the same for every project on the chosen websites;
  their changes are saved first and their packs stay in the library; each project stops naming its
  pack, so the way back is Install per project. The warning says "This can't be undone".
- **Deleted:** `StorePickList.tsx`, the tick helpers in `clearDemoDataWords.ts`, `WipeStoreChoice`
  from the wire types, `claimedBy` from choices, `ClearDemoDataModal`'s store form (it becomes
  `ProjectClearWindow`).

## Slices (test first, gate green, branch commit)
- C1. `TreeList` to `src/core/ui/components/ui/TreeList.tsx` with `treeRows`, an optional
  `renderRow` for a tick, and its stylesheet. Save From Store's categories build the tree from
  `storeItems` paths. Keep: `StoreItemChecklist`, `StorePicksStage`. Add: `treeRows` (a filter keeps
  parents). Visual check: dataInstaller.
- C2 (representative). Engine and check: website scope, `ClearCheck`, full lists, own-type counts,
  kept without reasons, failed reads become `problem`, part-website branches deleted. Window: summary,
  Review Records with Removed and Kept tabs (extend `TypeRail`). Port: `wipePlan`, `wipeScope`,
  `wipeClaims`, `wipeCompanies`, `wipeCatalogs`, `wipeAttributes`, `demoDataHandlers`,
  `ClearDemoDataModal`; delete `StorePickList.test`. Visual check: dataInstaller. Rethink before C3 if
  full lists push the check past its timeout on a large store, or `wipePlan.ts` (368) passes 400.
- C3. Removal first: the save question, the removal call, one run window (port
  `mockups/flow/ClearRunWindow.tsx`), the result with payment review and Open Commerce Admin. Keep:
  `wipeRun`, `wipeRun-instance`, `edsResetSampleData*`, `datapackDataRemoval`. Add: a Clear ends with
  no datapack named; a re-plan after the removal passes `withinPlan`. **Changes what reaches
  Commerce: live cycle with the owner after C3** (install, install again with nothing sent,
  `clear_demo_data`, a second Clear changes nothing). C2 and C3 ship together.
- C4. Clear Commerce Instance: instance scope, choices with projects, removals per project, the two
  windows, the "I understand" box. Add: claims ignored only for instance scope; each project's pack
  forgotten. **Live cycle with the owner**, two projects on one website. Visual check: dataInstaller.
- C5. The header's Clear menu; Command Palette `demoBuilder.clearDemoData` and
  `demoBuilder.clearCommerceInstance` open the current project's Datapacks screen with that window
  open (P6-Q5). Port `CatalogHeaderActions.test`. Visual check: dataInstaller.
- C6. Agent surface: `check_demo_data` takes `websites?: string[]` (omitted: the project; `[]`: the
  choices with projects; a list: instance scope); `clear_demo_data` takes `token`, `changes`,
  `saveAs`; new `clear_commerce_instance` takes `websites`, `token`, `understood: true`, confirm row.
  Port `dataInstallerDescriptors.test` and the count pins; `mcp-server.md` (and its "store picker"
  line); rerun `ai-coverage-scan`.
- C7. J1-3d leftovers: `.modal-title` `vertical-align: top` (core `modal.css`, all nine bundles:
  visual baseline on all nine); `WorkRow` warning note orange; the progress window's problem line
  takes the progress line's room.

## Product questions (P6-Q1 to P6-Q7, each with a recommendation)
- P6-Q1 Shared order-state table: decisions.md says build it; the owner skipped it 2026-11-11.
  Recommend: skipped stands; update decisions.md.
- P6-Q2 Clear Demo Data when another local project uses the same website: refuse, naming that
  project, and point to Clear Commerce Instance (its hand-added data cannot be told from this demo's;
  the 2026-10-28 incident behind `claimedBy`).
- P6-Q3 A failed read: the problem line with Retry, and Clear waits.
- P6-Q4 Other projects' unsaved datapack changes in Clear Commerce Instance: saved without a
  question, into the SC's own pack, else as "My X" (`freeName`).
- P6-Q5 The Command Palette entries open the Datapacks screen with the window open; refused without
  an open project with a Commerce backend.
- P6-Q6 Returns and settings lines: own types, "Returns: N closed", "Settings: N reset".
- P6-Q7 A website no local project uses, in Clear Commerce Instance: listed with no "Used by" line.

## Risks
- Cloud operations (property 5): both Clears stay behind a red button, a token and `confirm`; the
  instance one also behind "I understand" in the handler. C3 and C4 write to real stores: live cycle
  with the owner, through the MCP tools.
- Removal plus wipe in one run: a stopped run leaves the pack removed and the wipe unfinished;
  `rememberWipeUnfinished` and a second Clear pick it up. Test that order.
- Existing projects: no stored field changes. Old `wipeUnfinished` notes keyed "website/store" no
  longer match the website key and are ignored once.
- Other projects' manifests are written by C4 (`createNonSwitchingStateManager`, proven by batch
  delete).
- Check size: full record lists on a 2,000-product store; measure the check's timeout in C2.
- Mocks: hand-written `DemoDataCheck` answers keep the old shape; type the new one in
  `tests/helpers/webviewFixtures.ts`.
- SOP pins: modal-layouts, progress-surface ledger, ui-label-case, stable-hook-arguments,
  cited-identifiers, god-file ratchet (`wipePlan.ts` 368, `wipeRun.ts` 398 near the 400 cap).
- CSS reach: `TreeList`'s stylesheet must reach the dataInstaller entry; C7's `.modal-title` touches
  all nine bundles.

## Status (2026-11-13)

Built: C1 fc5edf517, C2a f28dc929a, C2b 07861c7d6, C3 07950f078, C4 55b4065f5, C5 335cb189e, C6 62ef1ad06, C7 4cdce1289; the shared order-state table ac4a6923a (ERP half f64bd32 on commerce-erp-integration fix/shared-order-cases, unpushed). Owner answers P6-Q1 to Q4 recorded in decisions.md. Live cycles owed: Clear Demo Data (install, reinstall with nothing sent, Clear, a second Clear changes nothing; stores where another demo's and the SC's own product carry a pack attribute); Clear Commerce Instance (two projects on one website, a pack also on a second website, an older pack's records).
