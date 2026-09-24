# demo-erp screen realism — design

Design date 2026-09-23. Worktree `feature/erp-integration`.
Grounded in `.rptc/research/erp-realism-audit/research.md` (treated as established),
`.rptc/research/multi-erp-order-routing/research.md`, and a read of
`demo-erp/{lib,screen/src,actions,contract}` and `commerce-erp-integration/src/`.

**What this is.** One recommended rebuild of the mock ERP's screen and the data behind it.
No code. No cloud writes. Ordered slices at the end.

**Owner answers folded in (2026-09-23):** partial invoicing is **out** (§4.3), a
credit-held order is **created and held, not refused**, and the reason is what the real
systems do (§6.1), and the target is **one composite ERP** rather than a vendor skin
(§1.1). Those three decisions changed labels, the data model and slice sizes throughout.

---

## 0. Two rules that govern everything below

### Rule 1 — nothing is required before it works

*(Owner, 2026-09-23. This outranks every other preference in this document.)*

Adding the ERP integration must never require particular Commerce data to exist. The ERP
uses what is there and hides what is not. A store with no inventory sources, no company
accounts and no custom order statuses must give a demo that reads as a complete ERP — just
a smaller one. Add the data later, press Sync, and the feature appears. No redeploy, no
reset, no setting.

So every field in this design carries one of three labels:

| Label | Meaning |
|---|---|
| **A** | Always present. Intrinsic to the ERP: document numbers, statuses, line items, pricing conditions. Exists with zero Commerce data. |
| **M** | Present when mirrored. Appears only once the matching Commerce data has synced: warehouses/sources, company accounts. |
| **X** | Not shown. A deliberate omission, listed per screen with the reason. |

**Where the ERP learns what it has: from the records, never from a flag.** A stored
capability flag can go stale between syncs and it caches a decision the data has already
moved past. Every gate below is derived from rows the screen has already loaded, so it
costs nothing extra and corrects itself the moment a sync lands.

| Question | Answered by | Cost |
|---|---|---|
| Does this store have company accounts? | `health.counts.businessPartners > 1` — the walk-in partner is always exactly 1 | already loaded on every page |
| Are there warehouses worth showing? | distinct `warehouses[].code` across the products the screen already holds: **≥2 codes, or 1 code that is not `default`** | zero extra reads |
| Is there any stock at all? | any warehouse row with a quantity | same |
| Do custom order statuses exist? | never asked. The ERP's status events write an order *comment*, not a status change, so it already works without them | n/a |

The single-source case matters and is easy to get wrong: a Commerce store with MSI
effectively off still mirrors **one** warehouse, code `default`, name "Default Source".
That is not a warehouse feature — it is Commerce's plain stock item wearing a source's
clothes. Treat it as "no warehouses": show one **On hand** figure and no location column.

**A screen with nothing in it says what to do.** Never an empty table.

| Screen | When empty, it says |
|---|---|
| Products | "No products yet. Choose Sync on Settings to bring the catalogue in." |
| Customers | "This store has no company accounts. Orders belong to walk-in customers. Add companies in Commerce and Sync, and they appear here." |
| Sales orders | "No sales orders yet. Place an order in the storefront. If nothing arrives, check that sending orders to the ERP is on for that website." |
| Shipments / Invoices | "Nothing shipped yet. Open a sales order and create a shipment." |
| Pricing conditions | "No contract pricing yet. Add a condition to give a customer a negotiated price." |
| Event journal | "Nothing has happened yet. A price change, a sync or an order will show here." |

### Rule 2 — a warehouse and a Commerce source are one thing seen twice

The ERP's `warehouses[].code` **is** the Commerce inventory source code. `mirror.js`
already fills it that way. The screen must say so rather than leave the audience to ask.

- Column header: **Warehouse (Commerce source)**. The code column stays and shows the
  source code verbatim.
- One line under the inventory table: *"A warehouse here is the Commerce inventory source
  of the same code."*
- A shipment names the warehouse it shipped from, and that code rides the shipment event
  so Commerce deducts from the same source (§4.4).
- **Not designed now:** a per-warehouse "this ERP is the system of record" marker. The
  routing layer owns that decision. Nothing here blocks it, because a warehouse is already
  a first-class object with a stable code.

---

## 1. The organising idea

**Today the screen is lists. Real ERPs are documents.** That is the whole change.

A list is a way into a document. The document has a header of labelled fields, a table of
numbered lines, and a set of related documents before and after it. Everything else in this
design follows from that one sentence.

Three conventions carry most of the realism, and they are cheap:

**1. Header, lines, related documents.** Every business object opens as a document. The
order document does not exist today, and its absence is the single most un-ERP moment on
the screen — you click a sales order and nothing happens. SAP's own words: "All sales
documents have basically the same structure. They are made up of a document header and any
number of items."

**2. Numbered documents from number ranges.** A shipment and an invoice are not words on an
order, they are documents with their own numbers. Ten digits, a distinct leading digit per
type, minted from the existing monotonic counter that already survives a wipe. An SC saying
"invoice 9000000017 for order 0000001042" out loud is doing more work than any field on the
screen.

**3. Refusal with a reason.** The thing that separates a prop from a toy is that a viewer
can try to break it and it holds. A credit-held order will not ship. A pricing condition
outside its validity does not price. A shipment for more than was ordered is refused, in a
sentence. Today the status machine already refuses illegal moves — this extends that habit
to credit, validity and quantity.

### 1.1 One composite ERP — the vocabulary rule

