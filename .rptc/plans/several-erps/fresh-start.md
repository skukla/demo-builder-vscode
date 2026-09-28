# Fresh start: delete Bodea, clean Commerce, rebuild from the setup guide

Owner's goal (2026-09-28): when the several-ERPs work is finished, delete the Bodea project,
clean up what development left in Commerce, create a new project from scratch, set the demo up
by following the setup guide exactly as an SC would receive it, then walk the client
journeys. This file is the checklist for that. Draft; the loop fills in what it learns.

## What removing the integration (or deleting the project) undoes by itself

The integration's detach step, then its uninstall, then the ERP wipe:

- credit limits and blocks it set on companies; per-ERP credit custom attributes on companies;
- product prices, names and stock quantities it wrote from an ERP;
- the ERP order numbers on orders (`ext_order_id`);
- its Commerce app, Admin menu, webhooks and event subscriptions;
- everything stored in the ERPs.

## What it does NOT undo (the clean-up list)

Checked against what development did on the Bodea Commerce instance up to 2026-09-28. Undo
each by hand in the Commerce Admin, or say it stays.

| Left behind | Where | Undo |
|---|---|---|
| Test orders 3000000014, 3000000015, 3000000016, 3000000017 and earlier demo orders, with their invoices, shipments and comments | Sales → Orders | **Cannot be deleted** in Commerce. Cancel or credit-memo what is open; they stay in history |
| Credit charged by test orders (Kukla Studios: $120 from 3000000016) | Customers → Companies → Kukla Studios → Company Credit | **Done 2026-09-28**: reimbursed; balance 0, $120,000 available. Repeat for any later test order placed on account |
| Test custom order attribute `erp_test_number` on order 3000000014 | the order | Leave (historic) |
| Inventory sources `northwind` and `east`, and the stock "Bodea Stock" | Stores → Inventory → Sources / Stocks | Delete the stock (the website returns to Default Stock); move quantities back to Default Source; **sources cannot be deleted**: disable them |
| Product source assignments and quantities at `northwind` / `east` (49 Bodea products) | products' Sources | Move back to Default Source (the saved pre-change rows: session scratchpad `bodea-default-rows-before.json`, not in the repo) |
| Payment on Account switched on for the Bodea website | Stores → Configuration → Sales → Payment Methods (scope Bodea Website) | Tick Use Default beside Enabled. Or keep: it is a setup step the guide asks for |
| Shared catalog for Kukla Studios (catalog 14, group 19) and ServerSavvy (catalog 12, group 16), set up by hand for contract prices | Catalog → Shared Catalogs | Keep if the new project's demo uses them; else assign the companies back to the default catalog |
| Order status "Partially Held" (`partially_held`), created 2026-09-28 and assigned to Processing and Pending (not default, not on storefront) | Stores → Order Status | Unassign from both states, then delete |
| Product attribute `erp_owner` (created 2026-09-28, Text Field, in the Default set; values on `accesspoint`, `switchlite8`, `switchenterprise8` = `erp`, and the server products once the second ERP exists) | Stores → Attributes → Product | Delete the attribute (removes the values) |
| Product attribute `brand` | Stores → Attributes → Product | **Do not delete**: it came with the sample catalog (a Dropdown with its own values), not from this work |
| Test customers | Customers | All test buyers were deleted after each test (45, 46, 47, 48) |
| Order status "Confirmed in ERP" (`erp_confirmed`, on Pending; exists on Bodea, setup guide optional step) | Stores → Order Status | Unassign, delete |

The loop adds rows as it creates things tonight (B8 live proofs).

## The rehearsal, in order

1. **Delete the Bodea project** in Demo Builder (owner; permanent). It removes the integration
   and ERPs (the undo list above) and the project's own resources.
2. **Clean Commerce** with the table above.
3. **Create a new project from scratch** in Demo Builder, as an SC would.
4. **Follow the setup guide as delivered** (`commerce-erp-integration/docs/demo-setup.md`, and
   Demo Builder's setup checklist on the integration card). Note every step that is unclear,
   wrong or missing: those are the guide's bugs.
5. **Walk the client journeys** (to be written: `journeys.md` beside this file, from the
   vignettes), noting what to click and what to say.

## Known setup notes from the night loop

- Right after deploying the integration, the first cart action can fail with "ERP discounts are
  unavailable" while the cart checks start up; a retry works. Warm it up once (add to a cart)
  before a demo. Seen 2026-09-28 on Bodea.
