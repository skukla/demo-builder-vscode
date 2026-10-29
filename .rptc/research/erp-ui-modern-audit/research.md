# demo-erp UI audit — ERP function, modern look, screen by screen

Date: 2026-09-24. Repo audited: `demo-erp` at `1c00e32` (`feature/erp-grids`), every screen
opened in the local preview (`npm run preview`) with the stand-in records. Builds on
`../erp-realism-audit/research.md` (2026-09-23, what a real ERP shows) and the plan
`.rptc/plans/erp-screen-realism/overview.md`; neither is repeated here.

**The question asked.** Keep the FUNCTION of the ERPs we captured (SAP S/4HANA, Business
Central — the fields, the documents, the refusals), and make the screen look like software
built this decade. The two are not in tension: the captured systems' *content* is the
realism; their *chrome* (dense grey grids, modal transaction codes, F-keys) is what dates
them, and it carries no information.

**What "modern" means here, concretely** — five properties, each checkable:

1. **One idea per screen, cards over a canvas.** Already the house style (`.erp-card`).
2. **Status as tinted badges, never a coloured dot beside grey text.** Already done.
3. **Actions on the title line of the thing they act on**, verbs not nouns. Done on documents.
4. **Every key is a link and every link goes somewhere** — a number you can read, you can
   open. Done for orders, shipments, invoices, customers; NOT for products from an order line.
5. **Empty states say what would be here and how it gets here.** Half done.

Legend for each screen: **Keep** (already right) · **Change** (do it) · **Add** (ERP function
missing) · **Drop** (present and fake, or noise).

---

## Shell and navigation

**Keep.** Shell bar + grouped side navigation is both Fiori's and BC's shape; the four themes
and the choice of rail or top band (Settings → Appearance) are a real differentiator for a
demo, and the palettes measure ≥ 4.5:1.

**Change.**
- The active area in the rail is a filled pill; the group names (SALES, MASTER DATA) are set
  in uppercase micro-type. Both fine — but the rail has no **count badges**. Fiori's Side
  Navigation and every modern back office (Shopify, Stripe) put a small count on the items
  that carry work: *Sales Orders · 3 open*, *Shipments · 1 to post*, *Event Journal · 1
  failed*. The numbers exist (`health.counts`, `eventsPending`) — this is one component and a
  health shape change.
- **Global search in the shell bar** (⌘K style). Fiori has it as the shell's search; BC has
  "Tell me". Ours has search per grid only. One box that matches a document number, a
  SKU, a customer name and opens the document is the single most "modern" thing the shell
  could gain, and the trail (`Documents.js`) already knows how to open any kind. Plan §3.1
  lists it under Home; it belongs in the shell, reachable from anywhere.

## Dashboard → Home (plan §3.1)

**Drop.** Five counters. A count of products is not work; it is the size of the database.

