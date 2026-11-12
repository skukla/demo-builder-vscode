# Step 10: reset clears a demo's part of the store

Status: **built 2026-10-30, widened the same day to a chosen set of stores with their orders
closed, then to "One action, ERP included" (an ERP integration's orders closed by it, its ERP
refilled); widened 2026-11-02 to "Nothing left behind" (companies, shared catalogs, customer groups,
attribute sets, attributes, website settings); not yet live.** Decided by the owner, 2026-10-27,
2026-10-30 and 2026-11-02.

## Why

An SC resets a demo to put new data in. The cases:

| What the SC wants | What does it |
|---|---|
| Swap to a different pack (Bodea's data, then Frescopa's) | Removing the pack, then installing the new one |
| Start the same pack over after breaking it in the Admin | Removing, then installing again (changes saved first, step 05) |
| Clear data Demo Builder did not install (hand-made in the Admin, the service's installs, an earlier demo's leftovers) | A wipe: there is no record, so removal cannot know these things exist |
| A clean slate for a new customer | A wipe |

## What reset does

1. **Reset always removes what Demo Builder installed**, from its install record. This covers
   most resets.
2. **If the demo's part of the store also holds data Demo Builder did not install, reset says so
   and offers to clear it too**: one unticked box, saying it cannot be undone.

   > **Reset Acme Demo?**
   > Frescopa's 64 items will be removed.
   > This demo's store also holds 31 things Demo Builder didn't install: 18 products and 13
   > categories.
   >
   > ☐ **Also remove those**, to leave this demo's store empty. This can't be undone.
   >
   > [Reset] [Cancel]

   With nothing else there, the box does not appear.
3. **It only ever clears this demo's part of the store** (widened 2026-10-30 from one website to a
   chosen set of STORES, see "Decisions recorded"). The owner's one ACCS instance holds several
   demos (Justrite, Bodea and others), so emptying the instance would empty theirs:
   - **products** tied to the chosen stores; one other websites also sell is only taken off the
     chosen websites;
   - **categories** under a root every store using it is chosen. If that root is shared with a
     store not chosen (as `justrite_test_store`'s is with `justrite_store`'s, root 119),
     categories are left and the screen says why;
   - **customers** of a wholly chosen website, or made in a chosen store;
   - **orders** placed in a chosen store: closed off, never deleted (the one reset rule below);
   - **companies, shared catalogs, customer groups, attribute sets, attributes and website settings**
     when only the chosen stores use them (see "Nothing left behind");
   - **never** the websites, stores, store views and root categories themselves, Commerce's own
     customer groups and attributes, the public catalog, the Default attribute set, stocks and sources,
     admin users, or the integration's credential.

Emptying a whole instance is not part of reset, and is not offered at all (owner, 2026-10-30:
"clean instance" rejected).

## What has to be settled when it is built

- **What else a demo's part holds**, kind by kind (orders, invoices, cart rules, companies,
  shared catalogs), and whether Commerce deletes each over REST, only switches it off, or keeps
  it. Known so far, from the ERP work: an inventory source cannot be deleted, only switched off
  (`warehouseFix.ts`); notes on orders cannot be deleted (`erpDetach.ts`). Orders and invoices
  are the likely "keeps"; none of this is verified yet.
- **The order to delete in**: the reverse of the install order (catalog spec §0), so nothing is
  refused for still being in use.
- **What the SC is told afterwards**: exactly what could not be removed, by kind and count.

## Safety

- **The clearing cannot be undone, and says so.** It removes things no install record lists, so
  there is nothing to restore from (rule 1: what cannot be undone is stated plainly).
- It names the website it will clear, is confirmed before it runs, and is never run by an agent
  without that confirmation (rule 5). A dry run lists what it would clear and writes nothing.
- Afterwards the demo's install records are cleared, since what they list is gone.
- **The service has nothing like it**: it knows `import` and `delete` (`OPERATION_MODES`,
  `actions/constants.js`), and its "purge by commerce_instance" (`getInstalledDatapacks.js`)
  deletes its own install records, not anything in Commerce.

## Decisions recorded (owner, 2026-10-30)

1. **The unit is the STORE.** A wipe means "make this demo's part of the store clean for the next
   customer". SCs run several demos on one instance at once: some give each demo its own website,
   one colleague gives each demo its own store on a single website. So the SC picks stores;
   ticking a website ticks all of its stores; store views are shown under their store and never
   picked separately (nothing in Commerce belongs to a view except translations and the view an
   order was placed in). What a chosen store owns is judged against the WHOLE chosen set.
2. **Orders are closed, never deleted** (Commerce cannot delete an order), by the one reset rule
   below, shared with the ERP integration's reset.
3. **A clean instance is rejected**: emptying a whole instance is not offered.
4. **The claims guard is per store**: a store another local project records as its own (the store
   its recorded website and store view codes name, `resolveInstallTarget`, the accessor the guard
   always used) cannot be ticked, and the refusal names the project.

## Nothing left behind (owner, 2026-11-02)

> "It shouldn't leave anything behind."

The table the owner approved, and the rule each row became. Everything is decided from reads before
anything is written; the plan is made again at the clearing and refused if it would take more.

