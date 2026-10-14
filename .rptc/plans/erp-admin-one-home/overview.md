# ERP integration in Commerce Admin: one home for each question

Written 2026-10-14 with the owner. Continues AB-30 (the Admin page uses the Commerce back-office
design system). Repo: `skukla/commerce-erp-integration`, branch `fix/erp-ui-pass-2026-10-13`.

## Why this plan exists

The Admin page grew one idea at a time: a log that narrated, stat tiles, colored chips, a Data
Map, a status line in three places. Each was reasonable alone. Together they said the same facts
several times and did not tell an admin where to look. This plan gives every question an
admin asks exactly one home, and makes every other place link to that home.

## What established integrations do (researched 2026-10-14)

- **Logs are terse.** Celigo, Boomi, Oracle Integration, Workato and Commerce's own Action Log
  list an identifier, a kind of event and a result. Words appear only for errors.
- **Problems get a work queue.** Celigo's Errors page (Retry, Resolve), Oracle's Errors page,
  Business Central's "Skipped records" with a reason. Successes are mostly counted.
- **Records are found by their business ID.** Oracle's "business identifiers", Celigo's
  "trace key": the order number, the SKU, the customer.
- **The other system's facts are shown on the record people already work in**, not in a
  log. Salesforce Connect shows ERP orders as a related list on the customer; Dynamics 365
  virtual tables show another system's data in place; Commerce's Admin UI SDK adds columns
  to the order, product and customer grids, filled live by the app.

Sources are listed at the end.

## The rule

**One question, one home. Every other place that names the thing links to its home.**

| The question | Its home | State |
|---|---|---|
| Is the integration working? | The band on every tab: each ERP, a status light | Done |
| Where is this order, product, customer in the ERP? | Commerce's own grids and record pages | Orders done (grid columns "ERP order", "ERP parts"; order page button "ERP parts"). Products, customers missing |
| What needs fixing? | Overview's "Needs attention": problems only, with Retry, absent when there are none | Built 2026-10-14 |
| What happened, and when? | Activity: the log, both sides of each record paired | Built |
| The whole story of one record | The side panel: both sides now, then its history | Orders have it; products and companies partial |
| How do the two systems fit together? | Data Map: the model, a live example of each pair | Done |
| How is it set up? | Settings, on Stores > Configuration's pattern | Built 2026-10-14 |

What follows from the rule:

- **Activity is a record of what happened, not a status board.** Its value is what only this
  integration knows: which Commerce record is which ERP record, and (Phase 2) what changed.
- **Status lives on Commerce's records.** The integration's page is not the only place to
  learn an order reached the ERP.
- **Overview stops repeating the log.** Health and the problems queue only.
- **Everything that names a record opens the same side panel**: Activity, the queue, search,
  the Data Map and, later, the Commerce grids.

## The parts every screen is built from

Spectrum 2 dressed as Commerce Admin (components/admin/, styles/admin-skin.css): AdminTable,
AdminStatus, AdminPicker, AdminSwitch, AdminSearch; ErpName (a small square of the ERP's color,
its name). One type scale, one spacing scale. No chips on rows, no tinted pills, no colored
edges, no middle dots.

## The band

Approved and built 2026-10-14 (owner found the flat version unengaging): each ERP as an identity
block, between a flat label and the old tinted pills. A small square in the ERP's color holding
its own logo mark (demo-erp's appearance already carries a logo, a palette and a nav style),
the name in bold, and a status light on a second, smaller line. No pills, tints, edges or
middle dots. Mockup: `mockups/band.png` shows both.

## Activity's columns

Date | Time | ERP (with a direction arrow) | Details | Record | Result. Built 2026-10-14.

- **Date** and **Time** are their own columns, and a **date range** filter picks one day or
  several (Spectrum's DateRangePicker; "All dates" clears it). Owner, 2026-10-14: a log
  without a date column and a date filter is not a log. It filters the records the page
  holds: the newest 100, kept 14 days (one ERP picked: that ERP's whole history).
- **Details** is a short phrase about what happened in the system the record came from, from a
  fixed vocabulary (below). It replaces the old Event column and the "Label: value" pairs,
  which read like a database dump. The heading stays "Details": "What happened" read as
  machine-written (owner, 2026-10-14). An event's own document (a payment, an invoice, a
  credit memo, a return order) is named here: "Payment P-17 of 1,859.00 received".
- **Record** is one column with both sides: the Commerce record on top, as a link to its
  story, and the ERP's record for the SAME business object beneath it in grey (a sales order,
  a customer), shown only when it differs. A product is one SKU on both sides, so it has no
  second line. A side whose absence is the point is named: "Not paired", "Not in the ERP
  yet", "Not in the ERP".
- **Result** is four words: Done, In progress, Waiting, Failed (integration logs use three or
  four). The reason under a problem says who stopped it and why: "Refused by Commerce: ...",
  "Refused by Northwind ERP: ...", "Not sent: ...". The ERP's "partner" reads "customer"
  everywhere.
- **The filters copy the Admin grid's pattern** (owner, 2026-10-14): a keyword search, a
  Filters button that opens a panel (Date range, ERP, Type, Problems only) applied with Apply
  Filters or dropped with Cancel, and the filters in force as removable chips under "Active
  filters" with Clear all. The Admin UI SDK ships no UI components (1.1.0: createExtensionApp
  and hooks) and the Admin's own panel is out of an app's reach, so it is built from Spectrum
  parts (components/admin/admin-filter-bar.jsx).
