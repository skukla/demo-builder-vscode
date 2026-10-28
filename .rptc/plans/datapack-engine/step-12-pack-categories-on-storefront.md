# Step 12: the storefront shows a pack's own categories

Status: **to do**, after step 03's first live run (owner, 2026-10-27).

## Why

A pack can bring its own top category (Frescopa's is "Frescopa"). It is installed under the
tree's top, not under the store's root, so the store view does not show it: the products are
there, and their categories are missing from the storefront's menu. An SC expects to see the
pack's categories.

## First: can the store's root be changed over the API at all?

**Not known, and it decides the design.** Nothing in this repo, the Data Installer service or
the discovery service writes a store group; all of them only read `GET store/storeGroups`
(checked 2026-10-27). INFERRED: Commerce's REST API reads websites, store groups and store
views and offers no save for them. To verify (the `adobe-docs-lookup` skill, then one live
read-only check) before anything below is built.

- **If it can be changed:** install points the demo's store at the pack's root and records the
  root it had; removal points it back. Reversible (rule 1).
- **If it cannot:**
  - when the demo's store has a root of its own, install puts the pack's categories under that
    root instead of a new one, and removal takes them out: no store change at all;
  - when the root is shared with another store (`justrite_test_website` shares Justrite's,
    root 119), the pack keeps its own root and the SC is shown the one Admin step, with values
    to copy, as the demo setup guide shows its manual steps: "Stores > All Stores > (the store)
    > Root Category: Frescopa".

## Then the storefront catches up

No storefront setting changes: a storefront points at a store view, and the store view's store
decides its categories. Two things have to happen after the switch:

1. **Catalog Service has to show the new categories.** The storefront reads categories and
   products from it, not from the store, and it can lag (Justrite's Accuform products read out
   of stock until the Data Feed was resynced in the Admin). How it takes a root change is
   untested; the first try says.
2. **Demo Builder's category pages and catalog menu are rebuilt** for an Edge Delivery
   storefront, by the step storefront setup, reset and republish already run.

So: install, switch, wait for Catalog Service to show the categories, rebuild the pages and
menu. Removal in reverse: take down the pack's category pages, switch back, remove the data.

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| The store's current root | The lookup the engine already uses | `storeScopeOf` |
| Rebuilding category pages and the menu, and taking them down | Reset's and republish's existing steps | `applyCatalogMenuStep`, `removeCatalogMenuStep` (`edsResetCatalogMenu.ts`) |
| Showing an Admin step with values to copy | The demo setup guide's manual steps | the setup guide's step view and `CopyableText` |
| Waiting on Catalog Service | The category reader the menu step uses | `categoryReader.ts` |

## Agent surface

No new tool. `start_datapack_import`'s answer says when the SC has one Admin step to do, with
the values; `republish` already rebuilds the category pages and menu. A battery prompt, "Install
Frescopa and make the storefront show its categories", is traced. Then `ai-coverage-scan`.