*(Owner, 2026-09-23: "I'm trying to avoid building a dedicated ERP integration per SAP and
Dynamics. I'm trying to combine the best of all possible worlds that will be recognizable
to any user of any of these systems in some way.")*

**One ERP, legible to a user of any of them. Not a skin, not a vendor mode, no switch.**

The rule, applied to every label and number format in this document:

> No screen, label or number format may imply one vendor. Where SAP and Business Central
> differ, take the term the wider audience recognises. Where a vendor term IS the wider
> term, use it. A user of either system should be able to point at a screen and say "that
> is our X".

Realism comes from **structure and fields**, not from vendor words. A document with a
header, numbered lines, a base unit, per-location stock and a validity-dated price is
recognisable to an SAP user whatever the menu says. The corollary is that vendor-specific
menu words buy nothing and cost recognition with the other half of the room.

Decisions this rule forced, and what they replaced:

| Was (first draft) | Now | Why |
|---|---|---|
| "Materials" in the rail | **Products** | SAP says Material, BC/NetSuite/Infor say Item, Commerce says Product. "Item" collides with the line-item column on the order document. Products is vendor-neutral and already ours; the SAP recognition comes from the fields on the document, not the menu. |
| "Business partners" | **Customers** | Recognised by every audience. The SAP partner-function concept survives as a "Partner type: Sold-to" line on the document header. The collection stays `businessPartners` — internal name, no churn. |
| "Condition records" | **Pricing conditions** | "Condition" is the word our own pricing engine already uses and is legible to both. Bare "Condition records" is an SAP menu entry. |
| Condition codes `ZPR1` / `ZDI1` / `ZMAX` | **`CP01` / `CD01` / `MD01`** | `Z` is SAP's customer namespace — the clearest vendor tell in the first draft. Short alphanumeric codes read as configuration to any ERP audience without borrowing one vendor's convention. |
| Document types `OR` / `LF` / `F2` / `G2` | **dropped**; the header says "Document type: Sales order" | SAP document-type codes mean nothing to a BC user and are pure vendor signature. |
| "Delivery" / "Outbound delivery" | **Shipment** | SAP says outbound delivery, BC says posted shipment, NetSuite says fulfillment. Shipment is the wider word — *and* it is the word already on the wire (`be-observer.sales_order_shipment_create`) and in Commerce. One less translation in the room. |
| "Post goods issue" | **Post shipment** | Goods issue is SAP-only. "Post" is BC's verb and universally understood. |
| "Document flow" | **Related documents** | Same concept, no vendor signature. |
| "Net value / Gross value" | **Net amount / Tax / Total** | SAP's value / BC's Excl.–Incl. split, said plainly. |
| "Number ranges" on Settings | **Document numbering** | SAP says number ranges, BC says No. Series. Neither travels. |

**One stated exception.** Document numbers stay **ten digits, zero-padded** across all four
document types. That format leans SAP — BC would write `S-ORD-101001`. It is kept because
sales-order numbers in that format are already in the wild, already written into Commerce's
`ext_order_id`, and consistency across the four document types matters more than matching
either vendor's string. Recorded here so nobody has to rediscover the reasoning.

Terms kept because they are business words, not vendor words: sold-to, ship-to, bill-to,
credit exposure, credit limit, sales organisation, requested delivery date, base unit.

### 1.2 Deliberately not adopted

| Not doing | Why |
|---|---|
| ATP, schedule lines, backorder redistribution | Genuinely deep, and only worth it if the story becomes "the ERP promises a date". It is not. |
| Plant + storage location hierarchy | Our warehouses are honestly Commerce sources. Calling one a "plant" is a lie the data cannot support. (The README already claims a `plant` field that does not exist — fix the README.) |
| Costing, valuation, margin | Invites finance questions an SC may not want, and every number would be invented. |
| Incompletion log, output management, printed order confirmations | Invisible unless someone asks. |
| Product groups, divisions, item category groups | Nobody reads these in twenty minutes. |
| User accounts, roles, authorisations | Auth is one key. A role-based screen would imply users that do not exist. |
| G/L postings, payments, dunning, ageing | Not a finance demo. |
| **Partial invoicing** | Owner decision — see §4.3. |
| A switchable SAP/D365 skin | §1.1. Two half-right vocabularies are worse than one right one, and it doubles every screen. |

---

## 2. Navigation

**How the two reference systems land.** SAP Fiori's launchpad is a wall of grouped tiles —
it needs many tiles before it looks right, which is the wrong economics for a mock.
Business Central's role centre is one page: a handful of clickable activity cues plus a
navigation bar of areas. That is the shape to copy, and it is the vendor-neutral one.

**Today** we have a flat left rail of seven equal pages and a Dashboard of five row counts.

**Recommended**: the same left rail, grouped under headings, with an activity-cue Home.
Grouping is the cheapest realism in the whole document — an ERP menu is never flat.

```
  ACME ERP                        ← display name, from settings

  Home

  SALES
    Sales orders
    Shipments                     ← new
    Invoices                      ← new

  MASTER DATA
    Products
    Customers                     ← was "Business partners"
    Pricing conditions            ← was "Pricing"

  MONITORING
    Event journal                 ← was "Events"
    Settings
```

Every entry is **A** — always present. Shipments and Invoices exist as areas even in an ERP
with none yet; their empty state is the line in §0.

---

## 3. Screen by screen

Survives / replaced / new, first:

| Screen today | Verdict |
|---|---|
| `Dashboard.js` | **Replaced** by Home (activity cues) |
| `Products.js` | Survives, restyled + new columns |
| `ProductDetail.js` | Survives, new Basic data card, inventory card gains columns |
| `Partners.js` | Survives as **Customers**, restyled; a row now opens a document |
| `Orders.js` | Survives, restyled; **row actions removed** — actions belong on the document |
| `Pricing.js` | **Replaced** by Pricing conditions |
| `Events.js`, `EventDetail.js` | Survive, renamed Event journal, plus filters |
| `Settings.js` | Survives, gains document numbering and currency |
| — | **New**: Home, OrderDetail, CustomerDetail, Shipments, ShipmentDetail, Invoices, InvoiceDetail |

### 3.1 Home — replaces Dashboard

**Purpose.** Show the ERP as somewhere work happens, not as five row counts. SAP's own
credit-management guidance describes exactly this surface: "Credit personnel can call and
process overview lists of the blocked orders and deliveries"
([Reviewing and Releasing Blocked Documents](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/3cb1182b4a184bdd93f8d62e3f1f0741/4d6c287efc6d44b4e10000000a42189e.html)).

**Shows** — every cue is a number and a link that opens the matching list, filtered:

| | Cue | Source |
|---|---|---|
| A | Orders to confirm | orders with status `created` |
| A | Orders to ship | confirmed, not fully shipped |
| A | Orders to invoice | fully shipped, not invoiced |
| A | Open order value | Σ net amount of orders not yet invoiced, in the ERP's currency |
| M | Orders on credit hold | `creditStatus = held` — hidden with no company accounts |
| M | Blocked customers | hidden with no company accounts |
| A | Events failed / Events pending | from `health` |
| A | Last sync from Commerce | the stamp already in settings |

**Can do.** Click through to work. Nothing else — this is not a control panel; Sync and
Wipe stay on Settings.

**Omits (X).** Charts. Revenue-this-month (we cannot compute it honestly). A greeting
("Good morning, …") — there are no users.

### 3.2 Sales orders (list)

**Purpose.** Find an order and open it.

| | Column |
|---|---|
| A | Sales order (number) |
| A | Status — Open / In process / Completed / Cancelled |
| A | Sold-to — customer id and name |
| A | Customer reference — the Commerce increment id (Business Central calls this the External Document No.; that is exactly its role) |
| A | Order date |
| A | Requested delivery date |
| A | Net amount + currency |
| A | Shipping status — Not shipped / Partly / Fully |
| A | Billing status — Not invoiced / Invoiced / Credited |
| M | Credit — a small "On hold" badge; column hidden with no company accounts |

**Can do.** Search (number, customer reference, customer). Filter by status. Open a row.

**Omits (X).** The **Move to** button group in every row. A list that acts on records is
the most prototype-looking thing on the screen. Every action moves to the document.

### 3.3 Sales order (document) — NEW, the centrepiece

**Purpose.** The order IS the document. This is where realism is won or lost.

**Header** — two columns of labelled fields:

| | Field |
|---|---|
| A | Sales order · Document type "Sales order" · Order date |
| A | Customer reference (Commerce increment id) — labelled as a reference, never as money or truth |
| A | Sold-to — id + name, links to the customer document |
| A | Ship-to — "Same as sold-to". SAP's own default: "In the simplest case all required partner functions … are taken over by the customer." Honest, and it is the field an ERP eye looks for. |
| M | Sales organisation — `salesOrg`, stored today and displayed nowhere |
| M | Payment terms — from the customer |
| A | Currency · Requested delivery date |
| A | Net amount · Tax · Total (see §5 — all three derivable today, no contract change) |
| A | Overall status · Shipping status · Billing status |
| M | Credit status — Approved / On hold / Released, with the reason. Hidden with no company accounts. |

**Lines** — a table, numbered 10, 20, 30 (every ERP numbers lines in tens):

| | Column |
|---|---|
| A | Item |
| A | Product · Description |
| A | Order qty + **base unit** (`unit` is stored today and rendered nowhere) |
| A | Shipped qty |
| A | Net price · Net amount |
| A | Pricing — "Contract price CP01" / "Discount CD01 −12%" / "List", the condition id linking to the record that decided it. `lib/pricing.js` already returns `applied`; nothing on screen reads it. |
| M | Available — only when the product has stock records |

**Related documents** — a strip under the lines:

```
  Sales order 0000001042  ──►  Shipment 8000000031   ──►  Invoice 9000000017
  23 Sep, confirmed            23 Sep, posted             24 Sep, open
                          └─►  Shipment 8000000032
                               24 Sep, posted (5 of 12 EA)
```

Each box is a number, a date and a status, and each opens that document. Before anything
follows, the strip reads "No related documents yet" — which is itself an ERP thing to see.

**Can do.**

| Action | Rule |
|---|---|
| Confirm | from `created` only; refused while on credit hold, in words |
| Create shipment | a dialog listing open quantities per line, editable down, defaulting to all; **Ship from** picker (M — only with ≥2 warehouses) |
| Post shipment | on the shipment; this is what emits the shipment event |
| Create invoice | enabled only when every line is fully shipped. One invoice, whole order (§4.3) |
| Close remaining | zero the unshipped quantity on a line, with a reason, so a short-shipped order can still be invoiced. Without it, invoice-on-fully-shipped is a dead end |
| Cancel | with a reason from a short list |
| Release / Reject credit hold | M — SAP's own pair of actions (§6.1) |
| Create credit memo | from the invoice (§6.4) |
| Repeat order | create a new order with the same lines — the honest answer to "can I undo a cancel?" |

**Omits (X).** Schedule lines. Partner functions beyond sold-to/ship-to. Header and item
texts. Print/output. A conditions tab per line (the one Pricing column carries it).
Incompletion log.

### 3.4 Shipment (document) — NEW

**Purpose.** Prove that shipping creates a thing, not a word.

| | Field |
|---|---|
| A | Shipment number · Shipment date · Status (Open / Posted) |
| A | Sales order reference, links back |
| A | Ship-to |
| M | Ship-from warehouse (Commerce source) |
| A | Lines: Item · Product · Shipped qty + unit |

**Can do.** Post (once). Open the order. Nothing else.

**Omits (X).** Picking, packing, handling units, transport, tracking numbers. (The
integration's shipment transformer accepts `tracks[]` — leaving it unused is deliberate;
inventing carrier names is exactly the "present and obviously fake" failure.)

### 3.5 Invoice (document) — NEW

One invoice per order, covering the whole order (§4.3).

| | Field |
|---|---|
| A | Invoice number · Billing date · Status (Open / Credited) |
| A | Sales order reference · Shipment reference(s) |
| A | Bill-to — "Same as sold-to" |
| M | Payment terms |
| A | Net amount · Tax · Total |
| A | Lines: Item · Product · Qty + unit · Net price · Net amount |

**Can do.** Create credit memo (full). Open the order or a shipment.

**Omits (X).** Accounting document, G/L postings, payment status, dunning, PDF, partial
credit (same reasoning as partial invoicing — §4.3).

### 3.6 Products (list) — survives

| | Column |
|---|---|
| A | Product (SKU) |
| A | Description (`name`) |
| A | Type — "Finished good" / "Generic article" (today's simple/configurable, in ERP words) |
| A | Base unit — `unit`, currently invisible |
| A | Sales status — Sellable / Blocked for sales |
| A | List price |
| A | On hand |
| A | Committed — Σ ordered-not-shipped across open orders |
| A | Available — on hand − committed |
| M | Warehouses — a count, only with ≥2 codes |

**Can do.** Search by SKU or name (there is no search anywhere on the screen today, and a
182-product demo catalogue means scrolling on stage). Filter to out-of-stock / blocked.
Inline edit as today. Open a row.

**Omits (X).** Product group, division, item category group, costing, valuation.

### 3.7 Product (document) — survives, restructured

Keep the card layout — it works and it is tested. Add one card and widen another.

- **Basic data** (new card): Description (**stored today and never rendered**), Base unit
  (**same**), Product type, Sales status with a "Blocked for sales" switch. Free realism:
  two of these four fields already exist in the record.
- **Details**: name, SKU locked, Varies on — unchanged.
- **Pricing**: unchanged, plus the contract-price link it already has.
- **Inventory** (M): per warehouse — Warehouse (Commerce source) · Code · On hand ·
  Committed · Available · Status. With one `default` code, this collapses to a single
  **On hand** figure and no table. With no stock rows at all, the existing sentence stays.
- **Variants**: unchanged.

**Omits (X).** Unrestricted / quality-inspection / blocked stock types — our data cannot
support them. Replenishment, planning, vendor catalogue.

### 3.8 Customers (list) — survives as `Partners.js`

| | Column |
|---|---|
| A | Customer · Name |
| M | Sales organisation |
| M | Payment terms |
| M | Credit limit (editable) · Credit exposure · Available credit |
| M | Status — Open / Blocked for shipping / Blocked for invoicing / Blocked, all |

With no company accounts the list holds exactly one row, the walk-in customer. Then: no
credit columns (a walk-in has no credit), the row is labelled "Walk-in customers — every
order not linked to a company account", and the page carries the line from §0. That is a
complete, honest screen for a non-B2B store, and contract pricing still demos against it.

**Can do.** Search. Edit the credit limit and the blocking level in place. Open a row.

### 3.9 Customer (document) — NEW

| Card | Contents |
|---|---|
| Header (A) | Customer id · Name · Partner type "Sold-to" · Commerce company id · Customer group · Email domain · Sales organisation |
| Credit (M) | Credit limit (editable) · **Credit exposure** (derived, §6.1) · Available credit · Credit status · Blocking level (Open / Shipping / Invoicing / All) |
| Open items (A) | This customer's sales orders: number, date, status, net amount. The single most "real ERP" thing on a customer card. |
| Pricing (A) | Conditions scoped to this customer, linking to the record |

**Omits (X).** Addresses and contacts — Commerce companies have them and our mirror does
not carry them (open question O6). Bank data, ship-to list, several sales areas, payment
history and ageing.

### 3.10 Pricing conditions — replaces Pricing

**Purpose.** The pricing engine here is already closer to a real pricing procedure than most
mocks manage — the specificity ladder and the `applied` explanation are good. The gap is
the record's fields and the form.

| Code | Kind today | Reads as |
|---|---|---|
| `CP01` | `contractPrice` | Contract price |
| `CD01` | `contractDiscount` | Contract discount % |
| `MD01` | `maxDiscount` | Maximum discount % |

| | Column |
|---|---|
| A | Condition (`CP01`) + description |
| A | Sold-to — customer id + name, or "All customers" |
| A | Product — SKU + name, or "All products" |
| A | Amount — price with currency, or percent |
| A | Per / unit — "1 EA" |
| A | Minimum quantity |
| A | Valid from · Valid to |
| A | Status — Active / Scheduled / Expired, derived from the dates |

**Can do.** Add a record with **ComboBox value help** on customer and product — typing
`P000012` by hand on stage reads as a prototype, and it is a live typo risk. Delete.
Filter to active only.

**Pricing test** (keep, improve). Customer + product + quantity + date → the priced line,
the rules that applied **by name**, and — the high-value addition — the records that did
**not** apply and why: "CP01 for P000012: not valid until 1 Oct", "CD01: minimum quantity
10, this line is 4". That "why not" line is the most realism per line of code anywhere in
this document.

**Omits (X).** Access sequences and condition tables (the specificity ladder stands in).
Scales beyond one minimum-quantity step. Condition exclusion. Currency conversion. A
separate Draft status — validity dates already express "not yet live".

### 3.11 Event journal — survives, renamed

No structural gap here; the audit found none worth ranking. Two additions:

- Filter by direction (in / out) and state (delivered / pending / failed).
- Name the **document** each entry belongs to: "Shipment 8000000031 for sales order
  0000001042", not just an order number.

### 3.12 Settings — survives

Adds:
- **Currency** — one setting, used by every money field on every screen. Today orders
  honour the order's currency and products and customers hardcode USD, so a EUR demo shows
  two different symbols on three screens. That is a bug, and it is visible.
- **Document numbering** — read-only: the current counter per document type. Four numbers
  we already hold, and a configuration screen every ERP audience recognises.

Keeps: display name, last import, last wipe, sync record, Sync records, Wipe all records.

---

## 4. The document flow

### 4.1 The documents

Four, and no more.

| Document | Number range | Example |
|---|---|---|
| Sales order | `0000001000` + (exists today) | `0000001042` |
| Shipment | `8000000001` + | `8000000031` |
| Invoice | `9000000001` + | `9000000017` |
| Credit memo | `9500000001` + | `9500000003` |

All ten digits (§1.1 exception), one counter each in the existing `counters` collection.
Counters already survive a wipe, so shipment and invoice numbers can never collide after a
reset either — same rule, same module, no new mechanism.

### 4.2 Statuses, and what is stored versus derived

The load-bearing decision: **stop storing a single status word and derive most of it from
the quantities.** A derived status cannot drift into an impossible state, which is exactly
how real ERPs behave.

| Status | Stored or derived | Values |
|---|---|---|
| Order header | **stored** | `created` · `confirmed` · `cancelled` |
| Credit status | **stored** (a release is a human decision) | `approved` · `held` · `released` |
| Shipping status | derived: Σ shipped vs Σ ordered | none · partial · full |
| Billing status | derived: is there an invoice, is it credited | none · invoiced · credited |
| Overall status | derived | Open · In process · Completed · Cancelled |
| Shipment document | stored | `open` · `posted` |
| Invoice document | derived from the credit memo | open · credited |

**Compatibility, and why nothing downstream breaks.** The contract promises an order
`status`, the events are keyed `order.confirmed|shipped|invoiced|cancelled`, and the
integration writes "Order {status} in the ERP" as a Commerce comment. So `status` stays in
the API response, still answering one of today's five words, now **derived**:

```
cancelled                 -> 'cancelled'
invoice exists            -> 'invoiced'
any shipment posted       -> 'shipped'
header confirmed          -> 'confirmed'
otherwise                 -> 'created'
```

Legacy orders already stored as `shipped` or `invoiced` are upgraded on read: one
`upgradeOrder()` applied in `getOrder`/`listOrders` fills `shippedQty` from the line
quantity and synthesises an invoice record where the stored status was `invoiced`. Existing
deployed ERPs keep working with no migration script.

### 4.3 Partial shipment IN, partial invoicing OUT

**Owner decision, 2026-09-23.** Commerce supports partial invoices, but offers no mechanism
for capturing additional payments against an open order that has not been fully invoiced.
Solving that would be a real customisation on the Commerce side, of uncertain API support,
and it muddies what is meant to be a clean demo. So: **the ERP invoices the whole order,
once, and only once every line is fully shipped.**

**Partial shipment stays, and it is nearly free.** The outbound shipment payload already
carries per-item quantities (`orderEventPayload` → `items[{orderItemId, qty, sku}]`), and
the integration's transformer maps them straight to Commerce's `POST order/{id}/ship`
items. No contract change. This is the biggest realism gain per unit of work in the whole
document, and it is where the fulfilment story lives.

**A consequence worth writing down so nobody "fixes" it later.**
`invoiceOrder(params, orderId)` in
`commerce-erp-integration/src/commerce-extensibility-1/actions/order/commerce-order-api-client.js`
posts `{capture: true, notify: false}` with **no items**, so Commerce invoices the whole
order. With partial invoicing out of scope that is not a bug — it is exactly the behaviour
this design wants, and it needs no change. **Do not add items to it without re-reading this
section.** The `order.invoiced` event keeps carrying all the order's items, and the handler
keeps ignoring them; the two agree because the invoice is always the whole order.

**The dead end this creates, and its fix.** Invoice-on-fully-shipped means an order that can
never fully ship can never be invoiced. The **Close remaining** action (§3.3) zeroes an
unshipped quantity with a reason and makes the order invoiceable. Without it, short shipment
is a trap.

### 4.4 What each step emits

| ERP action | Event | Payload change |
|---|---|---|
| Confirm | `order.confirmed` | unchanged |
| Post a shipment | `order.shipped` | `items` carries **that shipment's** quantities, not the whole order. `stockSourceCode` added (M — omitted with no warehouse to name, and the handler then defaults it as it does today) |
| Create invoice | `order.invoiced` | unchanged — whole order, all items, handler ignores items |
| Cancel | `order.cancelled` | unchanged; the reason rides in the payload for the Commerce comment |
| Create credit memo | **new** `be-observer.sales_order_credit_memo_create` | new handler, new Commerce call (open question O5) |

One integration-side opportunity, already half-built: the shipment transformer reads
`params.data.stockSourceCode` and defaults it to `"default"`. A shipment that names its
warehouse makes Commerce deduct from the matching source. The field is **not** in the
contract's event value list — adding it is additive and the handler already reads it. This
is the concrete link between Rule 2 and Commerce's inventory.

---

## 5. Data model changes, per collection

Storage is App Builder Database with a **fixed** collection list (`COLLECTIONS` in
`lib/db.js`). That constraint drives the key structural call below.

### 5.1 The structural call: no new collections

Shipments, the invoice and the credit memo live **inside the sales order**, not in new
collections.

**Why.** Each belongs to exactly one order in this model. The collection list is fixed and
provisioning behaviour against an already-deployed database is unverified — avoiding that
question entirely is worth more than the tidiness of separate collections. One document
write per action, naturally atomic. A wipe clears orders and their shipments together,
which is correct. The Shipments and Invoices list pages flatten across orders (≤500 in a
demo) — one read, no index.

The deletion test: removing this structure would push per-document bookkeeping into three
callers. It earns its place.

### 5.2 Per collection

| Collection | Change | Contract impact | Integration must change? |
|---|---|---|---|
| `salesOrders` | lines gain `shippedQty`; order gains `shipments[]`, `invoice`, `creditMemo`, `creditStatus`, `creditReason`, `requestedDeliveryDate`, `netAmount`, `taxAmount`, `cancelReason`. `status` becomes derived and compatible (§4.2) | `order.response` gains keys — additive. `POST /:number/status` keeps accepting `shipped`/`invoiced` and implements them as "ship everything remaining" / "invoice the order", so nothing that calls it breaks | **No.** Partial invoicing is out, so `invoiceOrder` stays as it is (§4.3) |
| `salesOrders` (routes) | new `POST /:number/ship`, `POST /:number/invoice`, `POST /:number/credit-memo`, `POST /:number/close-remaining`; new read-only actions `shipments` and `invoices` (`GET`, `GET /:number`) | `routes` block grows | No |
| `businessPartners` | **delete** `creditUsed` (never written by anything, shows $0.00 forever — a field that is present and fake is worse than absent). Add `blocking` (`open` \| `shipping` \| `invoicing` \| `all`), replacing the boolean `blocked` | `import.partners` keeps accepting `blocked` and maps `true → all`, `false → open`, because Commerce's company status is a boolean and that is the honest mapping. The `partner.blocked` event keeps emitting a boolean | No — the event payload is unchanged |
| `products` | no shape change. `unit` and `description` are already stored; they start being *rendered*. Add `salesBlocked` (boolean, ERP-owned, not mirrored) | `import.products` unchanged | No |
| `pricingConditions` | add `validFrom`, `validTo`, `minQty`, `unit`, `currency`. The displayed code (`CP01`/`CD01`/`MD01`) is derived from `kind`, not stored | The contract does not describe a condition record today. Adding one is new surface, not a break. `quote.responseLine` gains `applied` (already returned, never listed) and `notApplied` | No — the cart webhooks read the quote's existing keys |
| `counters` | three new counter names: `shipment`, `invoice`, `creditMemo` | none | No |
| `settings` | add `currency` | none | No |
| `events` | no shape change. `stockSourceCode` added to the shipment event's value | `events.be-observer.sales_order_shipment_create.value` gains a key — additive, and the handler already reads it | No |

### 5.3 What breaks the integration's current reads

**Nothing.** With partial invoicing out, the only cross-repo change left is optional and
additive (`stockSourceCode`). The two remaining risks, named:

1. **Order `status` disappearing.** It must not. It stays, derived, answering one of the
   same five words.
2. **Dropping `blocked` from the partner event.** Commerce's company status is a boolean.
   The graduated blocking level is an ERP-side concept; the event keeps sending a boolean.

*(The first draft listed a third risk — a partial `order.invoiced` against an unchanged
`invoiceOrder`. The owner's decision in §4.3 retires it.)*

`contract/erp-contract.json` should go to `contractVersion: 2` in the first slice that
changes it, and the integration's vendored copy must move in the same pair of commits —
`test/contract.test.js` on both sides is what enforces it.

### 5.4 The multi-ERP door, stated as rules

From `.rptc/research/multi-erp-order-routing/research.md`, the routing layer will one day
send each ERP a **part** of a Commerce order. Four rules keep that possible:

1. **Never assume the ERP's lines are the whole Commerce order.** The order document shows
   the Commerce increment id as a *customer reference* and shows no Commerce money beside
   it. No "totals do not match" warning anywhere.
2. **Keep `commerceItemId` per line.** It is the join key the routing layer reconciles on.
3. **ERP order numbers are unique within one ERP only.** Nothing presents them as globally
   unique.
4. **Warehouse code stays the Commerce source code**, and a shipment names it. That is the
   hook a later "which ERP masters this source" decision hangs on — owned by the routing
   layer, not designed here.

---

## 6. Behaviour that makes it feel real

### 6.1 Credit: what the real systems do, and what we do

*(Owner, 2026-09-23: "Do whatever an ERP would do in real life." So this is settled by the
sources, not by demo convenience.)*

**SAP does not refuse the order. It creates it and blocks it, and a person releases or
rejects it.** In SAP's own words:

- "sales orders that cause the customer's outstanding credit to exceed the allocated credit
  limit are **blocked** and sales orders that are within the allocated credit limit are
  **released**"
  ([Approve Sales Order Credit Management](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/1dad2180e6f34b75ac77afce5cb5eda1/28f505bc9c5211dc2b8d000f20fcb6a9.html))
- "The system makes a credit check after a credit analyst has created a sales document
  (order, delivery) … Once the blocked sales document has been **released or rejected**, the
  system closes the documented credit decision."
  ([Check, Release, or Reject Sales Document](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/3cb1182b4a184bdd93f8d62e3f1f0741/9522fb56efff4910a083706afe62c5e1.html))
- "Credit personnel can call and process **overview lists of the blocked orders and
  deliveries**."
  ([Reviewing and Releasing Blocked Documents](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/3cb1182b4a184bdd93f8d62e3f1f0741/4d6c287efc6d44b4e10000000a42189e.html))
- A block stops the next document, not the current one: "If you set a delivery block, for
  example, you have to **release the sales document by removing the block before you can
  create a delivery**."
  ([Blocking or Releasing Complaints](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/ad65b65334e6b54ce10000000a174cb4.html))
- Both an order and a delivery can carry a credit block, each with a
  `CreditBlockReleaseDate` — SAP ships CDS views `I_CreditBlockedSalesDoc` and
  `I_CreditBlockedDeliveryDoc` for exactly these two work lists
  ([Credit Blocked Sales Document](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/19d48293097f4a2589433856b034dfa5/28bbd3a0e57a4b549b144c9c8e8c0213.html)).

**Business Central agrees for the over-limit case and differs for a blocked customer.** Its
credit limit "specifies the maximum amount you allow the customer to exceed the payment
balance **before warnings are issued**", and the Credit Warnings setting ranges down to "No
Warning" — a warning at entry, not a refusal
([Register new customers](https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-register-new-customers)).
Its **Blocked** field is graduated and does refuse new orders: Blank / Ship ("New orders and
new shipments can't be created … Existing shipments not yet invoiced can be invoiced") /
Invoice / All
([How to block sales to customers](https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-block-customers)).

**So the design, following the sources:**

| Condition | Result |
|---|---|
| exposure + this order > credit limit | order **created**, `creditStatus: held`, reason "Credit limit 50,000 exceeded by 3,200" |
| customer blocking is `shipping` or `all` | order **created**, `creditStatus: held`, reason "Customer blocked for shipping" |
| otherwise | `creditStatus: approved` |

A hold stops the **next** document, exactly as SAP's block does: Confirm and Create shipment
are refused while held, with the reason on screen. Two actions clear it, SAP's own pair:
**Release** (proceed) and **Reject** (cancel with reason "Credit rejected"). Raising the
credit limit does **not** silently release — a release is a decision someone made, and that
is the point. The Home cue "Orders on credit hold" is SAP's overview list of blocked orders.

**One stated departure, and why.** For a *blocked* customer both reference systems prevent
order *entry*; ours creates the order and holds it. The reason is structural, not
convenient: our orders arrive from Commerce as events, so the order already exists before
the ERP sees it. Refusing returns 4xx, and `order-sync.js` treats a non-retryable status as
`dropped` — the order would be destroyed rather than held, which is worse for the customer
and worse on stage. Holding produces the same outcome SAP's release list produces. This is
the inbound-order case, and it is the only place this design knowingly leaves the reference
behaviour.

**Exposure is derived, never stored.** `creditUsed` has never been written by anything and
is deleted. Exposure for a customer = Σ net amount of orders not yet invoiced + Σ invoices
not credited. One pass over orders the screen already loads. The check runs in
`createOrder`, which today reads neither `blocked` nor `creditLimit`.

Blocking levels, Business Central's four in plainer words:

| Level | Effect here |
|---|---|
| Open | everything allowed |
| Shipping | new orders arrive on hold; existing shipments can still be invoiced |
| Invoicing | new orders on hold; no new invoices |
| All | nothing proceeds |

All of this is **M** — with no company accounts there is no credit, the columns are absent,
and the walk-in customer's orders are never held.

### 6.2 Validity dates that apply

`mostSpecific` gains a date filter: a record applies only when
`validFrom ≤ date ≤ validTo`, where `date` is the **order's date** for an order and today
for a quote. A record with `minQty` applies only when the line quantity reaches it. Both
mirror Business Central's own rule ("the best price … on a given date") and SAP's ("data
from the condition record … valid on the relevant date of the business document").

The quote answer gains `notApplied[]` — the records that matched customer and product but
were ruled out, each with a reason. That feeds the pricing test panel (§3.10) and is the
cheapest credibility on the screen.

### 6.3 Transitions that refuse the impossible

| Attempt | Answer |
|---|---|
| Confirm an order already confirmed | "This order was confirmed on 23 Sep." |
| Ship more than remains on a line | "Item 10: 4 EA remain of 12." |
| Invoice before every line is shipped | "Item 20: 8 EA are not yet shipped. Ship them, or close the remainder." |
| Post a shipment twice | "Shipment 8000000031 was posted on 23 Sep." |
| Confirm an order on credit hold | "Credit limit 50,000 exceeded by 3,200. Release the order first." |
| Ship a product blocked for sales | "Product CAM-042 is blocked for sales." |
| Credit an invoice twice | "Invoice 9000000017 was credited by 9500000003." |

### 6.4 Reversibility — the honest answer

The repo's rule is that whatever can be done can be undone. Today `invoiced` and `cancelled`
are dead ends and the only way back is Wipe all records. Real ERPs answer this with a
document, not an undo button. So:

| Dead end today | The answer |
|---|---|
| `invoiced` | **Credit memo**, covering the whole invoice. Sets the invoice to Credited and the order's billing status with it. Full-only for the same reason partial invoicing is out (§4.3): a partial credit is the same payment problem in reverse, and one axis is enough. |
| `cancelled` | **Deliberately terminal, and the screen says so**: "A cancelled order cannot be reinstated." With a **Repeat order** action beside it that creates a new order with the same lines. Un-cancelling would also desync: the integration cancels the Commerce order, and Commerce cannot un-cancel. |
| A short-shipped order that can never invoice | **Close remaining** (§4.3) |
| Everything, for the demo | Wipe all records, unchanged. Counters never rewind, so numbers never collide across resets. |

Open question O5: the credit memo needs a new event and a new Commerce handler. If the
answer is "not now", the dead end stays and the screen should at least *say* it is a dead
end rather than simply offering nothing.

---

## 7. The demo path

Twenty minutes. Anything not on this path is lower priority by construction.

| # | Minutes | Where | What |
|---|---|---|---|
| 1 | 0.5 | ERP · Home | "A back office with work in it." The cues, not the counts. |
| 2 | 2 | ERP · Products → one product | Base unit, sales status, stock per warehouse — *"a warehouse here is a Commerce inventory source"*. With a single-source store, one On hand figure; the beat still works. |
| 3 | 2 | ERP · Customer document | Credit limit, exposure, available credit, their open orders. (No company accounts: skip to 4 and the walk-in customer carries the pricing beat.) |
| 4 | 3 | ERP · Pricing conditions | Add a contract price for that customer and product. Valid from today. Minimum quantity 10. Then the pricing test: at qty 4 the record does **not** apply, and it says why. |
| 5 | 3 | Storefront | That buyer signs in, sees list price at 4, the contract price at 10. Nothing was deployed between steps 4 and 5. |
| 6 | 1.5 | Storefront | Place the order. |
| 7 | 3 | ERP · Sales orders → the document | The new order. Header, numbered lines, the applied condition named on the line, no related documents yet. **This is the screen that carries the demo.** Confirm it. |
| 8 | 2 | ERP → Commerce Admin | Create a shipment for **part** of line 10 and post it. The related-documents strip grows a shipment. Commerce shows a partial shipment against the same source. |
| 9 | 1 | ERP | Ship the remainder — a second shipment, a second number. The order is now fully shipped. |
| 10 | 1 | ERP → Commerce Admin | Create the invoice. One invoice, whole order. Commerce shows it. |
| 11 | 2 | ERP · Customer → order | Raise exposure past the limit or block the customer; place a second order; it arrives **on credit hold** and refuses to confirm. Release it. |
| 12 | 1 | ERP · Event journal | Every step above, both directions, with document numbers. |

**Weight**: the order document (7–10), pricing conditions (4–5), customer credit (3, 11).
Home and Products are scene-setting. The slices are ordered to match.

---

## 8. Slices

**Status, 2026-09-24.** Built on `demo-erp` `feature/erp-grids` (commits `6009a62`,
`ffc7be2`): the **customer document** (slice 3's `CustomerDetail`, with derived credit
exposure — the hold/release half of slice 3 is NOT built), and all of **slice 4** except
"Committed / Available on products" (shipments as documents, partial shipment, Close
remaining, the invoice as a document, derived statuses, `upgradeOrder`, the two read-only
actions, `stockSourceCode` on the shipment event, the related-documents strip). One
departure from §3.5, recorded in `lib/fulfilment.js createInvoice`: the invoice's lines are
the order AS PLACED — what Commerce invoices with `capture: true` and no items — so a
closed line still bills and the two systems' invoice totals agree. Slice 1 shipped
earlier. Slices 2, 5, 6, 7 and the credit hold are open.


Each is independently shippable and demoable. Sizes are rough: S ≈ 1 day, M ≈ 2–3, L ≈ 4–5.

There is **no "polish" slice**. The audit's cheap bundle (unit of measure, one money helper,
validity dates, value help, a working landing screen) is distributed into the slices that
need it, because a polish slice is the one that gets cut.

### Slice 0 — Measure and bank bundle headroom · XS

The screen is bundled into one action with a 1 MB result ceiling and a 95% budget
(`scripts/build-screen.js`). Measured on disk today: **JS 818,651 bytes (78%), CSS 702,053
(67%)**. Headroom to the budget: ~177 KB JS, ~294 KB CSS. Every slice below adds Spectrum
components, and the screen needs several it does not use yet (SearchField, ComboBox, date
entry, Badge).

- Add an `npm run screen:size` script that prints both figures and the remaining headroom,
  so every later slice can check its own cost.
- **Candidate lever, to be measured, not assumed:** `defaultTheme` carries light, dark,
  medium and large scales. The Provider already hardcodes `colorScheme='light'`, so dark is
  dead weight, and large is for touch. Building a theme of `{global, light, medium}` should
  cut CSS materially. If Spectrum objects, keep `defaultTheme` and budget conservatively.
- Record both numbers before and after in the slice's own notes.

Not demoable. It gates everything else, which is why it is first and tiny.

### Slice 1 — The sales order document · M

The audit's #1 gap and the highest realism per unit of work: no backend change is needed to
start, because `GET orders/:number` already answers with `nextStatuses` and the screen has
simply never called it.

- New `OrderDetail` (split across OrderHeader / OrderLines / RelatedDocuments / action
  dialogs — a single file would run past the 500-line guideline).
- Header, numbered lines (10, 20, 30), base unit shown, Net / Tax / Total derived
  (Net = Σ line net, Total = `total`, Tax = the difference — honest, no contract change).
- The pricing source named per line from `applied`, which `lib/pricing.js` already returns.
- Actions move off the list and onto the document; cancel gains a reason.
- Related-documents strip, reading "No related documents yet".
- **One money helper fed by a currency setting**, replacing five hardcoded `currency: 'USD'`
  sites. The document shows money everywhere, so this lands here or it looks broken here.
- Rail regrouped (§2), the §1.1 vocabulary applied across existing screens, search on the
  sales order list.

Demo beat: steps 1, 7 of §7.

### Slice 2 — Pricing conditions with validity, minimum quantity and value help · M

- `validFrom`, `validTo`, `minQty`, `unit`, currency on the record; `CP01`/`CD01`/`MD01`
  codes displayed.
- `lib/pricing.js`: date and quantity filters in `mostSpecific`; `notApplied[]` in the quote.
- ComboBox value help for customer and product, replacing the free-text fields.
- Pricing test panel says why a record did not apply.
- First contract change → `contractVersion: 2`, and the integration's vendored copy moves in
  the same pair of commits.

Demo beat: steps 4, 5.

### Slice 3 — Credit that works · M

- Delete `creditUsed`. Derive exposure.
- `blocking` replaces `blocked`; the event keeps sending a boolean.
- Credit check in `createOrder` that **holds rather than refuses** (§6.1), with Release and
  Reject on the order document and the customer.
- New `CustomerDetail` with credit, open items and pricing.
- Every credit field is **M** — absent with no company accounts.

Demo beat: steps 3, 11.

### Slice 4 — Shipments and the invoice as real documents · M

*(Was L in the first draft. Partial invoicing being out removed the per-line invoiced
quantities, the second status axis and the cross-repo change — this slice no longer touches
the integration at all.)*

- Line quantity `shippedQty`; derived shipping and billing status; `status` becomes
  derived-compatible; `upgradeOrder()` for legacy records.
- `shipments[]`, `invoice`, `creditMemo` on the order; three new counters; the
  related-documents strip fills.
- New routes and two new read-only actions; Shipments and Invoices lists and documents.
- Partial shipment, including a second shipment for the remainder.
- **Close remaining** on a line, so short shipment is not a trap (§4.3).
- Shipment names its warehouse (M) → `stockSourceCode` on the shipment event.
- Committed / Available on products becomes real, because open order quantities now exist.

Demo beat: steps 8, 9, 10.

### Slice 5 — Credit memo · M

- Full credit memo against the invoice; invoice status; order billing status.
- New event `be-observer.sales_order_credit_memo_create`, a new integration handler, a new
  Commerce credit-memo call.
- The cancellation dead end gets its sentence and its **Repeat order** action.

Gated on open question O5. This is the only remaining slice with a cross-repo change.

### Slice 6 — The product document as a master record · S–M

- Basic data card: description and base unit (both already stored), product type, sales
  status with a working "Blocked for sales" switch that refuses shipment.
- Inventory card gains Committed and Available per warehouse; the warehouse/source
  vocabulary line; the single-source collapse.
- Products list columns; search.
- Fix the README's `plant` claim — the field does not exist.

Demo beat: step 2.

### Slice 7 — Home, and search everywhere else · S

- Home replaces Dashboard: work cues, not row counts; every cue links to a filtered list.
- Search and status filters on the remaining lists (customers, conditions, event journal).
- Event journal names the document each entry belongs to.
- Settings gains document numbering.

Demo beat: steps 1, 12.

**The search half of slice 7 can be pulled forward cheaply** if the 182-product scroll is
hurting rehearsals before then. Say so rather than suffering it.

### Explicitly not in scope

Partial invoicing and partial credit memos (§4.3). ATP, schedule lines, backorders. Costing,
valuation, margin. Plant and storage-location hierarchy. Product groups, divisions, item
category groups. Incompletion log. Printed output and order confirmations. User accounts,
roles, authorisations. Returns as a separate document type. Purchasing, production,
procurement. Warehouse picking and packing. G/L, payments, dunning, ageing. Multi-currency
conversion. Addresses beyond open question O6. The routing layer itself.

---

## 9. Verification and rollback

**Verification per slice**, in this order:

1. `node --test` — the existing suites plus new ones mirroring them: `orders.test.js` grows,
   a new `documents.test.js` for shipment/invoice/credit-memo arithmetic and refusals,
   `pricing.test.js` grows for validity and minimum quantity, `records.test.js` for the
   customer shape change, `contract.test.js` for every contract edit.
2. `test/contract.test.js` **in both repositories** for any contract change — that pair is
   the only thing stopping silent drift. Only slices 2 and 5 need it now.
3. `npm run screen:size` — refuse a slice that puts either file past the budget. The build
   script already fails there, which is the backstop, not the check.
4. The demo path in §7, walked end to end, twice: once against a store **with** company
   accounts and several sources, once against a store with **neither**. Rule 1 is only real
   if the second walk is done.
5. The refusal table in §6.3, tried by hand. These are the behaviours an audience tests.

**Rollback.** Every slice is additive to a deployed ERP; the ERP is transitory by design and
`POST admin/wipe` plus a re-sync is the reset. Two places need care:

- **Slice 4 touches stored order shape.** `upgradeOrder()` is the compatibility seam; a
  rollback to the previous build leaves orders carrying extra keys the old code ignores, and
  a stored header status of `created`/`confirmed`/`cancelled` is valid in both. Orders
  mid-flow (partly shipped) would read as `confirmed` on the old build — recoverable, and
  worth saying out loud before deploying it the morning of a demo.
- **Contract changes** must be reverted in both repositories together or the vendored copy
  test fails on the other side.

**Assumptions, and what would falsify each:**

| Assumption | Falsified by |
|---|---|
| Adding Spectrum components fits the 1 MB ceiling | `npm run screen:size` after slice 0 |
| Trimming the theme to light+medium cuts CSS without breaking Spectrum | the same build |
| `stockSourceCode` reaches the right Commerce source | one partial shipment against a two-source store |
| Flattening shipments across ≤500 orders is fast enough for a list page | the Shipments list at demo scale |
| A store with no MSI sources mirrors exactly one warehouse, code `default` | reading `mirror.js` says so; confirm on a real single-source store during the slice-6 walk |

*(The first draft also assumed Commerce's invoice endpoint takes per-item quantities. §4.3
retires that assumption — we never send them.)*

---

## 10. Questions for the owner

### Answered 2026-09-23

| # | Question | Answer, and where it landed |
|---|---|---|
| **O2** | Partial invoicing in or out? | **Out.** Commerce supports partial invoices but has no mechanism for capturing additional payments against an open, not-fully-invoiced order; solving it is a real Commerce-side customisation of uncertain API support and muddies a clean demo. Partial **shipment** stays. §4.3, and it shrank slice 4 from L to M. |
| **O3** | Credit-held order: accept and hold, or refuse? | **Accept and hold** — because that is what SAP does, not because it suits the demo. Cited in §6.1, with the one stated departure for a blocked customer and the structural reason for it. |
| **O7** | What does "realistic across multiple systems" mean? | **One composite ERP**, legible to a user of any of them. Not a skin, not a vendor mode. §1.1 carries the rule, the label changes it forced, and the one stated exception. |
| **O1** | Materials vs Products in the rail? | **Resolved by §1.1**: Products. Listed here because the answer changed — the first draft recommended Materials, and the composite rule overruled it. |

### Still open

| # | Question | My recommendation |
|---|---|---|
| **O4** | Cancellation terminal plus **Repeat order** — accepted? Or do you want an un-cancel? | Terminal. Commerce cannot un-cancel either, so an un-cancel would desync in front of the audience. |
| **O5** | Credit memo: worth a new event plus a new Commerce handler (slice 5), or out of scope? | Worth it. It is the only real answer to the reversibility rule, and "what happens when a customer returns something" is asked in most B2B rooms. Full credit only, matching O2. |
| **O6** | Should customer **addresses** be mirrored from Commerce companies? A mirror change plus a contract change. | Yes, but late — after slice 3. A customer card with no address is visibly empty, and Commerce companies have one. Until then the card omits the field rather than showing a placeholder. |
| **O8** | Does a second ERP instance need to *look* different for the routing demo (two ERPs side by side)? | Display name only, which already exists. Anything more is a skin by another name — see §1.1. |

---

## 11. What I deliberately left out

- **Per-screen Spectrum component lists and layout.** Slice 0 has to measure the bundle
  first; committing to `DatePicker` before that measurement would be writing a cheque the
  ceiling may not cash.
- **The routing layer's own design.** Section 5.4 states only the rules that keep its door
  open. That layer is its own plan.
- **Anything needing a cloud write to verify.** The remaining assumptions in §9 can only be
  settled against a live store; they are listed as assumptions rather than answered.
- **Exact test names and file splits.** They belong in the per-slice step files.
- **Re-doing the market research.** `.rptc/research/erp-realism-audit/research.md` is taken
  as established. The credit citations in §6.1 are new to this document and were fetched for
  it; they come from SAP's own search service quoting those pages, with each page URL
  inline — extracts rather than full pages, the same caveat the audit records.
- **A migration script.** Slice 4's `upgradeOrder()` on read does the job, and the ERP is
  transitory by design — a wipe and re-sync is always available.
