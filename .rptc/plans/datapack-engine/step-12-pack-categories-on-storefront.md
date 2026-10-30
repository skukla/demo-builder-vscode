# Step 12: the storefront shows a pack's own categories

Status: **built 2026-10-30, not yet live** (no Commerce writes in the build run; the live test is at the end).

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

## What was built (2026-10-30)

**Where a pack's own root goes** (`packRoot.ts`, new). Before an install of a pack with a
`root_category`, the engine reads the store structure the wipe reads (`readWipeStructure`,
`storeOfView`, `resolveWipeScope`'s shared roots): the install target's store, its
`root_category_id`, and the other stores showing that root. Then `rootPlacement`:

| Case | Placement |
|---|---|
| the pack has no root of its own | unchanged (its paths' first name maps onto the store's root) |
| the record holds the pack's root (key `(root)`), or a category recorded before keys | `own`: as before (rule 3) |
| the record holds categories and no root | `store`: as the first install did |
| first install, no other store shows the store's root | `store` |
| first install, another store shows it (or the structure could not be read) | `own` |

`store` simply drops `root_category` from the pack's rows (`placeCategories`), so the categories go
under the store's root by the code that already did that for packs without a root. Keys leave the
first name out, so the record, the fingerprints and a repeat install are the same either way. The
install's note says "Frescopa's categories went under the root category of the store Bodea Store,
so its storefront shows them."

**The shared root: the one Admin step** (`packRootStep.ts`, new). After the categories kind, when
the pack kept its own root: a read-only check (`GET store/storeGroups`, the store by `code`, its
`root_category_id` against the pack root's id); not set, the SC is asked through
`askDuringOperation` (passed in by `buildDatapackEngine`, so the engine and its tests need no VS
Code): **Open the Admin** (the dashboard's own opening, now shared as `core/utils/commerceAdmin.ts`,
then asked again), **I've done it** (the check again: set, the install carries on; not set, asked
again saying "The store JustRite Test Store still shows the root category Justrite (id 119), not
Frescopa (id 300)."), **Skip for now** or a dismissed question (the install finishes). Where the
step stands is written on the install record (`rootStep`: state, store, pack root, the root the
store showed at the first install, what the last check found), and the note says it: "One step is
left in the Admin: Stores > All Stores > JustRite Test Store, Root Category: Frescopa, then Save
Store. Until then the storefront does not show Frescopa's categories."

**Both ways back work.** (1) A reinstall (step 05's repeat install, nothing unchanged rewritten)
reaches the same check: set, it marks the step done and asks nothing; not set, it asks again.
(2) The step in the setup guide's format (`packRootGuideStep`: the same `SetupStep` fields
`app-builder-components.json` declares, `rootStepItem` for the guide's `SetupChecklistItem`) shows
in the pack's flyout on the Data Installer screen (`PackSetupStepNotice`), with Open the Admin and
Check (`get-datapack-setup-step`, `check-datapack-setup-step`); Check runs the same read and marks it
done with no reinstall and no Commerce write. Both tested (`runPack-packRoot.test.ts`).

**Removal, capture and the preview.**
- Removal takes out only what the pack made, as before: under the store's root, its categories by
  id, never the store's root. A pack root a store shows as its root is kept (`removers.ts`, through
  `decideRemovals`, so removal, reinstall and the preview agree): "Kept the category Frescopa: the
  store JustRite Test Store shows it as its root category. In the Admin, … set Root Category back to
  the one it had and Save Store, then remove the pack again." It stays on the record; the next
  removal takes it once the store is pointed back. Tested back to zero.
- Capture (`capture.ts`) writes the pack's root back whenever the installed version has one: the
  root this engine made, as the store has it now (Admin rename kept), or else the installed
  version's root row, and every path starts with that root's name. So a pack whose categories went
  under a store's root, or whose root the SC made the store's, saves as a pack that still installs
  as its own root elsewhere. (Before, the second case lost its root.)
- `preview_datapack_changes` places the root as the install does (no phantom "add (root)") and
  answers `root`, the same sentence beforehand.

**The setup guide's step drawing moved to `core/ui`** (`SetupStepFacts`, from `SetupGuideStep.tsx`'s
`StepFacts`/`WhereLine`, unchanged; its five rules moved unchanged, same layer, from
`integrations.css` to `fact-list.css`), because the flyout needed the same step. The setup guide's
suites ran with no edits.

**Agent surface.** No new tool. `start_datapack_import`'s and `preview_datapack_changes`'s
descriptions say where the root goes and that a rerun re-checks the step; under an agent the
question is a VS Code modal (PL-59). The generated skills `import-datapack.md` and `diagnose-demo.md`
say the new behaviour (`AI_CONTEXT_VERSION` 46 → 47; no gating change, so the four seams are
untouched and no skill count moves). `docs/systems/mcp-server.md` has a section; the SC guide note
is in `docs/systems/data-installer.md` ("Setting up a store for a demo"). `ai-coverage-scan`,
`security-review`, the battery prompt and a response-ceiling measure: not run this step.

**The storefront catches up.** Nothing new: category pages appear on first visit (EDS-61) and
`republish` rebuilds the catalog menu; the skills say so. How Catalog Service takes a root change is
still untested (the live test reads it).

### Which reads are confirmed against a captured real response

| Read | Endpoint and field | Confirmed? |
|---|---|---|
| a store's root | `GET store/storeGroups`: `id`, `code`, `name`, `website_id`, `root_category_id` | read live by `storeScopeOf` (root) and the wipe's picker (2026-10-30); no answer recorded as a fixture this step |
| the store views and websites | `GET store/storeViews` (`code`, `website_id`, `store_group_id`), `GET store/websites` | yes, by `storeScopeOf` and store discovery |
| a category's name | `GET categories/{id}` `name` | yes (step 05) |
| making a root | `POST categories` with `parent_id` 1, answer `id` | the route yes (the service's spec); not run from here |
| a store's root after the SC changes it in the Admin | the same `GET store/storeGroups` | **no**: assumed the Admin's Root Category is that column (`Store/etc/db_schema.xml`) |
| deleting a category a store shows as its root | `DELETE categories/{id}` | **no**: never sent (the root is kept); whether Commerce would refuse it is unknown |
| Catalog Service after a root change | the storefront's category reads | **no** |

### Decisions for the owner (recommendation first)

1. **"Under the store's root" leaves the pack's root out**, so the storefront shows the pack's top
   categories (Coffee, …), as it would had the store's root been switched to the pack's. The other
   reading, the pack's root as one category under the store's ("Frescopa" > Coffee), is a one-line
   change in `placeCategories`. Recommended: keep.
2. **A pack category named like one already under the store's root is found and reused, not made**
   (the existing find-by-parent-and-name), so its products join the SC's category and removal leaves
   it. Recommended: keep (it is what a pack without a root has always done).
3. **The step's home is the pack's flyout**, not the setup guide modal: that guide belongs to an
   integration (its steps come from a catalog entry and are saved on the component), and a project
   with a pack need not have one. It is drawn in the guide's step format with the guide's own
   component. Recommended: keep; a project-level guide is a separate item if wanted.
4. **No agent tool for the Check alone.** An agent re-runs `start_datapack_import` (a repeat install
   rewrites nothing unchanged), which re-checks and marks it done. Recommended: add
   `check_datapack_setup_step` (read of Commerce, writes only the record) through
   `mcp-tool-authoring` if the battery shows agents need it.
5. **The question is asked right after the categories kind**, before products, so "I've done it"
   continues the rest of the install. Recommended: keep.
6. **A dismissed question counts as Skip for now**, so an install is never left waiting on a closed
   notification. Recommended: keep.
7. **The import window is not a hosting progress modal**, so from the Data Installer screen the
   question is a notification (PL-59's no-modal route); in creation's and project reset's progress
   modals it is asked there. Recommended: keep for now; hosting it in the import window means that
   window rendering operation prompts.

### Not checked

- `webview-visual-baseline` for the CSS move (rules moved unchanged, same layer, unique class names).
- The live test below.

### Live test (owner's call; project `scratch-1028`, website `justrite_test_website`, never JustRite's own)

`justrite_test_store` shows JustRite's root 119, so this is the prompt path.

0. Read-only: `run_commerce_rest GET store/storeGroups`; write down `justrite_test_store`'s
   `root_category_id` (119 expected) and record the answer as a typed fixture.
1. A throwaway zip pack `zz-test-root-db12`: `root_category` "ZZ Root DB12", categories "ZZ Coffee
   DB12" (path "ZZ Root DB12") and "ZZ Espresso DB12" (path "ZZ Root DB12/ZZ Coffee DB12").
   `load_datapack_zip`, then `preview_datapack_changes`: `root` names the shared root and the step;
   categories add 3.
2. `start_datapack_import` (categories, `justrite_test_website` / its store view). The question
   appears (a VS Code modal under the agent, a notification from the screen). Choose Skip for now.
   `get_datapack_import_status` note: "One step is left in the Admin: Stores > All Stores > JustRite
   Test Store, Root Category: ZZ Root DB12, then Save Store. …". The record has `rootStep.state` open.
3. The pack's flyout shows the step; press Check: still open, the note names Justrite (id 119).
4. Install again: asked again; choose I've done it without doing it: asked again, saying the store
   still shows 119. Choose Skip.
5. In the Admin, Stores > All Stores > JustRite Test Store, Root Category: ZZ Root DB12, Save Store.
   Press Check in the flyout: done, no reinstall. Read `GET store/storeGroups`: the root is the new id.
6. Storefront: does the test store view's catalog show ZZ Coffee DB12 (Catalog Service lag: note how
   long)?
7. Remove the pack: kept "the category ZZ Root DB12: the store JustRite Test Store shows it as its
   root category …"; the two children gone.
8. **Back to zero:** Admin, set the test store's Root Category back to Justrite (119), Save Store.
   Remove again: the root goes and the record file goes. `GET store/storeGroups` reads as at step 0;
   no `DB12` category in `categories/list`; delete `zz-test-root-db12` from the library.
9. Separately, if a store with a root of its own is free to use: install the same pack there and
   check no question, no "ZZ Root DB12" made, the two categories under that store's root; remove;
   back to zero.