- **Refresh sits beside what it updates**, at the right of each tab's own tools row, as a
  labeled button with "Updated just now". In the band it sat next to the price-publish line
  and read as "refresh the prices" (owner, 2026-10-14).
- **Every field, button and the filter panel take the Admin's own values**, read from its
  source (magento/magento2 2.4-develop, backend theme variables/_forms.less,
  variables/_actions.less, _actions.less, Magento_Ui _data-grid-filters.less, 2026-10-14). Values
  only, in our own CSS: copying the stylesheet itself was not done (its header reads "All
  Rights Reserved" and this repo is public; that is the owner's call), and it would have meant
  dropping Spectrum's accessible parts. 1 rem is 10 px in the Admin, so:
  - fields 32 px (not the 34 px the page had used), white, 1 px #adadad, radius 1 px, #007bdb
    on focus;
  - buttons 32 px, square, 14 px semibold, by the Admin's names: default grey (Filters,
    Refresh), primary orange, secondary dark brown (Apply Filters), tertiary link (Cancel,
    Clear all);
  - the grid header: search on the left, Filters on the right; open, the Filters button turns
    white with a 3 px orange bar and joins the panel;
  - the panel: white, #ccc rules above and below, 36/30 px inside, 13 px type, four columns,
    bold labels; a date is two fields, "from" and "to", labels on their left;
  - Active filters: a #ccc-ruled strip, semibold "Label: value" items with a grey ×, Clear all
    at the end. Not chips.
- **Still to compare on a real Admin**: the Admin's font is Open Sans; this page uses Adobe
  Clean, as Spectrum loads it. The older hand-made controls are left only on the stock-move page.

### The vocabulary

