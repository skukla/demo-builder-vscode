---
id: DI-5
kind: feature
area: data-installer
needs: []
value: high
status: active
---

# Demo Builder installs datapacks itself, beside the service

Filed 2026-10-27. Plan: `.rptc/plans/datapack-engine/overview.md`.

The Data Installer service reads fine but no longer installs for us: since its 2026-10-27
commit "remove the postman backward compatibility params" it ignores the Commerce credentials
a caller sends, so every dry run and import fails "Pre-flight check failed for all configured
site types (accs, local)". The owner: the service is not something we can rely on.

Demo Builder gets its own install engine, written from scratch (their processors read as the
specification, never copied), behind the same buttons as the service engine, with one
setting choosing between them and each installed pack recording which engine installed it,
so removal always goes back through the same one. Catalog kinds first, then customers and B2B
(which completes Bodea), the rest only when a pack needs them.

High value: SCs cannot install any datapack until this exists or the service changes back.

## Shipped so far

- 2026-10-27  refactor(data-installer): every datapack write goes through an engine (DI-5 step 1) (`41824afda`)
- 2026-10-27  docs(plan): Demo Builder installs datapacks itself, beside the service (DI-5) (`54df94fca`)
- 2026-10-27  docs(plan): the catalog spec read off the service, with Bodea's answers (DI-5) (`5a2315b7f`)
- 2026-10-27  refactor(types): CommerceGet and CommerceSend live in the shared Commerce wire types (`0cf2e39db`)
- 2026-10-27  docs(plan): store settings as a datapack kind, restored on removal (DI-5) (`c17eac8da`)
- 2026-10-27  feat(data-installer): the install record our engine writes as it creates (DI-5) (`c8670cbc7`)
- 2026-10-27  feat(data-installer): our engine installs and removes attributes and attribute sets (DI-5) (`548fabcf3`)
- 2026-10-27  docs(plan): our engine installs from the library and zip files too (DI-5) (`0ec8e8c8a`)
- 2026-10-27  merge: the datapack library and zip files into the engine branch (DI-5) (`3bbd1a27c`)
- 2026-10-27  docs(plan): library as home, starting packs, oversized items, and wiping a store (DI-5) (`e8e448c54`)
- 2026-10-27  feat(data-installer): our engine installs and removes a pack's category tree (DI-5) (`5524817b1`)
- 2026-10-27  feat(data-installer): our engine installs and removes sources, stocks and their links (DI-5) (`39691b4c0`)
- 2026-10-27  feat(data-installer): our engine installs and removes products and sets their stock (DI-5) (`a0dc9d815`)
- 2026-10-27  docs(plan): repeat installs and capture, and the service's export read as a spec (DI-5) (`5f5da6b1c`)
- 2026-10-27  docs(plan): undo, removal and repeat installs as an SC sees them; each demo's own pack; AB-83 decided (DI-5) (`ef50da66b`)
- 2026-10-27  docs(plan): the datapack engine plan in the RPTC shape, steps and research apart (DI-5) (`43b4c30a5`)
- 2026-10-27  feat(data-installer): our engine installs a whole pack in order and removes it from its record (DI-5) (`d93fdab2e`)
- 2026-10-27  docs(plan): every new part reuses the extension's own components, named per step (DI-5) (`02026e4e0`)
- 2026-10-27  feat(data-installer): Demo Builder's engine behind the engine seam, with its install target (DI-5) (`7389d4143`)
- 2026-10-27  docs(rptc): commit ids after the history rewrite; the service's maintainers are not named (`544b97be4`)
- 2026-10-27  feat(data-installer): the engine setting, and every write builds the chosen engine (DI-5) (`79105c983`)
- 2026-10-27  docs(plan): reset clears a demo's part of the store (DI-5) (`8ccbdae5e`)
- 2026-10-28  docs(plan): the storefront shows a pack's own categories (DI-5) (`a8a86a40c`)
- 2026-10-28  feat(data-installer): Demo Builder's engine installs a pack from the library (DI-5) (`6d851fed2`)
- 2026-10-28  feat(data-installer): Demo Builder's engine writes only for a sign-in in the store's own org (DI-5) (`eef29f920`)
- 2026-10-28  fix(data-installer): library writes name the caller's org, as its reads do (DI-5) (`19be668de`)
- 2026-10-28  fix(data-installer): a pack's codes cannot steer a Commerce request elsewhere (DI-5) (`a3b9246c9`)
- 2026-10-28  style(data-installer): the engine id re-export sits below the imports (DI-5) (`d6ccb50fd`)
- 2026-10-28  feat(data-installer): Demo Builder's engine installs by default; the service keeps the catalog (`e6be8e0ee`)
- 2026-10-28  docs(rptc): datapack-engine plan updates (`364018383`)
- 2026-10-28  fix(data-installer): the Data Installer service is sent no Commerce secrets (DI-5) (`c69e7a7b3`)
- 2026-10-28  docs(plan): the datapack hybrid, settings layers, and publishing to the Data Installer (DI-5) (`45abdfc72`)
- 2026-10-28  merge: Demo Builder's own datapack engine into the release candidate (DI-5) (`ac48e6512`)
- 2026-10-29  fix(data-installer): a layout the store does not offer stays at its default (`ae8942af4`)
- 2026-10-29  fix(data-installer): library packs install directly; a save path without .zip is a folder (`cd7cdc0f2`)
- 2026-10-29  feat(core): one rule for "is this still as we left it?" (datapack step 04) (`9946364d8`)
- 2026-10-29  fix(data-installer): no export into the shared catalog while Demo Builder's engine is chosen (`c2d9eb1f7`)
- 2026-10-29  feat(data-installer): reinstall a pack keeping Admin edits, and save the store back to it (datapack step 05) (`05c2430fc`)
- 2026-10-29  fix(data-installer): preview counts a stock link already there; a zip save makes its folders (`6031da47c`)
- 2026-10-29  fix(data-installer): a removal keeps a category that holds the SC's own product (`1290ce451`)
- 2026-10-29  fix(data-installer): Demo Builder's engine writes store-wide, not through the project's store view (`7b92ddf26`)
- 2026-10-29  feat(data-installer): each demo has its own pack, and a project knows where its pack lives (datapack step 07) (`3fe1253b7`)
- 2026-10-29  feat(data-installer): customers and B2B companies in packs (datapack step 08) (`6f07738f6`)
- 2026-10-29  feat(data-installer): store settings as a pack kind (datapack step 09) (`72b611705`)
- 2026-10-29  fix(data-installer): a shared catalog and its customer group are kept or removed together (`0cb9a06ab`)
- 2026-10-29  fix(data-installer): a removal keeps a company's admin and its catalog links, deciding before any write (`bbd3ab715`)
- 2026-10-29  feat(data-installer): clear a demo's leftover data, share a pack, and install to the recorded website (datapack step 10) (`bbd5a9f49`)
- 2026-10-30  fix(data-installer): the wipe refuses a website another local project calls its own (`b7092cf70`)
- 2026-10-30  feat(data-installer): the wipe clears a chosen set of stores and closes their orders by the one reset rule (`8edccf458`)
- 2026-10-30  feat(data-installer): one wipe clears an ERP-served store's orders through the integration (`bbec49484`)
- 2026-10-30  feat(data-installer): cart rules, coupons and gift cards in packs (datapack step 11) (`39c7ad5fd`)
- 2026-10-30  docs(datapack): record the wipe's live run and the ERP branches to merge before beta.153 (`2ff7af512`)
- 2026-10-30  feat(data-installer): a pack's categories show on the demo's storefront (datapack step 12) (`00e03c795`)
- 2026-10-30  fix(data-installer): stop before writing when a pack category's url key is taken (`1cb18652f`)
- 2026-10-30  chore(ai): bump AI_CONTEXT_VERSION to 48 for step 14's import-datapack changes (`5f64ed117`)
- 2026-10-30  Merge parity/g4-surfaces-retries: our engine's installs on screen, and retries (step 14, G4) (`4b6fbedb3`)
- 2026-10-30  test(data-installer): a pack installed and saved back is the pack again (`b4cfeaccf`)
- 2026-10-30  Merge parity/g1-install-robustness: an install that survives what goes wrong (step 14, G1) (`724652f32`)
- 2026-10-30  fix(data-installer): a saved pack carries no option ids, names what it could not name, keeps a region by name (`d6ca41488`)
- 2026-10-30  refactor(data-installer): the pending entry's shape in its own file (`12574005a`)
- 2026-10-30  docs(data-installer): what Demo Builder's engine does when an install hits trouble (`0aa3598a9`)
- 2026-10-30  feat(data-installer): one refused row does not stop the rest of an install (`29de79522`)
- 2026-10-30  Merge parity/g2-kind-fixes: the kinds that refused what the service accepted (step 14, G2) (`8d6aaf514`)
- 2026-10-30  fix(data-installer): name the catalog stand-in helper so lint does not read it as a hook (`eb0c5d7b2`)
- 2026-10-30  feat(data-installer): a create whose answer is lost is still the pack's (`bad02f0c0`)
- 2026-10-30  feat(data-installer): installed and activity show Demo Builder's engine's work too (`d84569d56`)
- 2026-10-30  feat(data-installer): Demo Builder's engine logs each install and removal it finishes (`3147f721a`)
- 2026-10-30  docs(data-installer): what step 14's group 2 changed, and its live test (`bdc15bf0e`)
- 2026-10-30  feat(data-installer): a product's additional_attributes become custom attributes (`85fe6315e`)
- 2026-10-30  fix(data-installer): trim shared-catalog product SKUs before comparing them (`125948ed3`)
- 2026-10-30  feat(data-installer): a company region named by code or name becomes its id (`0c832aa15`)
- 2026-10-30  fix(commerce-rest): retry reads and 429s, never a write that may have landed (`d1a722d90`)
- 2026-10-30  fix(data-installer): use the store's catalog when a pack's customer group already has one (`e4aaa0443`)
- 2026-10-30  feat(data-installer): install swatch attributes in the service's two steps (`490c98528`)
- 2026-10-30  feat(data-installer): a removal with no install record points to Clear demo data (`b7482d145`)
- 2026-10-30  feat(data-installer): check every kind's rows before the first write, in the install and the dry run (`943a4d3d5`)
- 2026-10-30  fix(data-installer): take a pack's stock off its website before deleting it (`05ee5f38c`)
- 2026-10-30  docs(datapack): step 14 plan and the two service parity reports (`bccc22967`)
- 2026-10-30  fix(data-installer): the pick screen is titled "Choose what goes in the pack" (`e93230dcc`)
- 2026-10-30  docs(data-installer): the header, the side panel and the Admin step as they now are (`434307987`)
- 2026-10-30  feat(data-installer): one Create datapack, and the header's actions are quiet buttons (`3057318d8`)
- 2026-10-30  feat(data-installer): a pack's flyout shows Import and puts the rest in the menu (`6e5716903`)
- 2026-10-30  feat(data-installer): a pack's Admin step is one quiet line that opens the setup guide's own step (`b368b5062`)
- 2026-10-30  fix(data-installer): a pack step's Check waits long enough to show its answer (`ed65b0af2`)
- 2026-10-30  fix(data-installer): the root-category question leads with the step, and a missing pack file names the project (`76b1e57bc`)
