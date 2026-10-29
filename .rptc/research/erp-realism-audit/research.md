# ERP realism audit — demo-erp against SAP S/4HANA and Dynamics 365 Business Central

Date: 2026-09-23. Repo audited: `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-erp`
(read at commit on disk, not committed to). Companion read for context:
`/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/commerce-erp-integration/README.md`.

**The bar being tested.** An SC opens the ERP screen in front of someone who uses SAP or
Dynamics every working day. Nothing on screen should make that person think "that is not an
ERP". Two separate failure modes, and they rank differently:

- **A field that is missing where their eye goes first.** Cheap to add, expensive to be without.
- **A field that is present and obviously fake.** Worse than missing. A credit limit that never
  blocks anything, a "Credit used" column stuck at $0.00.

Everything below separates **what I read** (code, or a vendor's own documentation) from
**what I inferred**.

---

## Part 1 — What the mock ERP is today

### 1.1 Products

Stored/served shape, `lib/products.js:80-95` (`shape()`):

| Field | Notes |
|---|---|
| `sku` | the Commerce link; immutable, refused on PATCH (`lib/products.js:220`) |
| `name` | editable |
| `type` | `simple` or `configurable` only (`lib/products.js:73`) |
| `parentSku`, `variantAttributes[{label,value}]` | variants only |
| `description` | stored, **never rendered on any screen** |
| `unit` | defaults `'EA'` (`lib/products.js:89`); **never rendered on any screen** |
| `listPrice` | editable |
| `warehouses[{code,name,quantity}]` | one row per Commerce inventory source (`lib/products.js:16` default is `{code:'default', name:'Default Source'}`) |
| `stock` | derived sum across warehouses (`lib/products.js:92`) |
| `updatedAt` | |

A parent additionally gets `variantCount` and `priceRange` (`lib/products.js:104-112`).
Editable set is exactly `name`, `listPrice`, `warehouses` (`lib/products.js:205`). A price/name
change emits `product.price`; quantity changes emit `product.stock` per source
(`lib/products.js:259-264`).

Screen: list columns SKU · Name · Type · List price · Stock · Status
(`screen/src/components/Products.js:21-28`); Status is a binary In stock / Out of stock light
(`screen/src/components/StockStatus.js:5-8`). Detail page has three cards — Details (Name, SKU
locked, "Varies on"), Pricing (list price, or a range for a parent, plus a link showing how many
contract prices exist), and either Inventory (warehouse · code · quantity · status) or Variants
(`screen/src/components/ProductDetail.js:30-43, 266-327`).

### 1.2 Business partners

`lib/partners.js:27-40`: `id`, `name`, `salesOrg` (defaults `'1000'`), `commerceCompanyId`,
`customerGroupId`, `emailDomain`, `paymentTerms` (defaults `'NET30'`), `creditLimit` (defaults
`50000`), `creditUsed`, `blocked`, `updatedAt`, plus `isDefault` on the walk-in partner
(`lib/partners.js:49-68`).

Screen columns: Partner · Name · Commerce company · Terms · Credit limit (editable) · Credit
used (read-only) · Blocked (switch) — `screen/src/components/Partners.js:12-20`.

Two things I verified by grep rather than by reading alone:

- **`creditUsed` is never written to by anything.** The only two occurrences in `lib/` are
  `creditUsed: existing?.creditUsed ?? 0` (`lib/partners.js:37`) and `creditUsed: 0`
  (`lib/partners.js:61`). No order, no quote, no import moves it. On screen it is a money-
  formatted $0.00 forever.
- **`salesOrg` is stored and never displayed** anywhere in `screen/`. *(2026-09-24: replaced by
  `salesOrgs` on the partner and `salesOrg` on the order, both printed; built by
  `.rptc/complete/erp-business-structure/`. Item 18's warehouse names are the ERP's own now,
  same plan. The statements around this line describe the code as it was on 2026-09-23.)*

Partner resolution for quotes and orders: partner id → Commerce company id → email domain →
customer group → default partner (`lib/partners.js:83-101`). There is **no partner detail page**.

### 1.3 Pricing conditions

Three kinds only (`lib/conditions.js:6`): `contractPrice` (partner + sku + price),
`contractDiscount` (partner, optional sku, percent), `maxDiscount` (optional partner, optional
sku, percent). Stored fields are `kind`, `partnerId`, `sku`, `price|percent`, `updatedAt`
(`lib/conditions.js:17-24`). No dates, no currency, no quantity, no unit, no status.

Resolution (`lib/pricing.js`): specificity partner+sku (2+1) beats partner beats sku beats global
(`lib/pricing.js:12-14`); a contract price beats a contract discount; `maxDiscount` acts as a
floor on how far below list a line may go (`lib/pricing.js:77-82`); the answer names the rules
that decided it in `applied` (`lib/pricing.js:86-90`).

Screen (`screen/src/components/Pricing.js`): a table of conditions with a prose description
(`describe()`, lines 20-25), an add form whose Partner id and SKU are **free-text `TextField`s**
(lines 79-80), and a one-line quote tester (lines 86-98).

### 1.4 Sales orders

`lib/orders.js:11-18`: statuses `created → confirmed → shipped → invoiced`, with `cancelled`
reachable from `created` and `confirmed`. `invoiced` and `cancelled` are terminal.

Record: `number` (ten digits, zero-padded, from a counter that never rewinds —
`lib/counters.js:13-22`), `commerceOrderId`, `commerceIncrementId`, `partnerId`,
`lines[{sku,qty,price,commerceItemId}]`, `currency`, `total`, `status`, `history[{status,at}]`,
`createdAt` (`lib/orders.js:41-53`).

Screen columns: Sales order · Commerce order · Partner · Lines (a **count**) · Total · Status ·
Move to (`screen/src/components/Orders.js:11-19`).

**There is no order detail page.** `screen/src/components/` contains `ProductDetail.js` and
`EventDetail.js` and nothing else ending in `Detail` (verified by listing the directory). The API
serves `GET orders/:number` with `nextStatuses` (`actions/orders/index.js:17-21`) and the screen
never calls it.

### 1.5 Events, settings, sync, dashboard

Events journal both directions, with delivery state, attempts, last error, requeue and retry
(`lib/events.js`, `screen/src/components/Events.js`, `EventDetail.js`). Eight outbound event
names mapped to the Commerce starter-kit vocabulary (`lib/events.js:20-29`).
Settings: display name, last import, last wipe, sync record, plus Sync records / Wipe all records
(`lib/settings.js`, `screen/src/components/Settings.js`).
Dashboard: five counters — products, business partners, sales orders, pricing conditions, events
pending (`screen/src/components/Dashboard.js:23-31`).

### 1.6 Two things already wrong (verified, small)

1. **Currency is hardcoded USD on products and partners while orders honour the order's
   currency.** `screen/src/components/Orders.js:9` uses `o.currency || 'USD'`; but
   `Partners.js:10`, `ProductDetail.js:27`, `ProductCells.js:13` and `productFormat.js:2` all pin
   `currency: 'USD'`. A non-USD demo shows dollars on the product and partner screens and the
   right symbol on orders. (Verified by grepping `screen/src` for `currency:`.)
2. **The README claims a field that does not exist.** `README.md` line 11 describes products as
   "SKU, description, plant, **list price**, **stock**". There is no `plant` anywhere in
   `lib/products.js`. Either the field is missing or the README is.

---

## Part 2 — Area-by-area audit against real ERPs

A note on sourcing before the claims. Microsoft Learn pages were fetched and read in full.
SAP's own pages on `help.sap.com` are client-rendered — a plain fetch returns an empty shell, and
the portal's content API answered 500 for every parameter set I tried. What I could read is SAP's
**own** search service (`help.sap.com/http.svc/elasticsearch`), which returns quoted extracts of
those same pages plus their canonical URLs. So every SAP claim below is SAP text, but a
**snippet** of the page rather than the whole page, and I have cited the page it came from. Where
a snippet is short enough to be ambiguous I say so.

### 2.1 Products / material master

**What SAP shows.** A material master is not one screen, it is a set of views, and the identity
of a material is spread across them. SAP's own instructions for creating a material list "Basic
Data 1 … Base unit of measure", "Sales and Distribution: Sales Organization 1 … Base unit of
measure … Division … Item category group"
([Creating a Vehicle Model](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/f340785101c548c9beeda9284efd18a0/d2dcc353b677b44ce10000000a174cb4.html)),
and "Basic data 1 Enter at least the material short text and the base unit of measure … Sales:
Sales organization data 1 Enter the issuing plant (planning plant) and the tax classification"
([Creating a Material Master for a Service Product](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/25de5f7eadc94d688aa3ce34de0cd09b/b17cc1536ca9b54ce10000000a174cb4.html)).

Stock is not one number. SAP distinguishes, per (plant, storage location): unrestricted-use
stock, quality inspection stock ("valuated but does not count as unrestricted-use stock"),
blocked stock and stock in transfer
([Stocks in the Material Master Record](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/91b21005dded4984bcccf4a69ae1300c/fc62bd534f22b44ce10000000a174cb4.html)).

A material can be blocked for selling without being deleted: "The material can be blocked for use
in certain sales activities by assigning one or both of the following statuses … Distribution-
chain-specific material status / Cross-distribution-chain material status"
([Material Statuses](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/bc6b9325fedd4344a84412b2195064fa/3415c453f57eb44ce10000000a174cb4-92.html)).

**What Business Central shows.** The Item Card carries a **Type** (Inventory / Non-Inventory /
Service), a **Costing Method** driving **Unit Cost**, item categories and attributes, variants,
an Item Vendor Catalog, and separate Replenishment, Warehouse and Planning FastTabs
([Create item cards](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-how-register-new-items)).

Availability is explicitly two different numbers: "The **Quantity on Hand** field … shows the
actual quantity today according to posted item ledger entries. The **Projected Available
Balance** field is calculated and shows the quantity on hand plus scheduled receipts minus gross
requirements", with views by Event, Period, Location, Variant, BOM level and Unit of Measure
([Get an availability overview](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-how-availability-overview)).

**Gap.**

| Gap | Ours | Theirs |
|---|---|---|
| Unit of measure | stored as `unit`, shown nowhere | mandatory and visible in both (SAP "base unit of measure"; BC "Unit of Measure Code" on every line) |
| On hand vs available | one number, one In stock / Out of stock light | BC: Quantity on Hand vs Projected Available Balance; SAP: unrestricted-use vs confirmed |
| Where stock sits | flat warehouse list labelled from Commerce ("Default Source") | plant + storage location, with stock types |
| Cost / margin | none | BC Unit Cost from Costing Method; SAP valuation |
| Material grouping | `type` = simple/configurable only | material/item type, material group, division, item category group |
| Sellable flag | none | SAP material status blocks sales; BC has a Blocked item field |

**Inferred, not read:** that "Default Source" is Commerce's own vocabulary leaking into an ERP
screen. That follows from `lib/products.js:16` and the comment above it, not from a vendor doc.

### 2.2 Business partners

**What SAP shows.** Four partner functions sit on every sales document: "The following partner
functions exist, for example, in the standard system for sales and distribution: Partner Type
Customer — Sold-to party, Ship-to party, Bill-to party, Payer", and "In the simplest case all
required partner functions for partner type Customer are taken over by the customer"
([Partner Functions](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/0571bd534f22b44ce10000000a174cb4.html)).
A customer's commercial data is keyed by sales area — "you specify the sales area: sales
organization, distribution channel and division"
([Organizational Data in a Customer Hierarchy](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/cf8ac95360267214e10000000a174cb4.html)).

Credit is a live balance, not a stored number: SAP Credit Management's Manage Credit Accounts app
shows "details about the credit limit, credit exposure, and account control on credit segment
level", and lets you "Release and recheck documents with credit block, and navigate to the
related sales orders"
([Manage Credit Accounts](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/3cb1182b4a184bdd93f8d62e3f1f0741/be5747120f22446dbaeabc02044722d3-567.html)).

**What Business Central shows.** "The **Credit Limit** field on a customer card specifies the
maximum amount you allow the customer to exceed the payment balance before warnings are issued.
When you enter information in journals, quotes, orders, and invoices, Business Central tests the
header and lines to determine whether the document exceeds the credit limit." The behaviour is
configurable through **Credit Warnings**: Both Warnings / Credit Limit / Overdue Balance / No
Warning ([Register new customers](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-register-new-customers)).

Blocking is graduated, not a boolean
([How to block sales to customers](https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-block-customers)):

| Option | Effect (quoted) |
|---|---|
| Blank | "Transactions are allowed for this customer." |
| Ship | "New orders and new shipments can't be created for this customer. Existing shipments not yet invoiced can be invoiced." |
| Invoice | "New orders, new shipments, and new invoices can't be created … Existing shipments not yet invoiced can't be invoiced." |
| All | "No transaction is allowed for this customer, including payments." |

**Infor** (secondary) does the same job with a reason code: "Placing a customer on credit hold
prevents you from making shipments to that customer, but it does not place individual orders on
credit hold", and the automatic version needs "a code in the Limit Exceeded Credit Hold Reason
field" ([About Credit Hold](https://docs.infor.com/csi/9.01.x/en-us/csbiolh/lsm1454144036235.html)).

**Gap.** Credit used never moves and nothing is ever blocked by either field. We display two
credit columns and a Blocked switch, and all three are inert inside the ERP. The switch does
reach Commerce as an event (`lib/events.js:27`), so it is not decorative end-to-end — but inside
the ERP, where an ERP person is looking, it does nothing. There is also no partner detail page,
no addresses, no ship-to/bill-to/payer, no sales area beyond an unshown `salesOrg`.

### 2.3 Pricing conditions

**What SAP shows.** A condition record carries a validity period, and the document picks the
record valid on its own date: the pricing page describes the "date for the validity period of the
condition record", "Defines the validity period of the condition amount" and "Data from the
condition record is copied that is valid on the relevant date of the business document"
([Pricing and Conditions](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/5e49b753128eb44ce10000000a174cb4.html)).
Scales exist as a first-class part of a condition — SAP's collective price change warns about what
happens "If price scales exist … the period in which the changes are to be effective overlaps the
validity periods of the scale levels"
([Changing Prices Collectively](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/af9ef57f504840d2b81be8667206d485/0580b65334e6b54ce10000000a174cb4.html)).
Which record wins is decided by an access sequence over condition tables, not by an ad-hoc rule.

**What Business Central shows.** Special prices are a combination of "Customer / Item / Unit of
measure / Minimum quantity / Dates that define the period for which the prices are valid", and
line discounts work "in the same way". Price lists carry a **Status** (Draft / Active — "Draft
price lists aren't included in price calculations"), an **Applies-to Type** (customer, customer
price group), a currency, and a documented best-price rule: "The best price is the lowest price
with the highest line discount allowed on a given date", checked against the Order Date or
Posting Date, and resolved against the **Bill-to Customer No.**
([Record special sales prices and discounts](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-record-sales-price-discount-payment-agreements)).

**Gap.** Ours has no dates, no minimum quantity, no unit of measure, no currency, no
draft/active status and no group-level scope. Both reference systems have **all six**. Dates and
minimum quantity are the two that a B2B pricing person looks for immediately; I judge them
load-bearing. The free-text partner id and SKU inputs (`Pricing.js:79-80`) are a second, separate
problem: every ERP has value help on a key field, and typing `P000012` by hand on stage reads as
a prototype.

Worth saying plainly: our specificity ladder and the `applied` explanation
(`lib/pricing.js:38-48, 86-90`) are **closer to a real pricing procedure than most mock ERPs
get**. The gap is the record's fields, not the engine.

### 2.4 Sales orders

**What SAP shows.** Structure first: "All sales documents have basically the same structure. They
are made up of a document header and any number of items", where the header carries "Number of
the sold-to party, Number of the ship-to party and the payer, Document currency and exchange
rate, Pricing elements for the entire document, Delivery date", and each item carries schedule
lines with "all the data that is needed for a delivery"
([How Sales Documents are Structured](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/b064b65334e6b54ce10000000a174cb4.html)).

Then behaviour a status field cannot fake:

| Behaviour | SAP, quoted | Page |
|---|---|---|
| Document flow | you navigate a chain — "choose Environment Document flow"; "Position the cursor on the delivery and choose Goto Status overview" | [Displaying Status Overview](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/86a7c6535e601e4be10000000a174cb4.html) |
| Blocks | "You can block sales orders for billing and shipping. Delivery Blocks You can set a delivery block on header level as well as in the individual items and schedule lines" | [Blocking Sales Orders](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/0865b65334e6b54ce10000000a174cb4.html) |
| Availability | "Once ATP confirms the available quantity in the schedule lines for the item, the remaining order quantity that cannot be confirmed is automatically entered in the [Unconfirmed Quantity] field" | [Unconfirmed Quantity Display](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9905622a5c1f49ba84e9076fc83a9c2c/13e2ee571729f032e10000000a441470.html) |
| Backorders | "you can list sales documents relevant for requirements for particular materials and confirm them manually … withdraw already confirmed quantities and reassign them" | [Backorder Processing](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/b965b65334e6b54ce10000000a174cb4.html) |
| Rejection | an item can carry a reason for rejection, and "If all items in a sales order have a reason for rejection" the order is treated as finished | [Technical Jobs for Reprocessing and Final Reduction](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/5e23dc8fe9be4fd496f8ab556667ea05/6f43bc8a440c476d9e724b175e26caad.html) |
| Incompleteness | "The incompletion log reminds you when data important for further processing is missing from the sales document" | [Incompletion Logs](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/2da81dd9adfd4f72b9b421215050bd7f.html) |
| Returns are documents | separate types with their own forms: "Returns order … Credit memo request … Debit memo request" | [Extensibility for Output Forms](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/70bef2a887ea4b89b48fc7cdac3b7cf4.html) |
| Confirmations go out | supported output types include "Order Confirmation, Cash Sales, Sales Inquiry, Sales Quotation, Sales Contract…" | [Output Management for Sales Documents](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/d9cc17d1aa404aee9bf2d10599c9a8d1.html) |
| Shipping is its own step | the outbound delivery process covers picking then "goods issue posting"; posting a goods issue "triggers the output of a delivery note" | [Outbound Delivery Process](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/c7894a248ca14f74aca67f97528e5ad7/eb836e997a664d15b9ff904cf47cf443.html) |

**What Business Central shows.** Posting is the ERP verb, and it is per quantity, not per order:
"To ship only part of the order quantity, enter that quantity in the **Qty. to Ship** field …
To invoice only part of the shipped quantity, enter that quantity in the **Qty. to Invoice**
field"; "When you post a sales order, you create a shipment and an invoice. These documents can
be done at the same time or independently"; "before you can invoice, you must have recorded a
shipment"; and "When the sales order is fully posted, Business Central removes it from the list of
sales orders"
([Create a customer sales order](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-sell-products)).
Partial shipment is gated on the customer: "before you can use partial shipments … you must
specify that the customer accepts partial shipments by setting the **Shipping Advice** field",
and when it is Complete "the **Qty. to Ship** field appears blocked"
([Process partial shipments](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-send-partial-shipments)).
Orders also carry an **External Document No.** for the customer's own order number — which is
exactly the role our `commerceIncrementId` plays.

**NetSuite** (secondary) names partial fulfilment in the status itself: initial status Pending
Fulfillment (or Pending Approval with approvals on), then Partially Fulfilled, then Pending
Billing and Billed with Advanced Shipping on
([Sales Orders / Order Status](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1546625199.html)).

**Gap.** Our five statuses are the right *shape* — they read like an order-to-cash chain and the
transition table refuses illegal moves (`lib/orders.js:72-84`), which is more than most mocks do.
What is missing is everything below the header:

- no way to open an order at all (no detail page);
- no per-line quantity shipped/invoiced, so no partial anything;
- no follow-on document numbers — nothing called a delivery or an invoice ever comes into
  existence, the same record just changes a word;
- no net / tax / gross split, just `total` (`lib/orders.js:49`);
- no dates other than `createdAt`, so no requested delivery date and no invoice date;
- no ship-to, no addresses;
- no reason on a cancel;
- **no credit check on order creation** — `createOrder` never reads `blocked` or `creditLimit`
  (`lib/orders.js:34-56`), so an order for a blocked partner over their limit is accepted
  silently. All three reference systems do something here (BC warns, Infor holds, SAP blocks).

**Relevant to this repo's own rules:** an order move cannot be undone. `TRANSITIONS`
(`lib/orders.js:12-18`) makes `invoiced` and `cancelled` terminal and there is no returns or
credit-memo path, so the only way back is Wipe all records. Against the "whatever can be done can
be undone" property in the extension's CLAUDE.md, that is a finding in its own right — and real
ERPs answer it with a document (a return / credit memo), not with an undo button.

### 2.5 Events journal

No gap worth ranking. A real ERP does publish outbound changes and does have a monitor for
delivery failures, and ours has one with direction, attempts, last error, retry and requeue. I did
not verify the specific SAP counterpart (IDoc monitoring) against a source, so I am not claiming
the resemblance is exact — only that nothing here reads as fake.

### 2.6 Dashboard and screen chrome

SAP's equivalent landing surfaces are work lists, not counters: the Customers Overview app offers
"Quick Actions … Create a sales order … Create a customer return … Track sales orders"
([Customers Overview](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/b3f6a249a0094bec8deb67c0b8706095.html)),
and Sales Order Fulfillment exists specifically to "Resolve Billing Block in Sales Orders …
Remove the delivery block on header level and/or item level … Resolve Incomplete [orders]"
([Sales Order Fulfillment](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/bb8519540f831d6ee10000000a441470.html)).

Ours shows five row counts. Separately, **no list on any page has a search or filter control**
(verified: no `SearchField` anywhere in `screen/src`). With 182 products mirrored from a demo
store, finding the SKU you want to edit on stage means scrolling.

---

## Part 3 — Ranked gaps

Ranking rule: anything an ERP-literate viewer would **wince** at ranks above anything merely
absent, regardless of cost. "Commerce lift" means the gap, once closed, also makes the
integration story stronger rather than just the ERP prettier.

### Tier 1 — makes an ERP person wince

| # | Gap | Where it comes from | Why it matters on stage | Cost | Commerce lift |
|---|---|---|---|---|---|
| 1 | **An order cannot be opened.** No detail page; lines only ever appear as a count | SAP header/item structure; BC order page | The order IS the document. Clicking a sales order and getting nothing is the single most un-ERP moment on the screen. The API already answers `GET orders/:number` with `nextStatuses` | **M** — `screen/src/components/` new `OrderDetail.js` + wire from `Orders.js`; zero backend | Yes — the detail page is where the ERP number, the Commerce order and the applied contract price meet |
| 2 | **Credit limit and credit used are inert.** `creditUsed` is never written (`lib/partners.js:37,61`); `createOrder` never checks `blocked` or the limit | BC ("Business Central tests the header and lines to determine whether the document exceeds the credit limit"); SAP credit exposure; Infor credit hold | We put a credit column on screen and it reads $0.00 next to a $50,000 limit. Showing a number that is always zero is worse than not showing it | **S–M** — sum open orders in `lib/orders.js` on create/status change and store on the partner; refuse or warn in `createOrder` | Yes — the integration already writes company credit limits into Commerce; an exposure the ERP actually computes makes the B2B credit demo real |
| 3 | **Pricing conditions have no validity dates** (and no minimum quantity) | SAP: "Defines the validity period of the condition amount"; BC: "Dates that define the period for which the prices are valid" + "Minimum quantity" | The first two columns a pricing person's eye goes to on a conditions table. Their absence says "toy" faster than anything else in Part 2 | **S** — `lib/conditions.js` (2 fields + validation), `lib/pricing.js` (date filter in `mostSpecific`), `Pricing.js` (2 inputs + 2 columns) | Yes — "this contract price starts Monday" is a demo beat the cart webhook already supports without change |
| 4 | **Stock is one number with no unit.** `unit` is stored and never shown; no on-hand vs available | BC Quantity on Hand vs Projected Available Balance; SAP unrestricted-use vs confirmed | "Stock 12" with no UoM and no committed/available split is a webshop inventory badge, not an ERP one | **S** for showing `unit`; **M** for a committed/available split (needs open-order quantities, same computation as #2) | Yes — same open-order arithmetic as the credit exposure |
| 5 | **Currency hardcoded USD on products and partners** while orders honour `currency` (`Orders.js:9` vs `Partners.js:10`, `ProductDetail.js:27`, `ProductCells.js:13`, `productFormat.js:2`) | n/a — internal inconsistency | A EUR demo shows `$` on two screens and `€` on the third. Nobody misses this and it looks like a bug because it is one | **S** — one shared money helper fed from settings or the order currency | Neutral |

### Tier 2 — noticed, not fatal

| # | Gap | Source | Cost | Notes |
|---|---|---|---|---|
| 6 | No partial shipment / no per-line shipped + invoiced quantities | BC Qty. to Ship / Qty. to Invoice; NetSuite Partially Fulfilled; SAP schedule lines | **M–L** — `lib/orders.js` line shape + status machine, plus the detail page from #1 | The outbound event payload already carries per-item `qty` (`lib/orders.js:94`), so Commerce can receive a *partial* shipment today with no contract change. This is the biggest realism gain available per unit of work |
| 7 | No net / tax / gross on an order; one `total` | SAP header "Pricing elements for the entire document"; BC line amount vs totals | **S** if Commerce sends the split; **M** if the ERP must derive it | Commerce has the tax figures already |
| 8 | No follow-on documents — nothing is ever *created* when you ship or invoice | SAP document flow; BC posted shipment / posted invoice | **M** | Could be as small as a delivery number and an invoice number minted from `lib/counters.js` and shown in the order's history. That alone reads as document flow |
| 9 | No partner detail page: no ship-to/bill-to/payer, no addresses, no sales area shown, no orders for this partner | SAP partner functions and sales area; BC Ship-to Addresses | **M** | `salesOrg` already exists and is hidden (`lib/partners.js:31`) |
| 10 | Free-text partner id and SKU on the Pricing form | every ERP has value help on key fields | **S** — Spectrum `ComboBox` over the lists the page already loads | Also removes a live-demo typo risk |
| 11 | No search or filter on any list | n/a (universal) | **S–M** per table | Practical demo problem as well as a realism one |
| 12 | Dashboard shows counts, not work | SAP Sales Order Fulfillment / Customers Overview | **S** — "orders awaiting confirmation", "blocked partners", "events failed" from data already in `health` | Makes the ERP look like somewhere work happens |
| 13 | Blocked is a boolean, not graduated | BC Blank / Ship / Invoice / All; Infor credit hold with reason | **M** — touches the partner record, the event contract and the Commerce handler | Only worth it if #2 lands first; a graduated block that blocks nothing is no better than a boolean that blocks nothing |
| 14 | No returns / credit memo path; `invoiced` and `cancelled` are terminal | SAP returns order + credit memo request as document types | **M–L** | Also the answer to the reversibility rule in the extension's CLAUDE.md |
| 15 | No reason for rejection / cancellation reason | SAP reason for rejection; Infor credit hold reason code | **S** | A dropdown on the cancel action and a line in the history |

### Tier 3 — deep back-office; I would not spend demo budget here

| # | Gap | Why it can wait |
|---|---|---|
| 16 | Material group, division, item category group, material status | Nobody reads these in 20 minutes unless the screen invites them to |
| 17 | Cost / valuation / margin | Interesting, but it invites finance questions an SC may not want |
| 18 | Plant + storage location hierarchy over the flat warehouse list | Our warehouses map to Commerce sources honestly; renaming them "plant" would be a lie the data cannot support. (The README already claims a `plant` field that does not exist — fix the README, not the model) |
| 19 | ATP / schedule lines / backorder redistribution | Real, and genuinely deep. Only worth it if the demo narrative becomes "the ERP promises a date" |
| 20 | Incompletion log, output management (order confirmation PDFs), document types and number ranges per type | Invisible unless someone asks |

---

## Part 4 — The cheap bundle

If only a day is available, these five are all Small and together move the screen furthest:
show `unit` beside every quantity (#4a), one money helper instead of five (#5), validity dates on
conditions (#3), pickers instead of free-text on the Pricing form (#10), and a dashboard that
counts work instead of rows (#12). None of them touch the ERP↔Commerce contract
(`contract/erp-contract.json`) except #3, which adds fields to a condition record the contract
does not currently describe — check `test/contract.test.js` before starting.

---

## What I could not establish

- **I did not read full SAP Help pages.** `help.sap.com` is client-rendered; the portal's own
  content API (`http.svc/pagecontent`) returned HTTP 500 for every parameter combination I tried,
  and `http.svc/deliverable` returned 403. No browser MCP tool was available in this session, so
  the browser route named in the brief was not open to me. Every SAP claim above comes from SAP's
  own search service quoting those pages, with the page URL cited. The quotes are SAP's words;
  they are extracts, and a longer read could add nuance I have not seen.
- **learning.sap.com was not usable.** Every course URL returned by search 404'd on fetch
  (the site appears to have restructured its paths); `community.sap.com` returns 403 to
  automated fetches. No claim above rests on either.
- **Epicor is not represented.** I found marketing pages and a user forum, no primary
  documentation I was willing to cite. Infor and NetSuite are cited once each and were treated as
  corroboration, not as independent evidence.
- **I did not verify the SAP IDoc-monitor comparison** for our Events page, so §2.5 makes no
  claim about it.
- **I did not measure demo impact.** The tier ordering is my judgement about what an ERP-literate
  viewer notices, argued from what each vendor puts on its own default screens. It is not
  evidence about a real audience, and Steve may rank #6 (partial shipment) above #3 if the demo
  narrative leans on fulfilment.
- **Cost estimates are sizes, not plans.** S/M/L come from reading which modules and screens each
  change touches, not from attempting any of them.
- **No Adobe-internal source was consulted**, and nothing internal appears here.

## Sources

Code (read in full unless a line range is given):
`lib/products.js`, `lib/partners.js`, `lib/conditions.js`, `lib/pricing.js`, `lib/orders.js`,
`lib/events.js`, `lib/settings.js`, `lib/counters.js`, `lib/inbound.js`, `lib/sync.js`,
`lib/admin.js`, `lib/db.js`, `lib/screen.js:1-48`, `actions/*/index.js`,
`screen/src/components/*.js`, `contract/erp-contract.json`, `README.md`,
and `../commerce-erp-integration/README.md:1-80` for the demo narrative.

Microsoft Learn (Dynamics 365 Business Central) — fetched and read in full:
- [Create item cards for goods or services](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-how-register-new-items)
- [Register new customers by creating a Customer Card](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-register-new-customers)
- [How to block sales to customers](https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-block-customers)
- [Record special sales prices and discounts](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-record-sales-price-discount-payment-agreements)
- [Create a customer sales order and sell products](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-sell-products)
- [Process partial shipments](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-send-partial-shipments)
- [Get an availability overview](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-how-availability-overview)

SAP Help Portal (SAP S/4HANA on-premise) — read as quoted extracts via SAP's own search service,
see the caveat above. Pages cited: Partner Functions; Organizational Data in a Customer Hierarchy;
Manage Credit Accounts; Pricing and Conditions; Changing Prices Collectively; How Sales Documents
are Structured; Displaying Status Overview; Blocking Sales Orders; Backorder Processing;
Unconfirmed Quantity Display in Sales Documents; Incompletion Logs; Technical Jobs for
Reprocessing and Final Reduction; Extensibility for Output Forms and Email Templates of Sales
Documents; Output Management for Sales Documents; Outbound Delivery Process; Material Statuses;
Stocks in the Material Master Record; Creating a Material Master for a Service Product; Creating a
Vehicle Model; Customers Overview; Sales Order Fulfillment. URLs are inline at each claim.

Secondary:
- [Oracle NetSuite — Order Status](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1546625199.html)
- [Infor CloudSuite Industrial — About Credit Hold](https://docs.infor.com/csi/9.01.x/en-us/csbiolh/lsm1454144036235.html)
