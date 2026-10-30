# Step 12: the storefront shows a pack's own categories

Status: **to do**, after step 03's first live run (owner, 2026-10-27).

## Why

A pack can bring its own top category (Frescopa's is "Frescopa"). It is installed under the
tree's top, not under the store's root, so the store view does not show it: the products are
there, and their categories are missing from the storefront's menu. An SC expects to see the
pack's categories.

## First: can the store's root be changed over the API at all?

**Answered 2026-10-30, live on the ACCS sandbox: no.** With the project's own signed REST
client, `POST /V1/store/storeGroups` (create a store), `PUT /V1/store/storeGroups/6` (change a
store's root; body named the root it already had, so it could not have changed anything) and
`POST /V1/store/storeViews` (create a store view) each answered HTTP 404 "Request does not match
any route.", while `GET /V1/store/storeGroups` and `GET /V1/store/storeViews` on the same client
answered normally. So the store structure is Admin-only on ACCS, and the **"If it cannot"**
branch below is the design. The docs check (step 0 of the research the owner asked for) is
running to confirm for PaaS as well. Also measured the same day: every website on the sandbox has
exactly one store; `catalog/price/scope` = 1 (Website) and `customer/account_share/scope` = 1
(Per Website) there, and neither setting can go finer than a website, so stores on one website
always share prices and customer accounts (SC guide note; owner, 2026-10-30).

**Docs confirm (research, 2026-10-30):** ACCS's REST spec (`AdobeDocs/commerce-webapi`
`src/openapi/accs-schema.yaml`, store routes ~lines 31462-31580) and PaaS core
(`Magento/Store/etc/webapi.xml:11-40`) expose GET only for websites, store groups and store
views; neither GraphQL schema has a store mutation; `root_category_id` is a `store_group` table
column (`Store/etc/db_schema.xml:34-40`), not a config path, so `PUT /V1/system/config` cannot set
it. Admin only. For the shared-root case, the setup step is CHECKED read-only: read
`GET /V1/store/storeGroups` and compare the demo store's `root_category_id` with the pack root's
id. ACO groups by product family, not by a store root, so it probably has no such step
(inferred, untested; relevant to PL-60).

**Pause and prompt, not a note afterwards (owner, 2026-10-30).** The shared-root Admin step is
asked mid-install through the existing `askDuringOperation` (`src/core/vscode/operationPrompt.ts`,
PL-59; the same seam a dozen guards use): in the progress modal when one hosts the install, a
notification when none does, a VS Code modal under an agent. Choices: **Open the Admin**, **I've
done it**, **Skip for now**. "I've done it" runs the read-only check above; set → the install
continues; not set → the question is asked again, saying what the store's root is now. "Skip for
now" finishes the install and leaves the step open in the setup guide (its `manual` entry, with
the same check). No new prompt component.

**Picking up where it left off (owner, 2026-10-30).** After "Skip for now", both ways back work
and neither starts over: (1) running the install again is step 05's repeat install (recorded
objects unchanged unless the pack changed them; only what is missing is added — proven live
2026-10-29: an install that stopped at products, run again, added the products and reused the
five recorded categories), and it reaches the same root check and asks again; (2) the open setup
guide step's Check runs the same read and marks it done with no reinstall. Test both.

**Reuse what the repo already knows (owner, 2026-10-30).** The fact is not new: the generated
agent skills `import-datapack.md:146-149` and `diagnose-demo.md:92-105` already tell agents "a
root category is assigned by hand, in the Admin, after the import", and
`.rptc/complete/bodea-template/bodea-datapack-facts.md:182-187` records the Data Installer
author's rule "create the website FIRST, then target the import at it" (store scope must
pre-exist; no kind creates it). So: (1) the shared-root Admin step uses the setup guide's
existing `manual` step format (`app-builder-components.json`, e.g. "Connect PayPal in Sales >
Payment Services…"), no new screen; (2) both skills are updated to the new behaviour (install
under the store's own root when it has one), which is a generated-bundle change: bump
`AI_CONTEXT_VERSION` per the `ai-context-authoring` skill; (3) "create the website and store
first" joins the SC guide note beside the prices / customer-accounts note.

Earlier text, kept as the reasoning: **Not known, and it decides the design.** Nothing in this repo, the Data Installer service or
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
