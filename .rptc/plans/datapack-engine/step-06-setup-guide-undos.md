# Step 06: the setup guide's undos keep what changed since

Status: **built, not yet live** (2026-10-29). This branch's part of
[AB-83](../../backlog/2026-10-27-undo-leaves-what-changed-since.md), which holds the full table of
every undo and what each can lose; the ERP's detach is its own PR in `commerce-erp-integration`.

Decided by the owner, 2026-10-27, using step 04's rule:

- **Settings** (`configFix.ts`): a setting whose current value is not the one the fix wrote is
  kept.
- **Shared catalogs** (`sharedCatalogsFix.ts`): a catalog holding anything the fix did not put
  there is kept, with the company still unassigned from it; one holding only the fix's is deleted
  as today.
- **Warehouse** (`warehouseFix.ts`): a stock holding a source the fix did not link is kept, with
  the fix's own links taken out; sources are switched off only if still as the fix left them.
- Each says in one line what it kept. No "undo anyway".

It matters here because packs and the setup guide touch the same things (store settings: the
config fix and step 09's `store_config`; sources and stocks: the warehouse fix and the stock
kinds). With the rule, a pack's removal leaves a setting the guide changed since, and says so.

## Agent surface

No new tool. `undo_commerce_store_preparation` answers the same one line the screen shows for
what it kept; its ceiling is re-measured with that line. A battery prompt, "Undo the price-scope
setup step", is traced. Then `ai-coverage-scan`.

## What was built (2026-10-29)

Everything above. Not yet run against a live store; the live test is at the end of this section.

**One rule, three undos.** Each undo hands what it reads to `decideOwnedChange`
(`core/utils/ownedChange`); none writes a rule of its own. A thing that is kept is not a
refusal: the step is `undone` and its report carries the one line as `kept` (`FixUndone.kept`,
`PreparationStepReport.kept`, `storePreparationEngine.ts`). There is no "undo anyway". A kept
setting or source is the SC's now and leaves the record. **A kept catalog or stock stays on the
record** (`FixUndone.remaining`; owner 2026-10-29, as step 05's container rule), its company
already taken out and its own links already gone, so undoing the step again deletes it once it
is empty (rule 1).

| Undo | Recorded at apply (new) | Read at undo | Kept when |
|---|---|---|---|
| Settings (`configFix.ts`) | `wrote` on each row: the value written | `GET system/config` at the row's scope (`scope=default`, or `scope=website&scopeCode=`), field `value` | the value now is not `wrote` (`leave-edited`), or nothing says what was written (`leave-not-ours`) |
| Shared catalogs (`sharedCatalogsFix.ts`) | `held` on each catalog: its companies, products and categories, read back once made | the catalog list (`GET sharedCatalog/?…`, field `id`), then `GET sharedCatalog/{id}/companies`, `/products`, `/categories` | it holds anything beyond `held` (the rule over what is there beyond it). The company is taken out either way |
| Warehouse (`warehouseFix.ts`) | `sourceFingerprints`: each created or switched-on source's row in the sources list, read after the writes, hashed with `fingerprintRow` | one read of `GET inventory/sources?…`, `inventory/stocks?…`, `inventory/stock-source-links?…` | a created stock: it holds a link to a source the fix did not link (the fix's own links still go). A source: its row no longer hashes the same, or no hash was recorded |

Old records keep working: a settings row with no `wrote` is read by the step's own value (what
the fix writes); a catalog with no `held` counts as holding only its company; a source with no
hash is kept on, with "Demo Builder cannot tell it is still as it left it." A warehouse undo
whose inventory read fails now writes nothing and names why (before, it went ahead with names
only). A link the SC already took out is no longer sent to the delete, and a source already off
is left alone. `recordMerge.ts` now carries `enabledSources` and the hashes through a second
apply (it dropped `enabledSources` before; new `recordMerge.test.ts`).

**The one line.** Settings: "Kept Payment on Account for the website as it is: it was changed
after Demo Builder set it." Catalogs: "Kept the shared catalog Harbor Catalog: it holds 2
products, 1 category and 1 company Demo Builder did not put there." Warehouse: "Kept acme Stock:
it holds Default Source, which Demo Builder did not add to it." and "Kept Justrite Warehouse
switched on: it was changed after Demo Builder set it up." It shows under its step on the result
screen and in the setup guide (`changedSteps` in `storePreparationHandlers.ts`, the same rows the
guide files by step), in the agent's answer (`steps[].kept`), and in removing the ERP integration
(`erpSetupTeardown.ts`, which runs the same undo).

