# Step 10: reset clears a demo's part of the store

Status: **built 2026-10-30, widened the same day to a chosen set of stores with their orders
closed; not yet live.** B2B and settings are still left (decision 3 of the first build). Decided
by the owner, 2026-10-27 and 2026-10-30.

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
   - **never** anything the instance shares (product attributes, attribute sets), the websites,
     stores, store views and root categories themselves, admin users, or the integration's
     credential. A new pack reuses an attribute that is already there, so leaving them blocks nothing.

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

## One reset rule (shared with the ERP reset)

The same rule closes orders in the demo-data wipe here and in the ERP integration's reset
(`commerce-erp-integration`, branch feature/one-reset-rule, 0a10b95). In plain words:

- **An order with nothing invoiced and nothing shipped, in a state Commerce can cancel, is
  canceled**, then noted "Canceled by the demo reset on <day>."
- **Any other order that is not already Canceled or Closed has what is invoiced refunded with an
  offline credit memo** (every invoiced line and the invoiced shipping). The order is read back:
  Closed, it is noted "Refunded and closed by the demo reset on <day>."; still open (partly
  invoiced), "Refunded the invoiced items by the demo reset on <day>." Both count as refunded.
- **An order Commerce can neither cancel nor refund is left open with a note and counted**: one
  shipped but never invoiced (nothing shipped is canceled), or one in payment review (Commerce
  refuses a credit memo there). A refused cancel ends the same way.
- **Its returns are set Closed**: the return's header as read, status "closed", no items (Commerce
  refuses an approved item sent back, even unchanged), then read back.
- **Run it twice and nothing new happens**: an order whose history already carries "by the demo
  reset on" was handled before and is left, counted as already closed.
- An order On Hold is released first, since Commerce cancels and refunds nothing on hold.

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
| customers | of a wholly chosen website; on a partly chosen one, made in a chosen store's view (`store_id`, else `created_in` by the view's name) with no order in a store not chosen | made in, or ordering from, a store not chosen; made in the Admin (store not said); in a B2B company |
| orders, returns | placed in a chosen store's views, and those orders' returns: the one reset rule | already Canceled, Closed or noted by a reset (counted, nothing written) |

Writes go through `projectCommerce` (Store: `all`) behind `orgGuard`; the order and return writes
name their own order or return id. Order of writes: returns, orders, customers, products, take-offs,
categories. A refusal is counted and named; the rest carry on.

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
3. B2B is not cleared (companies, shared catalogs and customer groups are store-wide units).
   Recommended next: clear a company whose admin and members are all the chosen stores' customers,
   with its catalog and group, only when no other store's customer is in the group.
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
10. Still open from the first build: B2B (3) and the headless reset (6) above.

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