| Data | What Clear does | Module and rule |
|---|---|---|
| Companies | Removed when only the chosen stores use them | `wipeCompanies.ts`: found through the chosen websites' customers. Its admin and every customer in it (`GET hierarchy/{id}`) on wholly chosen websites, none listed by an install record, none with an order in a store not chosen |
| Customers in those companies | Removed with them | The company goes first (Commerce refuses an admin's delete while the company stands); the customer's delete is held back if the company's failed |
| Shared catalogs and customer groups | Removed when only the chosen stores use them, nobody landing in General | `wipeCatalogs.ts`: the groups the customers and companies going are in. Everyone in the group going, no cart rule that stays naming it. A catalog and its group are one unit. Asked again just before the delete (`removeEmptyGroup`). Never Commerce's own groups (ids 0 to 3) or the public catalog |
| Website-level store settings | Put back to the default | `wipeSettings.ts`: on wholly chosen websites, a value that differs from the Default scope's is set to it. See the gap below |
| Attributes and attribute sets | Removed if nothing else on the instance uses them | `wipeAttributes.ts`: those the products going use. No product that stays in the set (asked again before the delete, `removeEmptySet`, since Magento's schema deletes a set's products). An attribute: `is_user_defined`, not `erp_owner`, `brand` or `erp_*`, in no set that stays, tested by no cart rule that stays, carried by no product that stays. Any read that fails keeps it. Never the Default set |
| Anything another demo also uses | Stays, and the dialog names it and says why | `WipePreview.left`, each with up to three names and a reason; `WipeOutcome.left` and the sentence say it afterwards |
| Orders | Commerce cannot delete them, so they are closed, as now | Unchanged |

An install record of ANY local project, on any website, keeps a company, catalog, group, set or
attribute (`readWipeClaims`, `everyRecord`): these belong to the instance, not to a website. A website
setting a datapack or the setup guide wrote is kept too (`settingsKept`), for its own undo.

**Write order:** returns, orders; companies; customers (admins after their company); products, take-offs;
cart rules, rule take-offs; catalogs each with its group, then groups with no catalog; categories;
attribute sets; attributes; website settings. This differs from a pack's removal, which runs its
record backwards and so deletes a catalog before its company: with a company being deleted anyway,
deleting it first means nobody is ever moved to General. A write whose prerequisite failed is held back
(`WipeWrite.needs`).

**Run twice:** what failed is still tied to the stores through whoever is still there, except a catalog,
group, set or attribute whose own delete failed once its customers or products were gone. Those are
kept in a note beside the project (`wipeUnfinished.ts`, `.demo-builder/wipe-unfinished.json`), which
only widens what the next clearing of the same stores looks at; every rule still applies.

### What Commerce's settings API cannot do

Measured and read 2026-11-02 ([Adobe's page](https://developer.adobe.com/commerce/webapi/rest/saas-integrations/system-config/);
`GET system/config?scope=website&scopeCode=justrite_test_website` live):

- **It cannot put a value back to inherited.** `PUT` needs a string `value` and there is no delete.
  So a value set back reads the same as the default but stays the website's own row: a later change to
  the default does not reach it. Only "Use Default Value" in the Admin clears it. The dialog and the
  result both say so.
- **It cannot list what a website set itself.** With no path filter it answers every path (943 on
  the test website) with the value in force, inherited ones included. So only a value that DIFFERS
  from the Default scope's can be told; one the same needs nothing.
- **What stays, counted and named:** paths under `web/` or `admin/` and credentials (`isOffLimitsSetting`,
  what a pack may not set), a value that reads as masked or encrypted, one with no value at the Default
  scope (writing "" or "0" would be a guess).

### Which reads and writes are confirmed (2026-11-02)

The test website holds no customers and no products, so none of the B2B or attribute reads could be
captured there; reads outside it were not made (the owner's limit for this work).

| Read or write | Endpoint and field | Confirmed? |
|---|---|---|
| a website's settings, in pages | `GET system/config?scope=website&scopeCode=`, `searchCriteria[pageSize]`, `[currentPage]`: `items[path,value,scope,scope_code]`, `total_count` | yes, live 2026-11-02, pages 1, 200 and 471 |
| the default's | the same with `scope=default` | Adobe's page; not read from here |
| set a website setting | `configFix`, `PUT system/config` `{ items: [{ path, value, scope: "website", scope_code }] }`, read `errors` | Adobe's page's example; a default-scope value live 2026-10-10; a website value **no** |
| a company | `GET company/{id}`: `super_user_id`, `customer_group_id`, `company_name` | yes, 2026-10-30 (`COMPANY_27_DB08`) |
| who is in it | `GET hierarchy/{id}` | yes, 2026-10-30 (`HIERARCHY_28_DB08`) |
| a customer's company and group | `GET customers/search`: `extension_attributes.company_attributes.company_id`, `group_id` | the first yes (2026-10-30); `group_id` in a search answer **no** (in `GET customers/{id}` yes) |
| the catalogs | `GET sharedCatalog`: `id`, `name`, `type`, `customer_group_id` | yes, 2026-09-28, 2026-10-29 |
| a group's name | `GET customerGroups/{id}`: `code` | yes, 2026-09-28 |
| who uses a group | `GET customers/search` `group_id` eq, `GET company` `customer_group_id` eq | **no**; every answer filtered again here |
| delete a company, customer, catalog, group | `DELETE company/{id}`, `customers/{id}`, `sharedCatalog/{id}`, `customerGroups/{id}` | the routes yes (2026-10-30); a company's delete followed by its admin's in this order **no** |
| every set, what it holds | `GET products/attribute-sets/sets/list`, `GET products/attribute-sets/{id}/attributes`: `attribute_code` | yes (`loadStoreSets`, `erpOwnerAttributeSets`) |
| the products in a set | `GET products`, `attribute_set_id` eq | **no** (the pack's own removal uses it) |
| a product's set and attributes in a list | `attribute_set_id`, `custom_attributes[attribute_code]` under `fields=` | **no** |
| an attribute | `GET products/attributes/{code}`: `is_user_defined` | yes |
| who carries an attribute | `GET products`, the code `notnull`, value 1 | **no**, and it may answer for the default scope only. A refusal keeps the attribute; a false empty is caught by the set rule |
| delete a set, an attribute | `DELETE products/attribute-sets/{id}`, `DELETE products/attributes/{code}` | **no** (the pack's own removal uses them) |

### Tests

`wipeCompanies.test.ts`, `wipeCatalogs.test.ts`, `wipeAttributes.test.ts`, `wipeSettings.test.ts`,
`wipeUnfinished.test.ts` (one suite per decision, the case that stays beside each that goes) and
`wipeRun-instance.test.ts` (the order and arguments of the writes, what is held back, a second
clearing). The fake (`wipe.testUtils.ts`) does what Commerce was measured doing: an admin's delete
refused with the captured message while the company stands, and a catalog's delete taking its group
and moving everyone in it to group 1, counted in `movedToGeneral`, which every test leaves empty.
Fixtures: `tests/helpers/commerceWipeInstanceFixtures.ts`.

### Live proof (owner's call; `scratch-1028`, `justrite_test_website` / `justrite_test_store` ONLY)

Nothing here can be undone, so the clearing only ever meets things the test made itself. Every step
reads first; stop if `check_demo_data` lists anything the test did not make.

1. **Read-only.** `check_demo_data` for the test store. Today the website holds no customers or products,
   so expect no company, catalog, set or attribute to remove. **Read `data.preview.settings`: every path
   and value it would set.** The owner reads that list before anything else, since the test website's
   settings were never recorded.
2. **Prove the unconfirmed reads.** `run_commerce_rest`: `system/config?scope=default&searchCriteria[pageSize]=5`;
   a `notnull` search on an attribute a real product carries, as a positive control; `customers/search` on
   `group_id` for a group a real customer is in. Record the answers as fixtures.
3. **Make throwaways on the test website only:** an attribute `zz_clear_test`, a set `ZZ Clear Test` holding
   it, one product in that set, group `ZZ Clear Group`, catalog `ZZ Clear Catalog` on it, an admin and a
   buyer on the test website, company `ZZ Clear Co` on the group, and one website setting set
   (`sales/totals_sort/tax`, its default's value + 1).
4. **Keeps:** give another website a throwaway customer in `ZZ Clear Group`. `check_demo_data`: the catalog
   stays, named, and so does the company if that customer is in it. Delete that customer by hand.
5. **Clear:** `check_demo_data`, then `clear_demo_data` with its token. Expected order in the debug log:
   company, customers, product, catalog, group, set, attribute, setting. Read `GET customers/{buyer}` as it
   runs if possible: its group must never read 1 before it is deleted.
6. **Back to zero:** `check_demo_data` answers `total` 0 with the same `left` as step 1 (settings included).
   Every other demo reads as before: `GET products` and `customers/search` with Justrite's, Bodea's, BJU's and
   CitiSignal's `website_id`, the same `total_count` as at step 1. What does not return: the setting stays
   the website's own row, holding the default's value, until "Use Default Value" in the Admin.
7. **A failed write:** not provable live without breaking something; covered by tests.

### Open decisions (recommendation first)

1. **A set, attribute, catalog or group nothing ties to the chosen stores is not looked at, and so not
   reported.** The owner's table says "if nothing else on the instance uses them"; an empty set may be
   another demo's about to be used, so only those the products or customers going use are judged.
   Recommended: keep. The other reading would sweep every unused one on the instance.
2. **A cart rule that stays and names the group keeps the group.** Commerce often lists every group on a
   rule, so another demo's rule may keep a group it never really uses. Recommended: keep and name it,
   the safe direction.
3. **An attribute held by the Default set stays**, by the rule. Packs that add attributes to Default
   (Bodea's `cs_format`) will keep them, named. Recommended: keep.
4. **A customer in two companies** is not handled: `company_attributes` names one. Commerce's refusal is what
   the SC would see. Recommended: wait for a real case.
5. **Tier prices on another demo's products naming a group going** are not checked (as step 08). Commerce would
   drop those prices with the group.
6. **An ERP keeps its copy of a company or customer the clearing removed:** the refresh after a clearing adds
   and updates, it does not delete. Customers already worked this way. Recommended: file for the ERP work.

## One reset rule (shared with the ERP reset)

The same rule closes orders in the demo-data wipe here and in the ERP integration's reset
(`commerce-erp-integration`, branch feature/one-reset-rule, 0a10b95). **Changed 2026-11-11**
(`.rptc/plans/erp-order-close/overview.md`): every order a Clear touches ends Canceled or Closed.
This side has the new rule (step 1 of that plan); the integration's copy still has the old one
until its step 2. In plain words, as it is now here:

- **The note comes first.** Every order the run touches is noted before anything else is written
  to it, its returns included, because the integration skips the events of an order whose history
  carries "by the demo reset on". The words are decided from the plan; when Commerce's answer then
  differs, one correcting note is added.
- **An order with nothing invoiced and nothing shipped, in a state Commerce can cancel, is
  canceled**, noted "Canceled by the demo reset on <day>." A refused cancel gets a second note,
  "Left open by the demo reset on <day>: …", and is counted as left open.
- **Any other order that is not already Canceled or Closed, and not in payment review, is invoiced
  in full (what is not yet invoiced), then everything invoiced is refunded with an offline credit
  memo**, so Commerce closes it. Noted "Refunded and closed by the demo reset on <day>."; when it
  does not read Closed afterwards, a second note, "Refunded the invoiced items by the demo reset on
  <day>." Both count as refunded. This replaces "shipped but never invoiced: left open" and "partly
  invoiced: refunded, not closed".
- **An order in payment review is left open with a note and counted** (Commerce refuses an invoice
  and a credit memo there). So is one with nothing to cancel, invoice or refund.
- **Its returns are set Closed** inside the order's own work, after its note: the return's header
  as read, status "closed", no items (Commerce refuses an approved item sent back, even unchanged),
  then read back. A return Commerce keeps open stops that order; the next run finishes it.
- **Run it twice and nothing new happens; a stopped run is finished**: an order that is Canceled or
  Closed, or whose history carries the left-open note, is left, counted as already closed. One
  carrying another reset note but not closed (a run stopped after its note) is closed again,
  without a second leading note.
- An order On Hold is released after its note and before the cancel or invoice, since Commerce
  cancels and refunds nothing on hold.

The counts carry the ERP reset's names: `cancelled`, `refunded`, `commented` (left open with a
note), `alreadyClosed`, `returnsClosed`, `failed`. One wording differs on purpose: the note on an
order left open. The ERP reset's says its ERP documents were removed; a wipe removes none, so its
note says "Left open by the demo reset on <day>: Commerce can neither cancel nor refund it."

Where each part comes from: the integration's `src/lib/reset-rule.js` (`cancellableByReset`,
`UNCANCELLABLE_STATES`, `refundOf`, `resetStepOf`, the notes) and `src/lib/close-orders.js`
(`closeOne`, `settle`, `closeReturn`); the refund route is Adobe's "Issues an offline refund"
(`POST order/{orderId}/refund`, tutorial `rest/tutorials/orders/order-issue-refund`, ACCS reference
`PostV1OrderOrderIdRefund`), which has no `isOnline` field, so none is sent; the return close is
`PUT returns/{id}` (`PutV1ReturnsId`). The seven example orders both repositories test, named the
same: `tests/helpers/resetRuleOrders.ts` here, `test/lib/reset-rule-orders.js` there.

## One action, ERP included (owner, 2026-10-30)

> "You wanna wipe. That should wipe. I shouldn't have to wipe things in two separate systems,
> especially when the ERP is expected to be transient and can be easily populated from absolutely
> nothing."

Measured live the same day: on this instance JustRite's ERP integration (project `justrite`,
`erp-integration`) answers `structure_owns: "all"` and `orders_send: true` for every website,
`justrite_test_website` included. So the test store's orders go to JustRite's ERP, and the wipe's
own cancel or refund would be passed on to it by the integration's order handlers (it stays silent
only for orders it marked closed itself, `lib/order-parts.js markClosedByReset`).

> **Changed 2026-11-11** (erp-order-close step 5, owner: Commerce is the source system): points 2
> to 4 below are as built then. The wipe now closes EVERY order of the chosen stores itself, ERP-routed
> ones included, by the one reset rule; the integration recognises the reset note and sends nothing
> on. AFTER every Commerce write, the integration is asked to bring its ERP in line
> (`erp/close-orders` for the routed stores: with every order already closed it only forgets them and
> has its ERPs remove them), then the refill. Held (must be updated, could not be asked): the orders
> are closed anyway and the ERP step is skipped. A held, failed or partial ERP step is an ERP problem
> (`outcome.erp.broughtInLine` false, `problem` why), never orders that failed to close; the
> integration's counts are not merged. Plan line: "The ERP integration (JustRite) serves these
> stores: its ERP is brought in line with Commerce after the clearing." Stage "Updating the ERP"
> runs after the clearing. The live test below still describes the old flow.

**What a wipe now does**, at every door (both tools, the Data Installer's "Clear demo data",
reset's second question):

1. **Finds the ERP integration serving the instance** from ANY local project, this one included
   (`wipeErpDeps.findWipeErp`): the deployed ERP integration of a project on the same Commerce
   instance, matched as the one-per-instance add refusal matches it (`erpIntegrationHolder`). Its
   project being another one is fine; the per-store claims guard still applies to the stores.
2. **Asks it which chosen websites send orders to an ERP** (`GET erp/settings?websites=`,
   `orders_send`) and whether its deployment closes by store (`GET erp/status`,
   `closesOrdersByStore`). The orders of those websites' chosen stores, and their returns, are not
   the wipe's own: the list carries one line for them, counted and named ("2 orders are handled by
   the ERP integration (JustRite): they will be closed there, removed from its ERP, and the ERP
   refreshed.").
3. **Clearing: the integration closes EVERY order of those stores first** (`POST erp/close-orders`
   with their store codes, followed by its run id when the answer is cut off; commerce-erp-integration
   a2556c2 + 1f6de21). Every order, not only the ones an ERP holds: one it never got would be sent as
   new by the first save to it. Each ERP that held one removes its documents for them
   (`admin/remove-orders`, demo-erp contract 23). The wipe runs no order rule of its own for those
   stores; it does its other writes as before, then **the integration's ERPs are filled again from
   Commerce** (`fillEveryErp`, what the ERP reset runs after its wipe). The note merges the
   integration's counts with the wipe's and names the ERPs: "Removed nothing from the store
   justrite_test_store. Canceled 1 order and refunded 1 order. Closed 1 return. 2 of the orders were
   closed through the ERP integration (JustRite), and removed from Justrite ERP. JustRite's ERP was
   refreshed from Commerce." An ERP that kept its copies is named with why.
4. **A deployment that cannot close by store, or cannot be asked, is never called**: those orders
   are left open, uncounted, and the line says why with the update to run ("... are left open: it
   must be updated before a wipe can close them: open the project justrite and update
   erp-integration (Update on its card, or update_integration), then check again."). The rest of the
   wipe goes ahead. One that cannot be asked holds every chosen website's orders (the safe way).
5. **Never the Admin website**: Commerce answers its own Admin scope (website `admin`, id 0, store
   `default`, view id 0) beside the real ones; `readWipeStructure` drops it, so the picker never
   offers it and naming it is "The store has no website admin."

The token covers the ERP part: a clearing that would now have the integration close an order the
list did not (it was held, or was the wipe's own) writes nothing and offers the new list.

### Reuse

| Piece | | Where |
|---|---|---|
| Finding the integration on the same instance | REUSED: `erpIntegrationHolder`; `erpIntegrationIdOf` split out of its `runsErpIntegration` | `app-builder/services/erpIntegrationOnSameCommerce.ts` |
| The other projects | REUSED: the list the claims guard already reads (`loadOtherProjects`) | `core/state/otherProjects.ts` |
| The client and its run-and-poll | REUSED: `ErpIntegrationClient`, one method added (`closeOrders`, for `erp/close-orders`). Its POST-then-follow is now one private helper shared with `detach` and `publishPrices` (the third copy of the same eleven lines) | `app-builder/services/erpIntegrationClient.ts`, `erpActionRun.ts` |
| The sign-in its actions take | REUSED: `resolveAppManagementAuth`, as `openErpCall` | `project-creation/services/appBuilderComponentRunnerDeps.ts` |
| The routing read | REUSED: `resolvedSettings` (the fill's read) | `erpIntegrationClient.ts` |
| The refill | REUSED: `fillEveryErp`, `summarizeFills`, `fillWarnings` | `project-creation/services/erpFillForProject.ts` |
| The counts' names | REUSED: the reset's (`cancelled`, `refunded`, `commented`, `alreadyClosed`, `returnsClosed`, `failed`), merged into `OrderCounts` | `wipeRun.ts` |
| Progress | REUSED: the wipe's progress window; two stages added (`closingErpOrders`, `refreshingErp`) | `core/utils/datapackStages.ts` |
| The list line | REUSED: the modal's `FactList` and reset's question, one line each | `clearDemoDataWords.ts`, `edsResetOtherData.ts` |
| NEW | `wipeErp.ts` (routing, the split, the line, the close and refill, the sentence), `wipeErpDeps.ts` (the composition) | `services/demoDataWipe/` |

### Which reads and calls are confirmed

| Read or call | Endpoint and field | Confirmed? |
|---|---|---|
| which websites send orders | `GET erp/settings?websites=`, `websites.<code>.orders_send` (else `default`) | yes: JustRite answered `true` for every website (`get_erp_settings`, 2026-10-30); the field is what the integration's `order-sync.js readyToSend` reads |
| whether it closes by store | `GET erp/status`, `closesOrdersByStore` | from the integration's code (`actions/erp/status`, a2556c2); **not yet from a deployment** |
| the close | `POST erp/close-orders` `{ run, stores: [<store group code>] }`, `GET erp/close-orders?run=` | from the integration's action and README (a2556c2); **not yet from a deployment** |
| its answer | `{ scope, closed { cancelled, refunded, commented, alreadyClosed, returnsClosed, partsRemoved, failed[{ orderId, error }] }, touched[{ orderId, outcome }], orders, holds, erpRemoved { <listId>: { removed, notFound } \| "unsupported" \| { failed } } }` | the shape the integration's box test pins (`test/box/close-store-orders.test.js`, 1f6de21), copied into `erpWipeFixtures.ts`; **not yet from a deployment** |
| the refill | `fillEveryErp` (Commerce reads, `POST admin/import`, `erp/keymap`, `erp/prices`) | yes, the ERP reset's own fill (live) |
| the Admin scope in the structure reads | `store/websites` `id 0`, `store/storeGroups` `website_id 0` | the website and store yes (offered on scratch-1028); the view id 0 **no** |

### Open decisions (recommendation first)

1. **Settled by the integration (a2556c2):** the close is its own action, `erp/close-orders`, not a
   flag on `erp/detach` (detach also undoes the ledger and clears ERP numbers instance-wide). It
   closes every order of the named stores and removes them from each ERP that held them.
2. **The integration is called for a served store even when it has no open orders** (closed ones
   are still forgotten and taken out of the ERP). Recommended: keep; it is one call, and a store
   with no orders at all closes nothing.
3. **The refresh is a fill, not a wipe and a fill.** The close already took the stores' orders out
   of the ERP; a fill adds and updates. An `admin/wipe` first would also remove other websites'
   live orders (JustRite's). Confirmed right by the integration's author, 2026-10-30.
4. **A close the integration could not make does not stop the wipe's own writes** (the ERP reset
   stops before its wipe instead). Recommended: keep. The wipe's Commerce deletes do not depend on
   those orders, the failed ones are named, and a second wipe closes them (run twice is safe).
5. **The refresh runs on every clearing of a routed store**, open orders or not, and fills every
   ERP the integration serves (the fill has no website scope). Recommended: keep; it is safe and
   adds the fill's minutes.
6. **The update line sends the SC to the integration's project**: `update_integration` acts on the
   open project. Recommended: later, let it name a project.

### Tests

`wipeErp.test.ts` (14: routing, the plan's ERP part, the clearing's order of calls and merged
counts, no order rule of the wipe's own for a served store, an ERP that kept its copies, a served
store with only closed orders, a failed close, a failed refill, a held integration never called,
the token), `wipeErpDeps.test.ts`
(4: found in another project or this one, none elsewhere or undeployed, no sign-in asks nothing),
`erpIntegrationClient.test.ts` (+2: the close's body and answer, and its follow by run id once
status says `closesOrdersByStore`),
`erpIntegrationOnSameCommerce.test.ts` (+1), `demoDataHandlers.test.ts` (+3: the Admin website,
the ERP asked with every local project, the clearing through it), `edsResetOtherData.test.ts`
(+2), `ClearDemoDataModal.test.tsx` (+2). Typed answers in `tests/helpers/erpWipeFixtures.ts`. The reset
suites' shared mock (`edsResetUI.testUtils.ts`) now reads its two auth fakes through an arrow: the
reset reaches `edsHelpers` through the ERP link while that file is still loading.

## What was built (2026-10-30)

**One plan, read-only, then the same plan carried out.** `planWipe` (`services/demoDataWipe/wipePlan.ts`)
reads the chosen stores and decides; `clearShown` (`wipeRun.ts`) makes the plan again and writes only
when the new plan takes nothing the shown one did not (things gone or closed since are fine: the
pack's removal may run in between). The SC or the agent always sees the list first.

| Module | Job |
|---|---|
| `wipeScope.ts` (new) | the chosen stores against the store structure: wholly / partly chosen websites, cleared / shared / other demos' roots, the views; the picker's tree (`choicesOf`) |
| `wipeReads.ts` | the reads (table below) |
| `wipeProducts.ts`, `wipeCustomers.ts` (new) | the product and customer rules, split out of `wipePlan.ts` to keep it under its size |
| `wipeOrders.ts`, `wipeOrderRun.ts` (new) | the one reset rule: decide, then write |
| `wipePlan.ts`, `wipeRun.ts` | generalised from one website to the set: same token, same "refuse if the store would now clear more" |
| `wipeClaims.ts` | the guard, per store |

| Kind | Done | Left, and the reason said |
|---|---|---|
| products | every website it is on wholly chosen, or partly chosen with every category link under a cleared root (a configurable's child judged by its parent): deleted. Some of its websites chosen: taken off those | no category, or only shared roots: "which demo they belong to can't be told". In a store not chosen's own categories: left. Variant of nothing deleted; fields not answered: left |
| categories | under a root every store using it is chosen, deepest first | under a root a store not chosen shares, naming that store; holding a category Demo Builder installed |
| customers | of a wholly chosen website; on a partly chosen one, made in a chosen store's view (`store_id`, else `created_in` by the view's name) with no order in a store not chosen | made in, or ordering from, a store not chosen; made in the Admin (store not said); in a company that stays ("Nothing left behind") |
| orders, returns | placed in a chosen store's views, and those orders' returns: the one reset rule | already Canceled, Closed or noted by a reset (counted, nothing written) |

Writes go through `projectCommerce` (Store: `all`) behind `orgGuard`; the order and return writes
name their own order or return id. Order of writes: "Nothing left behind", above. A refusal is
counted and named; the rest carry on.

**Human surfaces.** (1) The Data Installer's catalog header: "Clear demo data" opens a modal with
the store tree (websites, their stores, each store's views on its row; claimed stores locked with
the sentence naming the project), checks as the SC ticks, lists what clearing would do (orders
included: "1 to cancel, 2 to refund, 1 to leave open with a note, 1 return to close"), and the red "Clear N things" runs it in
the screen's progress window. (2) Project reset's second question, for the project's own store,
now names the store and its orders.

**Agent surface.** No new tools. `check_demo_data` and `clear_demo_data` take
`stores: [{ websiteCode, storeCode? }]` in place of `websiteCode` (removed, not kept alongside).
The check answers `{ choices, preview? , refused? }`; `stores: []` answers the choices alone. The
consent names the stores and says orders are canceled or refunded; narration "Clearing
justrite_test_store". Battery prompt `reset-demo-leave-store-empty` reworded to the test store.

### Reuse

| Piece | | Where |
|---|---|---|
| The store tree's data | REUSED: the three lists `storeScopeOf` and store discovery read, in `CommerceStoreStructure` | `wipeReads.readWipeStructure`, `types/commerceStore.ts` |
| The store picker's rows | REUSED: `CheckboxRow`, given `isIndeterminate` for a partly ticked website | `core/ui/components/selection/CheckboxRow.tsx` |
| The picker itself | NEW `StorePickList.tsx`: the Business Structure pickers (`StoreSelectionRow` / `useStoreDiscovery`) choose ONE website, store and view through the wizard's discovery with form credentials; the ERP "Assign products" list is a searchable product table | `data-installer/ui/components/` |
| The planner and runner | REUSED, generalised in place | `wipePlan.ts`, `wipeRun.ts` |
| The claims guard, install records, container rule | REUSED | `wipeClaims.ts`, `installRecord.ts`, `resolveInstallTarget` |
| The order rule, its writes and counts | MIRRORED line for line from the ERP integration's one-reset-rule branch (an App Builder app, not importable) | `reset-rule.js`, `close-orders.js` |
| Its seven example orders | SHARED: the same cases, names and bodies in both repositories | `tests/helpers/resetRuleOrders.ts` |
| The list | REUSED: `ui/Modal`, `FactList`, `LeadText`, `SectionLabel`, `InlineNotice`, `StatusDisplay`, `LoadingDisplay` | `core/ui/components/` |
| Progress | REUSED: `OperationProgressModal` through `useOperationRunner`, as `useSaveStoreChanges`; stages in `DATAPACK_STAGES` | `useClearDemoData.tsx` |
| The "in" search | REUSED: `filterIn` beside `filterBy`; `storeCopies.ts`'s own copy now uses it | `b2bReads.ts` |

### Which reads and writes are confirmed against a captured real response

| Read or write | Endpoint and field | Confirmed? |
|---|---|---|
| the structure | `GET store/websites`, `store/storeGroups`, `store/storeViews` | yes, by `storeScopeOf` and store discovery |
| a website's products | `GET products`, `website_id` eq, `website_ids` | yes (Assign products, 2026-10-19) |
| | `visibility`, `configurable_product_links`, `category_links` in a LIST answer | **no**. Missing, the product is left |
| the category tree | `GET categories/list` (`id`, `name`, `path`) | yes, by `listCategoryLabels` |
| a website's customers | `GET customers/search`, `website_id` eq | **no** (also filtered here) |
| | `store_id`, `created_in` | **no** |
| | `extension_attributes.company_attributes.company_id` | yes (2026-10-30) |
| the stores' orders | `GET orders`, `store_id` in, with `items[qty_*]`, `status_histories[comment]`, `base_shipping_invoiced/refunded` | **no** (the integration reads the same fields from `GET orders/{id}`) |
| where customers ordered | `GET orders`, `customer_id` in, `store_id` | **no** |
| those orders' returns | `GET returns`, `order_id` in; `GET returns/{id}` | **no** from here (the integration reads `returns` by `order_id`) |
| cancel, unhold, note | `POST orders/{id}/cancel`, `/unhold`, `/comments` | the integration's, live; from here **no** |
| refund | `POST order/{id}/refund`, then `GET orders/{id}` (`state`) | **no**; the integration's measured its answer (the credit memo id) 2026-10-02 |
| close a return | `PUT returns/{id}` `{ rmaDataObject }`, header only, `items: []`, then read back | **no** from here; the integration measured the shape 2026-10-02 |
| take a product off a website | `DELETE products/{sku}/websites/{websiteId}` | **no** |
| delete a customer, product, category | `DELETE customers/{id}`, `products/{sku}`, `categories/{id}` | the routes yes |

### Decisions from the first build, still standing

1. A second question on reset, not a box (a VS Code modal has no checkbox); Esc keeps.
2. Tools of their own (`check_demo_data`, `clear_demo_data`), not a flag on `reset_project`.
3. B2B: superseded 2026-11-02 by "Nothing left behind".
5. Several projects on one website: every local project's records on the chosen websites are read
   and what any lists is left.
6. The headless reset does not ask. Recommended: ask there too, later.
7. Install records stay as they are: the clearing never takes what they list.

### Open decisions (recommendation first)

1. **Where the picker lives.** Built: a "Clear demo data" link in the Data Installer's catalog
   header. Recommended: keep; it is where datapacks are removed.
2. **The picker opens with nothing ticked**, not the project's own store. Recommended: keep (the
   agent's check still defaults to the project's own).
3. **The note on an order left open** says what the wipe did, not the ERP reset's "documents
   removed" (a wipe removes none). Recommended: keep the two wordings apart; both carry
   "by the demo reset on", so run-twice works across both.
4. **Returns are read by the chosen stores' orders** (`order_id`), as the ERP reset reads them,
   not by the return's own `store_id`. Recommended: keep.
5. **Customers of a wholly chosen website are removed whatever their orders** (the owner's rule),
   including orders on other websites under global account sharing. Recommended: keep.
6. **A product on a wholly chosen website is deleted even when its categories are in a shared
   root** (the owner's rule, read literally). Recommended: keep.
7. **Retry in the progress window resends a spent token** and is refused "no longer known".
   Recommended: a small follow-up to re-check instead.
8. **A store whose recorded view is gone** claims every store of its website (the safe direction).
   Recommended: keep.
9. **The modal's red button renders as the secondary style** (`ui/Modal` maps `negative` to
   secondary for every caller). Recommended: a Modal-wide change, not this step.
10. Still open from the first build: the headless reset (6) above.

### Tests

`wipeScope.test.ts` (11), `wipePlan.test.ts` (16), `wipeOrders.test.ts` (18, the seven rule
examples by name first), `wipeRun.test.ts` (5), `wipeClaims.test.ts` (11), `demoDataHandlers.test.ts`
(16), `edsResetOtherData.test.ts` (11), `ClearDemoDataModal.test.tsx` (7), `CheckboxRow.test.tsx`
(2), `consentText.test.ts` (2), over typed fixtures (`commerceWipeFixtures.ts`, with Bodea given a
second store, invented, to have a website only partly chosen; `resetRuleOrders.ts`).

### Live test (owner's call; `scratch-1028`, `justrite_test_website` / `justrite_test_store` ONLY)

Nothing here can be undone, so the clearing only ever meets things the test made itself.

0. **Read-only, for the owner to review before anything is written.** `check_demo_data` with
   `stores: [{ websiteCode: justrite_test_website, storeCode: justrite_test_store }]`. Expected:
   `choices` lists `justrite_store` with `claimedBy` naming JustRite (if that project is on this
   machine); every category under root 119 in `left` ("which the store justrite_store (website
   justrite) also shows"); `takenOff` naming any product JustRite also sells; `orders` counting the
   test view's orders. Then confirm the unconfirmed fields, read-only, and record the answers as
   typed fixtures: `run_commerce_rest GET` `products` (the test website's `website_id`, page size 5,
   `fields=items[sku,visibility,extension_attributes[website_ids,configurable_product_links,category_links]]`);
   `customers/search` (same filter, page size 5, `items[id,store_id,created_in]`); `orders`
   (`store_id` in the test view's id, page size 5, the wipe's fields); `returns` (`store_id` in, page
   size 5). **Stop. The owner reads the list.** If `total` is not 0, the test store holds things
   nobody made for this test: the clearing is not run until the owner says those may go.
1. With `total` 0 (or the owner's go): make throwaway things in the test store only: product
   `zz-db10-only` (the test website only, visibility 4, in a category under no shared root, or
   none, since the website is wholly chosen), customer `db10.shopper@example.com` in the test view,
   and, if the owner agrees to orders, two orders placed on the test store (one left pending, one
   invoiced with `POST order/{id}/invoice`). `check_demo_data`: `remove` names the product and the
   customer; `orders` says "1 to cancel, 1 to refund".
2. Make one more customer, `db10.late@example.com`, then `clear_demo_data` with the step 1 token:
   refused, "The store changed since the list was made", nothing written.
3. `check_demo_data` again, then `clear_demo_data` with the new token. Expected note: "Removed 1
   product and 2 customers from the store justrite_test_store. Canceled 1 order and refunded 1
   order." In the Admin: the
   pending order Canceled, the invoiced one Closed with a credit memo, each with its note.
4. **Back to zero:** `check_demo_data` answers `total` 0 with the same `left` as step 0: the two
   orders now carry a reset's note, so they count as handled. JustRite's website reads as before
   (`GET products` with JustRite's `website_id`, the same `total_count` as at step 0). What does not
   return: the two orders and the credit memo stay as history, closed (Commerce cannot delete them).
5. Not run live: taking a shared product off a website, a return, a website only partly chosen, and
   the reset question (scratch-1028's own store is JustRite's).

### Live test, ERP included (owner's call; same store only; JustRite's integration deployed from `feature/one-reset-rule` at 1f6de21 or later)

Precondition: that integration, and JustRite's demo-erp at contract 23 (`admin/remove-orders`), are
deployed to JustRite (owner's go: a deploy to a live demo). Until then the wipe answers the held
line and leaves the test store's orders open, which is itself step 1's check.

1. **Before the deploy, read-only.** `check_demo_data` for `justrite_test_store`: `preview.erp.held`
   names the update, `preview.erp.orders` counts the test store's open orders, and none of them is in
   `preview.orders`. The store list has no `admin` website.
2. **After the deploy**: `get_erp_status` (or `GET erp/status`) answers `closesOrdersByStore: true`.
   Place two orders on the test store (one left pending, one invoiced), then `check_demo_data`:
   `preview.erp.line` is "2 orders are handled by the ERP integration (JustRite): they will be closed
   there, removed from its ERP, and the ERP refreshed."; `preview.orders` counts none.
3. `clear_demo_data` with that token. Expected: the progress window shows "Closing orders in the ERP"
   first and "Refreshing the ERP" last; the note says "Canceled 1 order and refunded 1 order ... 2 of
   the orders were closed through the ERP integration (JustRite), and removed from Justrite ERP.
   JustRite's ERP was refreshed from Commerce." In the Admin: the pending order Canceled, the invoiced one Closed with a credit memo,
   each with the reset's note. `get_erp_order_trace` for each: the ERP was not told to cancel or
   refund (the integration marked them closed first).
4. **Back to zero:** `check_demo_data` answers `total` 0 and `preview.erp.orders.count` 0 (both
   orders carry a reset's note). JustRite's website reads as before (`GET products` with its
   `website_id`, the same `total_count`), and its ERP holds JustRite's records (`get_erp_status`).
   Justrite ERP no longer lists the two orders (`run_erp_rest GET orders`). What does not return:
   the two orders and the credit memo stay as history, closed, in Commerce; Commerce cannot delete
   an order.