**`set_commerce_config` too.** Its `undo: true` goes through the same `configFix` undo, so it
keeps a setting changed since; without `confirm` it now previews the undo as it would run
(`previewUndo`) instead of previewing a write of the old values. Its undo is built with no items,
so only `wrote` says what was written.

**Agent surface.** No new tool. `undo_commerce_store_preparation`'s and `set_commerce_config`'s
descriptions say what is kept and where the line is; the preview without `confirm` leaves the
source hashes out of what it answers. Battery prompt `undo-price-scope-step` added, not run.
Ceiling not re-measured (it would need a confirmed write); the tool stays in the bounded
classification, and the line adds one short string per step. `ai-coverage-scan`: no new gap.
`docs/systems/mcp-server.md` says it. The manifest schema is regenerated for the three new
record fields.

**Which scope each write uses.** The setup guide opens Commerce with `openCommerce`
(`commerceClientForProject` with the project's own store code), unchanged here. Every write it
makes is to something Commerce keeps once for the whole instance (sources, stocks, links, shared
catalogs and their companies), or carries its scope in the body (`PUT system/config` rows name
`scope` and, for a website row, `scope_code`), so the store code in the address does not decide
what is written. That last point is Magento's REST design, not something measured here; the
`system/config` round trip did run live through this client on 2026-10-10.

### Open, found while building

- **Read live, read-only, 2026-10-29** (scratch-1028's store, `run_commerce_rest`): the three
  shared-catalog list reads (catalog 16: companies `"[\"23\"]"`, a JSON-encoded string; categories
  a list of numbers; products a list of SKUs) and the sources list (full rows: code, name,
  enabled, description, address, `carrier_links`, `extension_attributes`). The code refuses the
  undo of a catalog, deleting nothing, on any other shape.
- **Not confirmed:** whether a new custom catalog holds anything Commerce put there itself (the
  apply's read-back records it either way); and whether anything rewrites an ERP warehouse's row
  between apply and undo. One live source's description reads "mirrored by the ERP as its
  warehouse": if the ERP integration rewrites its warehouse's row, its hash moves and the undo
  keeps it switched on. Live test step 4 checks this.
- **Removing the ERP integration** runs the same undo, so it says what it kept, but the record
  goes with the integration: a kept catalog or stock is then left for the SC to delete by hand.
  Not changed here.
- **The rule for packs (step 09).** "A pack's removal leaves a setting the guide changed since"
  waits for step 09's `store_config` kind.

### Live test (owner's call; on `justrite_test_website` via project `scratch-1028`, never JustRite's own site)

1. Apply the price-scope step and the warehouse step from the setup guide. Read the project's
   `storePreparation` record: settings rows carry `wrote`, the warehouse record carries
   `sourceFingerprints`.
2. Undo the price-scope step at once: it goes back, no "Kept" line.
3. Apply it again. In the Admin, set Catalog Price Scope to something else. Undo: the result
   says "Kept Catalog Price Scope as it is: …"; the value is untouched; the step leaves the record.
   Set it back by hand.
4. Warehouse: in the Admin, add Default Source to the stock the step made. Undo: the stock is
   kept with Default Source in it, the ERP warehouse's link is gone, the warehouse is switched
   off, and the line names Default Source. (If instead it says the warehouse was kept switched
   on, something rewrote its row since the apply: read it and note which field moved.) The step
   is still recorded. Take Default Source out of that stock and undo the step again: the stock is
   deleted and the record goes.
5. Shared catalogs (only if a company there lacks a catalog of its own): apply, read the new
   catalog's `held` in the record (does Commerce put anything in a new catalog itself?), undo
   at once: the catalog is deleted and the company is on the public catalog. Apply again, add one
   product to that catalog in the Admin, undo: the catalog is kept, the company is out of it, the
   line names 1 product, the step is still recorded. Take the product out and undo again: the
   catalog is deleted and the record goes.
6. Back to zero: each step's record gone, the setting at its value from before step 1, no stock
   or catalog the steps made, the warehouse source switched off (Commerce cannot delete one, as
   before).

