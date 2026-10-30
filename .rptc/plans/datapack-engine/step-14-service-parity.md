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
   pending entry; removal treats an adopted one as the pack's.
2. **Every kind's rows are checked before anything is written**, in the install and the dry run
   (`validate_datapack_import`), as the service does (`processDataPack.js` L394-398).
3. **One refused row does not stop the rest** (step 11 decision 5): the row is skipped, the
   install carries on, and the note names each skipped row and Commerce's reason, as the
   service's `processingOrchestration.js` L263-341 does. A row that later rows depend on (a
   category, an attribute set) skips its dependants with it, by name.

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
    on our engine rather than the service's export). *Built (branch `parity/g3-pack-from-any-store`,
    not yet live):* with Demo Builder's engine the export door is ours. The catalog header's "Save
    from this store" opens a pick screen (`SaveFromStoreModal`, ten kinds, `pickableKinds.ts`), each
    kind listed from the project's store (`storeItems.ts`, website-scoped where Commerce scopes it,
    Commerce's own excluded); Save writes a new version of the demo's own library pack with the picks
    alone (`saveStore.ts`), recording only `ownDatapack`. Agents: `list_datapack_export_items` and
    `start_datapack_export` (only `selections` + `confirm`), and `save_store_changes_to_pack` with no
    pack named.
11. **"Save store changes" offers what the SC added by hand** (products, cart rules, customers,
    companies, empty categories), and says what it left out. *Built:* the flyout button opens the
    same pick screen with the pack, listing only what the pack does not hold (`inPackCount` for the
    rest); picks are captured with the pack and never join the install record. Every save's sentence
    and answer say what the store has that the version does not (`leftOut`, six kinds).
12. Option and link ids are stripped on save (`data_processors_export.json` L175-181). *Built*
    (`packForm.ts` `customOption`, `bundleOption`).
13. A saved pack is shape-checked before it is stored. *Built* (`packShape.ts`: the install's own
    parsers; a refused kind stops the save with the install's reason, nothing stored).
14. An id that cannot be turned into a name is named in the save's outcome, not kept silently.
    *Built* (`nameOrId` in `packForm.ts`, used by every pack form; `unnamed` in the answer and its
    sentence).
15. A company with no region id is saved with its region name. *Built, capture side*
    (`companiesKind.ts` `packRegion`). Needs G2's install side to take `{ region: <name> }`: until
    then the shape check (13) refuses such a save, saying why.
16. A round-trip test: install a pack, save it back, compare (the service's `datapackComparator.js`).
    *Built* (`roundTrip.test.ts` over `memoryStore.testUtils.ts`: categories, a product with custom
    options, quantities).

### G4: what the screen and the client show and survive (`dataInstallerHandlers.ts`, the activity view, `commerceRestClient.ts`)

17. Installs by Demo Builder's engine show as installed and in the activity history, on the screen
    and through the agent tools.
18. Reads, and any call Commerce answered 429, are retried with backoff; other writes never are.

### G5: an ACO pack from a Commerce store (PL-60)

19. Port the service's ACO export (`processAcoDataPack.js`, `config/data_processors_aco_export.json`).
    Installing ACO packs stays PL-60's.

### Owner's decision (asked 2026-10-30)

20. Removing a pack the service installed, which our engine has no record of.

## Rules for every group

No live calls (no Commerce, no Data Installer, no cloud). TDD. `gate` before the last commit.
Commits on the group's branch carry `Backlog:`; no AI trailers. Do not bump
`AI_CONTEXT_VERSION`: say which skill templates changed and it is bumped once at the merge. Each
group ends with a live-test script for the owner, run on `scratch-1028` /
`justrite_test_website` only, back to zero.
