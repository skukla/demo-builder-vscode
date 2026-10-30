# Step 10: reset clears a demo's part of the store

Status: **built 2026-10-30, not yet live** (products, categories and customers; B2B, orders and
settings are left, decision 3 below). Decided by the owner, 2026-10-27.

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
3. **It only ever clears this demo's part of the store.** The owner's one ACCS instance holds
   several demos (Justrite, Bodea and others), so emptying the instance would empty theirs:
   - **products** on this demo's website; one another website also sells is only taken off this
     website;
   - **categories** under this demo's own root category. If that root is shared with another
     store (as `justrite_test_website`'s is with Justrite's, root 119), categories are left and
     the screen says why;
   - **customers** of this demo's website;
   - **never** anything the instance shares (product attributes, attribute sets), the websites,
     stores and root categories themselves, admin users, or the integration's credential. A
     new pack reuses an attribute that is already there, so leaving them blocks nothing.

Emptying a whole instance is not part of reset. If it is ever offered, it is its own action with
the strongest warning.

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

## Agent surface

Names are proposed; fixed when built.

| Tool | New or changed | Read or write | Chat wording | Dialog |
|---|---|---|---|---|
| `check_demo_data` | new: what Demo Builder installed in this demo's part of the store, and what else is there, by kind with counts | read | "Checking this demo's store data" | none |
| `reset_project` | takes "also clear the data Demo Builder did not install", off unless asked | write | unchanged | names the website it will clear, and says it cannot be undone |

**Lean answers:** `check_demo_data` answers counts per kind, never the objects. **Battery
prompt:** "Reset this demo and leave its store empty", expecting `check_demo_data` then
`reset_project` with the clearing asked for, and the agent asking the user first. Traced, then
`ai-coverage-scan`.

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| The reset confirmation | Project reset's existing confirmation and progress | `edsResetSampleData.ts`, `OperationProgressModal` |
| The box | The house checkbox row | `CheckboxRow` |
| Which website, store view and root | The same lookup the engine and Assign products use | `storeScopeOf` |
| Removing what Demo Builder installed | The engine's removal | `removePack` (`runPack.ts`) |
| Switching off a source | The ERP warehouse step's switch | `setSourceEnabled` |

## What was built (2026-10-30)

**One plan, read-only, then the same plan carried out.** `planWipe` (`services/demoDataWipe/wipePlan.ts`)
reads one website and decides; `clearShown` (`wipeRun.ts`) makes the plan again and writes only when
the new plan takes nothing the shown one did not (things gone since are fine: the pack's removal may
run in between). The SC or the agent always sees the list first.

| Kind | Removed | Left, and the reason said |
|---|---|---|
| products | on this website only: `DELETE products/{sku}` | also on another website: only taken off this one, `DELETE products/{sku}/websites/{id}`. Not shown on its own (visibility 1) and not a variant of a configurable being deleted: left (it may belong to a product another website sells). Websites or visibility not answered: left |
| categories | under a root only this website's store groups show, deepest first, `DELETE categories/{id}` | under a root another website shows (`justrite_test_website` and JustRite's 119): all left. One holding a category an install record lists: left |
| customers | accounts of this website, `DELETE customers/{id}` | in a B2B company (`company_attributes.company_id` > 0): left |

**Never touched:** anything any install record of this project lists (`readProjectRecords`, new in
`installRecord.ts`; `reset_datapack` removes those by its own rules), attributes and sets, customer
groups, companies and shared catalogs (a catalog and its group are one unit; deleting either moves
customers to General; a company's admin cannot be deleted while it stands), stocks and sources (the
Default Stock and Source included), websites, stores and root categories, orders and invoices, store
settings, admin users, the integration's credential. Commerce access is `projectCommerce` (Store:
`all`), behind `orgGuard`.

**Order and refusals.** Customers, products, products taken off, categories (the reverse of install
order). A write Commerce refuses is counted and named, the rest carry on, and the one sentence says
exactly what could not be removed ("Could not remove 1 of the products (ZZ-JACKET: …).").

**The human surface: project reset.** After the datapack question, when the SC chose "Remove
Datapack" or the project names none, and the website holds something: "This demo's store, the
website JustRite Test (justrite_test_website), also holds 5 products and 2 customers Demo Builder
didn't install. 1 product another website also sells will only be taken off this one. Some things are
left: … Also remove those, to leave this demo's store empty? This can't be undone." [Remove Those Too]
[Keep Them]. Esc keeps. The list is read beside the datapack check (`edsResetOtherData.ts`), the
clearing runs after the pack's removal and before the storefront reset, and no outcome fails the
reset. Edge Delivery reset only: the headless reset never touched data (decision 6).

