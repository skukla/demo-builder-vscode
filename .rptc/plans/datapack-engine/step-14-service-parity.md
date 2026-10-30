# Step 14: everything the Data Installer service did that is worth having

Status: **active** (owner, 2026-10-30: "I'd like to do all of these now before 153").

## Why

A comparison of the service (`dsc-data-installer-api`, local clone) with Demo Builder's engine, run
2026-10-30, found 19 gaps worth closing and one defect neither handles. The evidence, with
file:line on both sides, is in `.rptc/research/datapack-engine/service-parity-import-delete.md`
and `service-parity-export-machinery.md`. Read the row there before building an item.

## The work, in five groups that touch different files

Each group is built on its own branch off `loop/2026-10-05-release-candidate`, then merged back.

### G1: an install that survives what goes wrong (`runPack.ts`, `engine.ts`, `installRecord.ts`, every kind's create call)

1. **A create whose answer is lost is still the pack's.** Today a write that times out but lands
   is found on the next run, called "the store already has it", never recorded, and never
   removed (rule 1). Record a pending entry before each create; a re-run adopts a match for a
   pending entry; removal treats an adopted one as the pack's. **Built (G1):** every create site
   (`pendingCreates.ts`) and store settings; looked up by `pendingFinders.ts` at the start of
   every install and removal. `pending` is an optional record field, written only while non-empty.
2. **Every kind's rows are checked before anything is written**, in the install and the dry run
   (`validate_datapack_import`), as the service does (`processDataPack.js` L394-398). **Built
   (G1):** `packRowProblems` in `runPack.ts`, run by `installPack` and the engine's dry run, which
   now reads the pack.
3. **One refused row does not stop the rest** (step 11 decision 5): the row is skipped, the
   install carries on, and the note names each skipped row and Commerce's reason, as the
   service's `processingOrchestration.js` L263-341 does. A row that later rows depend on (a
   category, an attribute set) skips its dependants with it, by name. **Built (G1):**
   `refusedRows.ts`. Skipped: 400/404/409/422 and a name the store lacks. Still stops: 401, 403,
   429, 5xx, no answer, a kind's own reads. Per-kind status stays `success` (the kind ran to its
   end); the note names each skipped row. Refused settings and repeat-install updates skip too.

### G2: the kinds that refuse what the service accepted

4. Removing a stock takes its website off first (`StocksDeleteProcessor.js` L181-227).
5. Swatch attributes install, in the service's two steps (`ProductAttributeImportProcessor.js` L338-352).
6. A shared catalog whose customer group already has one: Commerce's refusal read as "already
   there" (`SharedCatalogImportProcessor.js` L9-32).
7. A company region named by code resolves to its id.
8. Shared-catalog product SKUs are trimmed before comparing.
9. A product's `additional_attributes` become custom attributes (`ProductImportProcessor.js` L97-114).

### G3: a pack from any store (`capture.ts`, `storeChanges.ts`, `packForm.ts`, the export screen and tool)

10. **Save a store Demo Builder did not fill into a pack**, with the items picked (DI-1's story,
    on our engine rather than the service's export).
11. **"Save store changes" offers what the SC added by hand** (products, cart rules, customers,
    companies, empty categories), and says what it left out.
12. Option and link ids are stripped on save (`data_processors_export.json` L175-181).
13. A saved pack is shape-checked before it is stored.
14. An id that cannot be turned into a name is named in the save's outcome, not kept silently.
15. A company with no region id is saved with its region name.
16. A round-trip test: install a pack, save it back, compare (the service's `datapackComparator.js`).

### G4: what the screen and the client show and survive (`dataInstallerHandlers.ts`, the activity view, `commerceRestClient.ts`)

17. Installs by Demo Builder's engine show as installed and in the activity history, on the screen
    and through the agent tools.
18. Reads, and any call Commerce answered 429, are retried with backoff; other writes never are.

### G5: an ACO pack from a Commerce store (PL-60)

19. Port the service's ACO export (`processAcoDataPack.js`, `config/data_processors_aco_export.json`).
    Installing ACO packs stays PL-60's.

### Owner's decision (asked 2026-10-30)

20. Removing a pack the service installed, which our engine has no record of. **Decided (owner,
    2026-10-30): keep refusing, match nothing by name; the refusal points the SC to "Clear demo
    data".** Built on G1: the message (`engine.ts` `NO_RECORD`), the `reset_datapack` description
    (agents: `check_demo_data` then `clear_demo_data`), the `import-datapack` skill template, and
    `docs/systems/data-installer.md`.

## Rules for every group

No live calls (no Commerce, no Data Installer, no cloud). TDD. `gate` before the last commit.
Commits on the group's branch carry `Backlog:`; no AI trailers. Do not bump
`AI_CONTEXT_VERSION`: say which skill templates changed and it is bumped once at the merge. Each
group ends with a live-test script for the owner, run on `scratch-1028` /
`justrite_test_website` only, back to zero.
