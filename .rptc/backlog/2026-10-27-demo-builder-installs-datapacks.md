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