**The agent surface.** `check_demo_data` (read; "Checking this demo's store data"): the preview,
counts and at most three names per kind, what it leaves and why, what the records list by kind, and a
`token`. `clear_demo_data` (write, confirm-gated, `AGENT_ALERT_COPY` naming `websiteCode`: "Deletes the
products, categories and customers on this website that Demo Builder did not install, as listed, and
takes products other websites sell off it. This can't be undone."; narrated "Clearing
<website>"): needs the website named, never defaulted, and the check's token; if the store would now
clear more, nothing is written and the new list comes back. Battery prompt
`reset-demo-leave-store-empty` added, not run. No response ceiling measured (both are in the
`PENDING_LIVE_MEASUREMENT` set); `ai-coverage-scan` and `security-review` not run this step.

**Tests.** `wipePlan.test.ts` (9), `wipeRun.test.ts` (5), `demoDataHandlers.test.ts` (10),
`edsResetOtherData.test.ts` (8), `edsResetOtherData-reset.test.ts` (4), over a typed sandbox
(`tests/helpers/commerceWipeFixtures.ts`, shaped like the owner's: JustRite, Bodea and the test website
sharing root 119). The safety rules were written before their tests; five mutations (a shared product
deleted, a shared root cleared, a recorded product taken, a company customer taken, any new plan
allowed) each turned the suite red.

### Which reads are confirmed against a captured real response

| Read or write | Endpoint and field | Confirmed? |
|---|---|---|
| the website and its store groups | `GET store/websites` (`id`, `code`, `name`), `GET store/storeGroups` (`website_id`, `root_category_id`) | yes, by `storeScopeOf` and store discovery |
| a website's products | `GET products`, `website_id` eq, `website_ids` | yes (Assign products, 2026-10-19) |
| | `visibility`, `extension_attributes.configurable_product_links` in a LIST answer | **no**. Missing, the product is left |
| the category tree | `GET categories/list` (`id`, `name`, `path`) | yes, by `listCategoryLabels` |
| a website's customers | `GET customers/search`, `website_id` eq | **no** (the answer is also filtered on `website_id` here, so a filter that does nothing takes nothing extra) |
| | `extension_attributes.company_attributes.company_id` | yes (2026-10-30, `…_DB08`) |
| take a product off a website | `DELETE products/{sku}/websites/{websiteId}` | **no**: never called from this extension before |
| delete a customer, product, category | `DELETE customers/{id}`, `products/{sku}`, `categories/{id}` | the routes yes (the engine's removals); a delete of something with orders, **no** |

### Decisions for the owner

1. **A second question, not a box.** A VS Code modal has no checkbox. Built: the next question, only
   when there is something, Esc keeps. Recommended: keep.
2. **A tool of its own, not a flag on `reset_project`.** The agent's `reset_project` never removes a
   datapack (`reset_datapack` does), so a flag there would clear the rest while leaving the pack.
   Built: `check_demo_data` + `clear_demo_data`. Recommended: keep.
3. **B2B is not cleared.** Companies, shared catalogs and customer groups are store-wide and come as
   units. Recommended next: clear a company whose admin and every member are this website's
   customers, then its catalog and that catalog's group together, only when no other website's
   customer is in the group.
4. **Orders, invoices, credit memos, cart rules and website settings are never touched.**
   Recommended: keep; say it in the SC guide.
5. **Several projects on one website.** Only THIS project's records are known, so things another
   project's engine installed on the same website would be cleared and its record stranded.
   Recommended: before shipping, read every project's records on this machine (the projects list
   knows them) and leave what any lists.
6. **The headless reset** never removed data, so it does not ask. Recommended: ask both questions
   there too, in a later step.
7. **Install records afterwards.** The plan said they are cleared; built: the clearing never takes
   what they list, so they stay true and `reset_datapack` still works. Recommended: keep.
8. **The human question uses the project's own website.** scratch-1028's own website is JustRite's,
   so its reset would offer to clear JustRite's live demo (with the website named, and opt in).
   Recommended: never answer "Remove Those Too" on scratch-1028; and before release, refuse the
   question for a website another project on this machine names as its own.

### Live test (owner's call; `scratch-1028`, website `justrite_test_website` ONLY, never JustRite's own)

Nothing here can be undone, so the clearing only ever meets things the test made itself.

0. **Read-only, for the owner to review before anything is written.** `check_demo_data` with
   `websiteCode: justrite_test_website`. Expected: every category under root 119 in `left` ("under
   root category 119, which justrite also shows"); `takenOff` naming any product JustRite also sells;
   `remove` naming what is the test website's alone. Then confirm the unconfirmed fields, read-only,
   and record the answers as typed fixtures: `run_commerce_rest GET` `products` with the `website_id`
   filter, `searchCriteria[pageSize]=5` and
   `fields=items[sku,visibility,extension_attributes[website_ids,configurable_product_links]]`; and
   `customers/search` with the `website_id` filter, page size 5. **Stop. The owner reads the list.**
   If `total` is not 0, the test website holds things nobody made for this test: the clearing is not
   run until the owner says those may go, since they cannot come back.
1. With `total` 0 (or the owner's go): make two throwaway things on the test website only, by hand or
   `write_commerce_rest`: product `zz-db10-only` (`website_ids` the test website's id, visibility 4)
   and customer `db10.shopper@example.com` on the test website. `check_demo_data`: `remove` names
   exactly those two.
2. Make one more customer, `db10.late@example.com`, then `clear_demo_data` with the step 1 token:
   refused, "The store changed since the list was made", nothing written (Debug Logs: no DELETE).
3. `check_demo_data` again (three things), then `clear_demo_data` with the new token: "Removed 1
   product and 2 customers from justrite_test_website."
4. **Back to zero:** `check_demo_data` answers `total` 0 with the same `left` as step 0, and JustRite's
   website reads as before (`run_commerce_rest GET products` with JustRite's `website_id`, the same
   `total_count` as at step 0).
5. Not run live: taking a shared product off a website (it needs a product on a second website the
   owner names as safe), and the reset question (scratch-1028's own website is JustRite's).
