---
id: DI-15
kind: feature
area: data-installer
needs: []
value: med
status: backlog
parent: EDS-1
---

# Several datapacks per project

Filed 2026-11-12, during the J8 prototype walk of the datapack-simplification plan. The owner
decided it, and decided it comes AFTER beta.153: "Nope. We need to support multiple data packs."
Then, on scope: beta.153 ships with one datapack per project ("Switch to Bodea?" when another is
installed), and this is the first plan of the next release.

Part of the multi-site fast follow ([[EDS-1]], owner 2026-11-15), with the storefront half and
[[DI-16]], whether a multi-site pack still installs through the Data Installer service.

## The rule (owner, 2026-11-12)

Any number of datapacks in one project. Demo Builder checks for overlap at install:

- **No overlap, install alongside.** A datapack that only adds French store-view values to
  products ("What if I just want a data pack that does nothing but add translated product records
  for a given store view?") writes nothing another datapack writes, so it is simply added.
- **Overlap is a Switch.** Only when a new datapack writes the same records at the same level
  (the whole store, a website, a store view) as an installed one is the old one removed.
- **Uninstall removes only what that datapack wrote.** The French one takes its French values
  and leaves the products.
- **A datapack built on another needs it first.** The French one needs My Luma's products:
  installing it without them is refused, and uninstalling My Luma asks to take the French one too.

The limit is NOT one per website: a translation datapack sits on another's website and products.

## What the code does today (measured 2026-11-12)

- One datapack per project: `datapack?: ProjectDatapack` is a single value
  (`src/types/base.ts:128`); 53 files under `src/` read `.datapack`.
- Installing a different datapack always removes the first (`importHandlers.ts:152`
  `settleReplacement`, `replaceWords.ts` `replacesHeld`); only the SC's changes are optional.
- One website per datapack, chosen at install and locked after (`importRequest.ts:23-45`,
  `useImportScopes.ts` `lockTo`).
- Install records are one file per pack per project and carry their target
  (`installRecord.ts:22-23, 94-99, 193-203`), but list only what a datapack CREATED
  (`created: CreatedObject[]`). Store-view values written onto another datapack's products are not
  recorded, so an uninstall could not remove them.
- Clear Demo Data already copes with many records across projects and websites
  (`wipeClaims.ts`, `wipeRecorded.ts`).

## What the SV team's Data Installer service does (its code at origin/main 0eccb0b, 2026-10-14)

Read from the local clone; a fresh fetch was refused by the org's IP allow list.

- Any number of datapacks on one instance, same website or not; import never reads what is
  installed (`processDataPack.js:266` checks only that the pack exists in the library).
- One website per import, `base`/`default` unless `website_code` + `store_code` are sent
  (`contextBuilder.js:68-77`, `processDataPack.js:213-222`).
- Its installation list is keyed by instance + name + version + type, with no website
  (`installationTracker.js:62-68`), and is never read on import or delete.
- No overlap protection: import overwrites or reuses by natural key; uninstall deletes every row
  by SKU, email, name or url key across the instance (`ProductDeleteProcessor.js:147-163`),
  including records another datapack uses or that existed before.
- Products' `website_ids` is REPLACED with the target website (`lookups.js:2002-2016`), so a second
  datapack sharing a SKU on another website moves the product rather than adding to it.

## The work

- The project holds a list of datapacks. Existing projects read their one datapack as a list of
  one, with no one-off migration (CLAUDE.md property 3).
- Install records also list what a datapack CHANGED (records it wrote onto others, with their
  level) and which datapack it builds on.
- An overlap check before install; a dependency check before uninstall.
- A shared SKU across websites adds the website to the product, never replaces the list.
- Every screen: cards show several installed; Save, Restore and Undo Last Save act on one
  datapack; the dashboard line and the reset rows list several; the MCP tools follow.
- Re-walk J2 to J8 of `.rptc/plans/datapack-simplification/` (the prototype) for several.

## Design questions to walk first

- With two of the SC's own datapacks installed, which one does the header's Save save into?
- Where the demo's own datapacks live on the Datapacks screen (owner walk, 2026-11-16, U2.2). The
  screen mixes "this demo's data" (the installed card) and "the library" (every card, each
  selectable), and a header Save sits between them: the owner could not tell whether Save meant the
  selected card. The direction agreed: show the demo's datapacks apart from the library, with their
  actions on them (Save, Save As New, Update, Uninstall), and Create in the header for a new
  datapack from the store. Prototype it and walk it before building. beta.153 only names the
  target in the menu ("Save to Release Save Test").
- How Install picks the website or store view when the project has more than one.
- What "Restore" and "Undo Last Save" mean with several installed: per datapack, surely, but
  reached from where.
- Whether the engine can write store-view values at all today (not checked).

Related: [[EDS-1]] (multi-site and multi-locale storefronts), [[DI-13]], [[DI-5]].
