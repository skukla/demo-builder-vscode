---
id: AB-26j
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26g, AB-26h]
value: high
status: built
---

# Business structure — sales organisation per website, prefix and ownership per pair, legal identity, warehouse names, the Organisation card

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1 for steps 01, 03, 04, 05; step 02 stops at the live store-config fixture unless AB-26b already captured it.**

## What

The five steps of `.rptc/plans/erp-business-structure/`: the record-shape pin and contract v2; the integration's Structure settings, order `salesOrg`, prefix on `ext_order_id`, ownership filter, legal fields and `structure` block in the mirror; the ERP's records; the screens; the record and the SC-facing demo setup guide (`docs/demo-setup.md`).

## Verification block (checked by the loop's done gate — §6a of the plan)

Step 01's record-shape test fails on any unpinned field; harness journeys for the sales org on an order and a partner; headless checks on Settings, Order, Customer, Shipment, Pricing; no `1000` that is not a real sales organisation.

## Shipped so far
- 2026-09-24  Step 01 BUILT — demo-erp 86be509 (test/records-shape.test.js pins every stored record's keys against test/fixtures/record-shapes.json, written from the shapes as read; contract v2 names the structure fields) + integration 50b1927 (vendored; contract:check differs from demo-erp main until the loop branch merges, expected). Step 02 first half in progress: Structure settings (text/list types verified in the config library's schema), salesOrg on the order request, prefix on ext_order_id with every read stripping it
- 2026-09-24  Step 02 BUILT — integration 2807a46 (Structure settings: sales org + name per website, prefix + ownership per pair; text/list field types; TEXT_RULES validation on save; prefix on ext_order_id, stripped on every read) + 5625033 (ownership filter in mirror, product and stock events; legal fields and admin website on companies; store/websites + store/storeConfigs read into the structure block; counts.skipped/owns) + 7537745 (quote salesOrg). Store Information is not readable over REST (composite research) so address/VAT stay null by design
- 2026-09-24  Step 03 BUILT — demo-erp 7e8b1cf (partners salesOrgs/legal/website with read-time upgrade, salesOrg removed; orders salesOrg/salesOrgName; conditions salesOrg scope, specificity +4, otherSalesOrg reason; settings.warehouses + structureMirror; lib/structure.js describeStructure; health answers structure). Suite 243 at the time (the commit message says 246; the message is wrong, the suite was right)
- 2026-09-24  Step 04 BUILT — demo-erp 126cf5f (Settings: Organisation + Warehouses cards, rename a plant; customer: Sold-to in + Legal identity; order header sales org; invoice Seller card; shipment ship-from with the ERP plant name; Pricing scope column, Add rule + Test a Price pickers; fakeApi mirrors the shapes; fingerprints re-accepted, 14/14 twice; bundle 938507/996147; 244 pass). Screens looked at: Settings, Customer, Order, Invoice, Shipment, Pricing
- 2026-09-24  Step 05 BUILT — demo-erp df2075c (README API table, every route and key) + integration 965e7fe (docs/demo-setup.md, the SC-facing guide with Admin path, API check and undo per requirement; README Structure row, order row, mirror reads); routing research gains Who this is for; realism audit and bidirectional item 7 carry one-line pointers; plan moved to .rptc/complete/erp-business-structure/. NOT verified live: App Management's rendering of text fields; store/* field names on ACCS. Scans: no src/ in this repo touched; lib/structure.js is new in both repos with no prior implementation of the job (architecture-duplication not triggered)