| Record | Details |
|---|---|
| ERP price | Price changed to 189.00 (Phase 2: from 199.00 to 189.00) |
| ERP stock | Stock changed to 42 at contoso_warehouse / Out of stock at east |
| ERP credit limit | Credit limit changed to 25,000.00 |
| ERP block | Company blocked / Company unblocked |
| ERP customer prices | 3 customer prices updated |
| ERP credit hold | Credit hold placed / Credit hold released |
| ERP cancel, shipment, invoice | Order canceled / Order shipped / Invoice 90000017 issued (Order invoiced without its number) |
| ERP status | Order confirmed |
| ERP payment | Payment P-0000000017 of 1,859.00 received |
| ERP return, credit memo | Return order R-2 received / Credit memo CM-4 issued |
| Commerce order | Order placed |
| Commerce order change | Order held / Order canceled / Order released |
| Commerce shipment, invoice, return | Shipment created / Invoice created / Return created |
| Commerce product | Product created: name and price sent / Product changed: name, price and stock sent / Product deleted (a save sends the same fields whatever changed, and Commerce's event does not say which attribute did, so never "renamed") |
| Commerce stock | Stock changed to 120 at Default Source / Stock changed: 4 at East, 0 at West |
| Commerce company | Company saved (sent to every ERP; the customer number beneath) |
| Price publish | Prices published: 12 written, 3 removed / Prices not published for 1 ERP and 2 customers |
| Demo reset | Demo reset: 21 orders canceled, 3 noted as closed |

## Order of work

### Phase 1: screens (preview only, nothing live)

1. Activity: Details carries the plain phrases; the Event column goes. Built 2026-10-14.
2. Overview: health in one line, an ERPs table, Needs attention as the shared table with Retry.
   Built 2026-10-14.
3. Side panel: one layout for every record: both sides now, then its history from Activity.
   No middle dots.
4. Settings on the shared parts. Built 2026-10-14.

### What else was built 2026-10-14

- **Commerce changes the log was missing**: a product created, a stock quantity saved, and a
  company saved in Commerce each leave a row now. A save after one that got through is a new
  change, not another try; only a redelivery of a failed one counts as a try.
- **The price publish is under Activity** (owner asked whether pricing needs its own tab; one
  home says no). Each run that moved a price is a row ("Prices published: 2 written"), opening a
  panel of its counts, each row moved before and after, and what was skipped or failed. A run
  that changed nothing leaves no row; runs that only fail share one row until one succeeds. The
  POST answer to Demo Builder keeps its counts only.
- **Overview** (reworked with the owner the same day): the search; Dashboard-style totals
  (Magento_Backend pages/_dashboard.less), each saying "today" or "now", the fourth "Waiting to
  send now"; Needs attention, the log's own table with a Retry column, shown only when
  something needs a person; then ERPs (last heard from, waiting to send) and Price publish
  (schedule, next run, last run, last change) side by side, each an Admin section. The ERP
  cards, then an ERPs grid, were dropped as overkill; whether an ERP answers is the band's.
  The search's "Try" examples were removed.
- **Settings**: collapsible groups and Configuration rows (label right-aligned at 33%, field at
  44% with its comment, Use Default Value, the scope as "[website]"), on/off settings as Yes/No
  lists as the Configuration page has them. App Management still renders its own generated
  form of the same values; that cannot be removed, so this tab is the home and that form is
  Adobe's plain copy.
- **Still on the old controls**: the stock-move page (`move-stock-page.jsx`) uses the old
  `.input`/`.select`, so those rules stay until it moves too.

### Phase 2: small backend additions (forward only)

1. **Before and after.** Each ERP write saves the value Commerce had just before it (the
   handlers already read it), so Activity says "from 199.00 to 189.00". Older records keep
   the new value only. The ledger is not this: it keeps only the value before the ERP's first
   write, for undoing.
2. **Real links into both systems.** Two facts the page does not have:
   - each ERP's screen address (Demo Builder knows it; touches the extension);
   - Commerce's internal record ids, which Admin page links need (orders by entity id,
     products by product id, companies by id).

### Phase 3: ERP columns on Commerce's own grids (owner's go; a deploy to a scratch project)

- **Products grid**: owning ERP, ERP price, ERP stock, last update.
- **Customers grid**: ERP customer number, credit block.
- **Companies**: no Admin UI SDK extension point for the B2B companies grid has been found.
  Check before promising.

## Known and deferred

- The stored history messages (shown in the side panel's timeline) keep their old wording.
  The log no longer reads them except for a reason or a fact found nowhere else.
- A split order's ERP numbers are read from its message ("took its part as sales order N");
  the parts record holds them properly and the history action could add them.

## Sources

- Adobe Commerce Action Logs report:
  https://experienceleague.adobe.com/en/docs/commerce-admin/systems/action-logs/action-log-report
- Celigo run history: https://docs.celigo.com/hc/en-us/articles/4404692954395
- Celigo errors: https://docs.celigo.com/hc/en-us/articles/16182234244635-Investigate-troubleshoot-errors
- Boomi process reporting:
  https://help.boomi.com/docs/Atomsphere/Boomi_Labs/Spaces/Getting_started/User_Space/integration_process_reporting
- Oracle Integration business identifiers:
  https://docs.oracle.com/en/cloud/paas/integration-cloud/integrations-user/business-identifiers-tracking-fields-messages.html
- Business Central Shopify connector:
  https://learn.microsoft.com/en-nz/dynamics365/business-central/shopify/troubleshoot
- Salesforce Connect:
  https://developer.salesforce.com/docs/atlas.en-us.234.0.apexcode.meta/apexcode/platform_connect_about.htm
- Dynamics 365 virtual entities:
  https://learn.microsoft.com/nl-nl/dynamics365/customerengagement/on-premises/developer/virtual-entities/get-started-ve?view=op-9-1
- Admin UI SDK grid columns (order v2, product, customer):
  https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/v2/order/grid-columns
  https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/product/grid-columns
  https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/customer/grid-columns

## Mockups

`preview/mockups/one-home/` in the integration repo, one per piece; screenshots in this
plan's folder.