**Add** (this is the plan's Home, restated with the modern shape): a **work list** page —
Fiori's overview page, BC's Role Center. Tiles that name work and open the filtered list:
*Orders awaiting confirmation (4)* · *Orders on credit hold (1)* (once slice 3's hold
exists) · *Shipments to post (1)* · *Orders to invoice (2)* · *Events not delivered (1)*.
Under them, a "Recent documents" strip (the last five documents touched, any kind) and the
last sync line. Counts of records go to Settings → Records, where they already half live.

**Change.** Rename the rail item *Home*. "Dashboard" is a word from a different kind of
software.

## Sales Orders (list)

**Keep.** Search, sort, key-as-link, status badges, the Sold-to as `id · name`.

**Change.**
- Add the two derived statuses as columns or as a compound badge: *Shipping* (none / partly /
  fully) and *Billing*. The single Status column now hides the most interesting part of an
  order's life ("Shipped" says nothing about whether the second half left). Modern equivalent:
  Shopify's order list shows *Payment status* and *Fulfillment status* as two badges per row.
- **Filter chips** above the grid (Open · In process · Completed · Cancelled), the way the
  Event Journal already has Direction and Status pickers. A list of 500 orders with no filter
  is the one place the screen still reads as a database viewer.
- The Lines column (a count) can go; nobody sorts by it. Put *Shipping* there.

## Sales Order (document)

**Keep.** Header as labelled fields in a 3-column grid, lines numbered in tens, base unit,
Net/Tax/Total block, actions the ERP decided (`can`), the related-documents strip as boxes
that open. This is the screen the demo carries and it is right.

**Change.**
- **Sticky title line.** On a long order the actions scroll away. Fiori's object page pins
  its header; modern equivalents (Linear, Stripe) pin the title bar. One CSS rule
  (`position: sticky` on `.erp-page-header`) on documents only.
- The **history** is stored (`history[]`) and shown nowhere. A vertical **timeline** card
  under the strip — *Created 7 Sep · Confirmed 7 Sep · Shipment 8000000003 posted 12 Sep* —
  is the modern rendering of SAP's document flow dates and BC's "Entries" and costs nothing.
- Product SKU on a line should **open the product** (property 4 above). The trail can carry
  `kind: 'product'` once `ProductDetail` takes `number`; today it is the one document not on
  the trail.
- **Pricing column** on lines ("Contract price CP01 · −12%") — plan §3.3, still missing. The
  engine already answers `source`; the order line stores only `price`. Needs the applied
  condition recorded on the line at creation (the quote is computed at cart time by the
  integration; the ERP could re-derive at describe time against today's conditions, which
  is honest only if labelled "as priced today"). Recommend: record `pricingSource` on the
  line when the order is created, via the quote the integration already ran — a contract
  addition (`order.requestLine` gains `source`).

**Add.** Credit status field in the header (slice 3). Absent, not blank, until then.

## Shipment (document) · Invoice (document)

**Keep.** Both follow the order document exactly; back goes to where you came from.

**Change.**
- Shipment: **Ship-from** is a code (`Default Source · default`). Commerce's vocabulary leaks
  (the realism audit named this). The ERP should let the SC **name warehouses** (Settings →
  Warehouses: code from Commerce, name the ERP's — "Plant 1000 · Hamburg DC"), and every
  screen prints the ERP's name. One settings record, one lookup in `shape()`.
- Invoice: **Due date** = billing date + payment terms (NET30 → +30 days). Both reference
  systems print it; ours has both inputs and shows neither the date nor the days. Derive in
  `describeInvoice`.
- Invoice: a **Download PDF** action is what every modern system offers and what an audience
  reaches for. Out of scope by the plan (X), and I agree — but say so in the UI? No: an
  absent button is better than a disabled one.

## Shipments (list) · Invoices (list)

**Keep.** Same grid as orders.

**Change.** Shipments list: *Ship-from* shows the code — same warehouse-name fix as above.
Add the customer (Sold-to) column to both; a shipment list without who it went to is a
warehouse's view, not a sales view. `listShipments` already carries `partnerId`; join the
name as `listRows` does for orders.

## Products (list)

**Keep.** SKU as link, Description, Type, Base unit (added since the audit), List price, On
hand, Status badge; Edit mode for in-place edits.

**Change.**
- **On hand → On hand · Available.** Slice 4's last item. Available = on hand − committed
  (Σ open qty on confirmed orders per SKU). The data exists now (`openQty`); it is one pass
  over orders in `listProducts`. This is the field a supply-chain eye looks for and the one
  that proves the order flow touches inventory.
- Status badge is binary (In stock / Out of stock). Modern: three tints — *In stock*, *Low*
  (below a threshold, default 5), *Out of stock*. The threshold is an ERP setting.

**Add.** *Sales status* (Sellable / Blocked for sales) — SAP's material status, BC's Blocked
item. Plan §3.7. A blocked product refuses to ship (§6.3 already lists the refusal text).

## Product (document)

**Keep.** Details / Pricing / Inventory cards; locked SKU with the note; edit-in-place with
Save/Cancel appearing only when dirty (that is the modern pattern, and it is here).

**Change.**
- The cards are hand-rolled `View`s with their own heading — the ONE screen not on the shared
  `Card` component (`ProductDetail.js` `Card()`). Replace; it also gets the card divider the
  others have. (Verified duplicate, in reach; not fixed this turn because the file is 330
  lines and the swap touches every card's `aside` — do it with slice 6.)
- **Open orders for this product** card: the lines across orders that name this SKU, with
  open qty — the other half of Available, and the link from master data back into the
  documents. Modern systems (Shopify's product page "Inventory" → orders) do this.
- The **Pricing** card's link says "0 contract prices →"; when there are none it should read
  the way the customer document does: *"No pricing rules name this product; it sells at list
  price."*

## Customers (list)

**Keep.** Row opens the document; credit limit and blocked stay editable in the row.

**Change.**
- Add **Exposure** and **Available** columns — derived, now cheap (`describePartner` logic
  over all partners in one pass). An ERP customer list with a credit limit and no exposure
  beside it is the "present and fake" pattern the realism audit warned about — the limit
  alone says nothing.
- Blocked as a switch in a list is the one control on the screen that reads as a settings
  page. Modern: a badge in the list, the action on the document (which now exists). Keep
  the credit limit editable (a number is a number).

## Customer (document) — new this turn

**Keep.** Header / Credit / Sales Orders / Pricing; credit absent for the walk-in account;
Block as a verb on the title line.

**Change.**
- **Available credit** should be a **progress bar** under the three figures (exposure as a
  fraction of limit, red past 100%). Fiori's credit account app and BC's customer statistics
  both show it as a proportion; a bar is how modern software shows "how much of the limit is
  used" and it is one `Meter` component.
- The Sales Orders card lists all orders. Split *Open items* (uninvoiced — what exposure is
  made of) from *History* with a small toggle; the exposure figure then has a list under it
  that adds up to it. That is the ERP function ("open items") in plain view.

**Add** (slice 3): blocking level (Open / Shipping / Invoicing / All) replacing the boolean;
Release / Reject on held orders. Addresses (O6, when mirrored).

## Pricing Rules (list + Test a Price)

**Keep.** The rule text ("Agreed price · CP01") — meaning first, code second — is exactly the
composite-ERP rule §1.1 asks for. The price test is the SAP pricing-analysis idea done
plainly.

**Change** (slice 2, in this order):
- **Value help.** Customer and Product are free `TextField`s in both the Add dialog and the
  price test. Typing `C000102` by hand on stage is the most prototype-looking moment left on
  the screen. `ComboBox` over the two lists the page already loads.
- **Validity dates and minimum quantity** on the record and as columns, with a derived
  *Status* badge (Active / Scheduled / Expired). Both reference systems have them; it is the
  gap a B2B pricing person sees first.
- **"Why not"** in the price test: the records that matched customer and product but were
  ruled out, each with its reason. `notApplied[]` from the engine.
- Rename the rail item **Pricing** (it lists conditions and tests prices; "Rules" is half).

**Drop.** The Amount column right-aligns a price and a percentage in the same column. Split
into *Amount* (money) and *Percent*, or format both consistently with the currency on the
price only — the mixed column is the one thing on this screen an accountant would flag.

## Event Journal

**Keep.** Direction and Status pickers, both directions, the detail page, Retry/Requeue.

**Change.**
- **Name the document, not the JSON.** The Detail column prints raw
  `{"erpNumber":"0000001001"}`. Plan §3.11: *"Shipment 8000000003 for sales order
  0000001003"*. The journal entry already carries `value`; a `describeEvent(kind, value)`
  on the ERP side (not the screen) turns each kind into a sentence, and the sentence's
  numbers become links on the trail.
- The Event column shows `be-observer.sales_order_shipment_create`. Keep it — it is the
  authentic wire name and the integration's history shows the same — but demote it to the
  detail page and show the plain kind in the list (*Shipment posted*, *Price changed*).
- **Live**: the journal should refresh itself while the page is open (the Dashboard already
  polls health during a sync). An SC demonstrating "watch the event go" should not have to
  click the rail.

## Settings

**Keep.** Two columns; Name with Save on the title line; Appearance with live preview;
Records with Sync and Wipe.

**Change.**
- **Currency** setting (plan §3.12): one value every money field reads. Today `money()`
  falls back to USD where a record has no currency; a EUR demo shows two symbols.
- **Document numbering** card, read-only: the three counters' next values. Every ERP audience
  recognises number ranges; it is four numbers we already hold.
- **Warehouses** card (see Shipment): code from Commerce, name the ERP prints.
- Wipe is a red outline button beside Sync with no confirmation visible in the preview —
  verify it confirms (destructive, "whatever can be done can be undone" wants a warning that
  names what is lost and that the counters survive).

---

## Priority, by realism gained per unit of work

| # | Change | Screens | Size |
|---|---|---|---|
| 1 | Pricing: value help, validity + min qty, "why not" (slice 2) | Pricing | M |
| 2 | Credit hold with Release/Reject; blocking level; Home's "on credit hold" (slice 3 rest) | Order, Customer, Home | M |
| 3 | Available = on hand − committed; product's open orders; low-stock tint | Products, Product, Order | S |
| 4 | Home as a work list + rail count badges | Home, shell | S |
| 5 | Event journal names documents; live refresh | Journal | S |
| 6 | Currency, document numbering, warehouse names (Settings) | Settings, Shipment, Products | S |
| 7 | Order timeline card; sticky title line; product link from a line | Order | S |
| 8 | Customers list exposure/available; credit meter; open items split | Customers, Customer | S |
| 9 | Global search in the shell bar | shell | M |

Nothing above changes the contract except the pricing-source-on-line idea (order document),
which is optional and flagged as such.
