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

4. Removing a stock takes its website off first (`StocksDeleteProcessor.js` L181-227). **Built**
   (`05ee5f38c`): PUT empty `sales_channels` with the service's body, DELETE, then the website goes
   back on its earlier stock. Whether Commerce requires the PUT is still unproven either way; the
   service added it for DEMOSYS-1532 ("Stocks not deleting on multisite setup").
5. Swatch attributes install, in the service's two steps (`ProductAttributeImportProcessor.js` L338-352).
   **Built** (`490c98528`), on the create path, for a store's own swatch, and on a repeat install.
   What Commerce answers as a swatch's `frontend_input` is not captured, so a swatch our save wrote
   is pinned to reinstall in both forms (as a swatch, or as a plain dropdown).
6. A shared catalog whose customer group already has one: Commerce's refusal read as "already
   there" (`SharedCatalogImportProcessor.js` L9-32). **Built** (`e4aaa0443`): looks first (the
   list names each catalog's group) and reads the refusal too; the store's catalog stands in for
   the pack's, is never recorded, and takes the pack's assignments, which are.
7. A company region named by code resolves to its id. **Built** (`0c832aa15`) through
   `GET directory/countries/{id}`: no code here or in the service read it before, so its shape
   (`CommerceCountryInfo`) is not captured. Name works too.
8. Shared-catalog product SKUs are trimmed before comparing. **Built** (`125948ed3`); case kept.
9. A product's `additional_attributes` become custom attributes (`ProductImportProcessor.js` L97-114).
   **Built** (`85fe6315e`). No pack on this machine or in the library audit is known to carry it.

#### G2 live test (owner; `scratch-1028`, website `justrite_test_website` only; ends at zero)

A test pack `zz-g2-parity`, loaded from a file into the library. No sources (Commerce cannot delete
one, so a source would never get back to zero).

| Kind | Row |
|---|---|
| `product_attributes` | `zz_g2_color`, `frontend_input: swatch_visual`, options Black `#1d1d1d`, Blue `#286785` |
| `stocks` | `ZZ G2 Stock` |
| `products` | simple `ZZ-G2-1`, set `Default`, `url_key` `zz-g2-1`, `additional_attributes: { meta_title: "ZZ G2 meta" }` |
| `b2b_companies` | `ZZ G2 Company`, region `{ region_code: "TX" }`, admin `zz.g2.admin@example.com` |
| `b2b_shared_catalogs` | `ZZ G2 Catalog`, `customer_group_id: "General"` (the public catalog's group) |
| `b2b_shared_catalog_products` | `ZZ G2 Catalog`: `{ sku: " ZZ-G2-1 " }` (spaces on purpose) |

1. Read only: `GET directory/countries/US` (expect `available_regions[]` with `id`, `code`, `name`;
   anything else, stop: item 7's read is wrong). `GET sharedCatalog` (note the public catalog's id
   and group). `GET inventory/stocks` (note which stock sells to `justrite_test_website`).
2. Preview the install (`validate_datapack_import`), then install it (`start_datapack_import`).
   Expect in Debug Logs: the attribute made, then two option writes; `ZZ G2 Stock` selling to
   `justrite_test_website`; `ZZ-G2-1` made; the company made; "used shared catalog <the public
   catalog's name> for ZZ G2 Catalog: its customer group already has that catalog". Then either
   "assigned 1 to shared catalog ZZ G2 Catalog", or no assignment line at all if Commerce put the
   new product in the public catalog itself (the trimmed SKU then matched; untrimmed, it would not).
3. Check: Admin, Stores > Attributes > Product > `zz_g2_color` shows two colour swatches.
   `GET products/attributes/zz_g2_color`: write down its `frontend_input` (this settles how our save
   sees a swatch). `GET products/ZZ-G2-1`: `meta_title` is "ZZ G2 meta". The company's `region_id`
   is Texas's id from step 1. `GET sharedCatalog/<public id>/products` holds `ZZ-G2-1`, no spaces.
4. Remove the pack (`reset_datapack`, confirm). Expect a PUT then a DELETE on `ZZ G2 Stock`, and the
   website back on the stock from step 1. If the DELETE is refused, note Commerce's words.
5. Back at zero: `GET inventory/stocks` has no `ZZ G2 Stock`, and step 1's stock sells to
   `justrite_test_website` again; `GET products/ZZ-G2-1` and `GET products/attributes/zz_g2_color`
   answer 404; no `ZZ G2 Company`; no customer `zz.g2.admin@example.com`; the public catalog no
   longer holds `ZZ-G2-1` and still exists; `list_installed_datapacks` shows no `zz-g2-parity`.
   Then remove `zz-g2-parity` from the library (`delete_library_datapack`).

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
13. A saved pack is shape-checked before it is stored. *Built* (`packRowRefusals` in `runPack.ts`, shared with G1's item 2: the install's own
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
    and through the agent tools. **Built** (branch `parity/g4-surfaces-retries`): the two reads
    put the project's own rows first (install records; a new append-only
    `.demo-builder/datapack-activity.jsonl` the engine writes when each job ends, through a new
    `onJobEnd` hook in `engine.ts`), then the service's, each tagged `source`, paged as one list
    (`engineHistoryReads.ts`). A removal stays in the history after its record is gone.
18. Reads, and any call Commerce answered 429, are retried with backoff; other writes never are.
    **Built** (same branch): up to three retries, 1, 2 then 4 seconds; a read that ran out its
    own wait is not retried (`commerceRestRetry.ts`).

### G5: an ACO pack from a Commerce store (PL-60)

19. Port the service's ACO export (`processAcoDataPack.js`, `config/data_processors_aco_export.json`).
    Installing ACO packs stays PL-60's.
    **Built 2026-10-30 on `parity/g5-aco-export`, not yet live.** `services/acoExport/`, the
    export screen's pack-type choice, `start_datapack_export` `aco: true`; saved into the
    library. Spec and differences: `.rptc/research/datapack-engine/aco-export-spec.md`.

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
