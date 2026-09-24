# The two-way Commerce ↔ ERP integration, reviewed against its two principles

Date: 2026-09-24. Read: `commerce-erp-integration` at `0fcec33` (README, `src/lib/ledger.js`,
`detach.js`, `commerce-before.js`, `order-sync.js`, `reset`, the four order handlers,
`app.commerce.config.ts` subscriptions) and `demo-erp` at `1c00e32`. Plan record:
`.rptc/plans/erp-integration/overview.md` (decisions 3, 8, 11, 19–21, 25, 26).

## The two principles, and where they are written down

1. **Commerce is the system of record; the ERP is transient.** Owner, 2026-09-14 and
   2026-09-23. Written in the integration README ("Commerce is the permanent system; the ERP
   is transient") and in `lib/ledger.js`, `lib/detach.js`, `lib/commerce-before.js`.
2. **To the audience, the ERP looks like the system of record.** Decision 19: change a
   price/stock/credit limit in the ERP and watch Commerce follow; place an order and watch it
   arrive with an SAP number; move it through confirmed → shipped → invoiced and watch
   Commerce follow.

**The cleanup standard exists and is precise.** README, "Commerce is the permanent system":
*every ERP → Commerce write that Commerce CAN undo is read before the write
(`commerce-before.js`, `NOT_READ` when unknown), ledgered with its BEFORE value
(`ledger.js`, first-before wins), and put back by `detach` (reset and removal). What stays
is only what Commerce cannot delete: order notes, shipments, invoices, cancellations. Orders
are the stated exception — the ERP number is cleared from them. Any new ERP → Commerce write
has to answer: can Commerce undo it, and if so, where is it ledgered?* This is the test every
item below is held to.

## Entity coverage matrix (added 2026-09-24, owner's gate before the order split)

Owner, 2026-09-24: before the order split — a major customisation — every native Commerce
entity must have its ERP counterpart reflected properly, with a bidirectional sync where one
belongs. This matrix is that check, read from `app.commerce.config.ts` (the three Commerce
events and two webhooks subscribed), the handler directories, `lib/mirror.js`,
`lib/commerce.js`, `lib/detach.js`, and the ERP's `lib/`. "—" means no sync exists; "by
design" means the research or plan says there should be none, with the reason.

| Commerce entity | ERP counterpart | Commerce → ERP | ERP → Commerce | Reversible on reset | Verdict |
|---|---|---|---|---|---|
| Product (simple, configurable, variants) | product | `catalog_product_save_commit_after` → create/update (name, price, type, parent/variant); full mirror | name, price (`catalog_product_update`, ledgered) | yes (ledger) | **covered**; product DELETE in Commerce never reaches the ERP — the record lingers until reset. **Gap G1** (small): subscribe to the delete event or let the mirror remove absent SKUs |
| Product attributes beyond name/price (description, status, visibility, weight, categories) | — | — | — | n/a | **by design**: Commerce owns marketing data (realism audit; `lib/products.js` header). Sales status (blocked for sales) is an ERP-side flag with no Commerce write — plan §3.7 |
| Inventory source (the location) | warehouse | full mirror only (code, name) | — | n/a | **covered as a read**; a source ADDED in Commerce after install appears at the next mirror/reset only. Acceptable |
| Source item (qty per SKU per source) | warehouse quantity | `cataloginventory_stock_item_save_commit_after` = the LEGACY stock item = the **default source only** (`lib/products.js withDefaultStock`); full mirror reads all sources | `catalog_stock_update` per source → `POST inventory/source-items` (ledgered) | yes | **Gap G2 (real)**: a Commerce Admin edit of a NON-default source's quantity never reaches the ERP until reset; the ERP then overwrites it on its next stock edit. Verify whether an MSI source-item event exists (`inventory_source_item_save_after`, unverified); else the minute refresh should re-read source items for changed SKUs |
| Stock (the website's aggregate) | — | — | — | n/a | by design: derived in Commerce from sources |
| Website / store / store view | sales organisation | — today; **plan `erp-business-structure`** (per-website setting, structure block in the mirror) | — | derived, rebuilt | **planned** |
| Store Information (seller address, VAT) | company code identity | plan (mirror reads it) | — | rebuilt | **planned** |
| B2B company (buyer) | business partner (sold-to) | minute refresh + full mirror: name, group, email domain, credit limit, status. **No Commerce event** — a company created or edited in Admin lands within a minute | credit limit, block (ledgered) | yes | **covered**; legal name, tax id, reseller id, legal address, admin's website **planned** (structure plan step 02). Payment terms are ERP-only with no Commerce field — by design |
| Company credit (limit) | partner `creditLimit` | refresh/mirror | `company_credit_update` (ledgered) | yes | covered |
| Company credit (balance / available, "Payment on Account") | partner exposure (derived from ERP orders) | — (`getCompanyCredit` reads `credit_limit` only) | — | n/a | **Gap G3 (decide)**: two exposures can disagree — Commerce's balance moves only with Payment-on-Account orders; the ERP's with every uninvoiced order. Either read Commerce's balance into the customer document as "Commerce balance", or state that the ERP's exposure is the demo's truth. Recommend the second and say so on the card |
| Company status (approved/blocked) | partner `blocked` | refresh/mirror | `company_status_update` (ledgered) | yes | covered; graduated blocking level is ERP-side (slice 3) |
| Customer group / shared catalog | partner `customerGroupId` (resolution hint only) | refresh/mirror | — | n/a | by design: pricing comes from the ERP's conditions through the cart webhooks, not from shared catalogs |
| Customer (individual, B2C) | — (walk-in partner) | — | — | n/a | by design (decision 5: individuals are CRM, not ERP) |
| Company user / address book | — | — | — | n/a | by design; the company's legal address is the one address mirrored (planned) |
| Cart (pricing) | quote | totals-collector webhooks (contract price, discount ceiling) | the answer | nothing written | covered |
| Order (create) | sales order | `sales_order_save_commit_after`, new orders only → `POST orders`; `ext_order_id` + note written back | — | `ext_order_id` cleared by detach; note stays (exception) | covered |
| Order (edit, hold/unhold, cancel IN Commerce) | — | **—**: the order handler skips any save that is not new | hold/unhold **planned** (credit hold); cancel from ERP covered | hold: unhold on detach (planned) | **Gap G4**: an order cancelled or put on hold in Commerce Admin leaves the ERP unaware. Same shape as shipments/invoices (item 1): subscribe to the save event's non-new saves for `state` changes and tell the ERP with an origin marker |
| Order status (confirm) | header `confirmed` | — | `sales_order_status_update` → comment (+ Processing if set) | note stays (exception) | covered |
| Shipment | shipment document | **—** (item 1, in scope) | `sales_order_shipment_create` with that shipment's items + `stockSourceCode` | stays (exception) | ERP→Commerce covered; Commerce→ERP **in scope, not built** |
| Invoice | invoice document | **—** (item 1) | `sales_order_invoice_create` (whole order, capture) + comment | stays (exception) | same |
| Credit memo / RMA | credit memo (slice 5) | — | — | stays | **not built either way**; gated on O5 |
| Order comments | — | — | ERP writes comments | stays | by design |
| Payment / transaction | — | — | capture happens inside the invoice call | stays | by design |
| Negotiable quote, purchase order approval, requisition list (B2B) | — | — | — | n/a | by design: not in the demo story |
| Category, price rule, promotion | — | — | — | n/a | by design: marketing data |
| Currency (base, per website) | order `currency`; ERP-wide setting missing | order carries it | — | n/a | **Gap G5 (small)**: the ERP has no currency of its own; products and credit print USD regardless (realism audit 1.6, UI audit Settings). The structure plan's Store Information read supplies it per website |

**Reading the matrix.** Every entity the demo story touches is covered ERP → Commerce and
reversible where Commerce can reverse it. The direction that is thin is **Commerce → ERP
for CHANGES made in Commerce Admin after the order is created**: shipment, invoice, cancel
and hold made in Commerce (items 1 and G4), and a non-default source's quantity (G2). Those
are the ones that would make the ERP visibly wrong on stage if anyone touched Commerce
directly, and they are all the same shape: subscribe to the Commerce event, tell the ERP,
and have the ERP not echo it back (the `origin` marker). G1, G3 and G5 are small and
decidable.

**What this means for the order split.** The split needs the SKU's source (covered),
the website's sales organisation (planned), the order create path (covered) and the
per-part shipment and invoice both ways (ERP → Commerce covered; Commerce → ERP item 1).
So the gate before the split is: build item 1 + G4 (Commerce-side order changes flow to
the ERP), fix G2 (per-source stock), decide G3 and G5, then the structure plan. The credit
hold is independent and can go first because demo step 11 needs it.

## What flows today (verified in code)

| Direction | What | Reversible? |
|---|---|---|
| Commerce → ERP | order saved → ERP order, number written back as `ext_order_id` + note | ERP number cleared by detach; note stays (exception) |
| Commerce → ERP | product/stock events, company refresh every minute, mirror at install/reset | n/a — Commerce overwrites the ERP's copy, by design |
| Commerce ↔ ERP | cart pricing webhooks (contract price, discount ceiling), `required: false` | nothing written |
| ERP → Commerce | price, name → product; stock → source item | **ledgered** (before read, revert on detach) |
| ERP → Commerce | credit limit, block → company | **ledgered** |
| ERP → Commerce | confirm → comment (+ Processing if set); shipment → `order/{id}/ship` with items + `stockSourceCode`; invoice → `order/{id}/invoice` (capture, whole order) + comment; cancel → `orders/{id}/cancel` + comment with the ERP's reason (built today) | **documented exception** — Commerce cannot delete these |

**Verdict on the standard.** Everything this turn added on the ERP (shipments as documents,
partial shipment, close remaining, the invoice, the cancel reason) reaches Commerce through
the four order handlers, all of which are in the documented exception. Nothing new needs
ledgering. `stockSourceCode` makes Commerce deduct from a named source — that is Commerce's
own shipment behaviour, inside the exception, and the ERP does NOT deduct stock itself
(Commerce's stock event brings the new figure back), so no second write to unwind.

## Where principle 2 is thin — ranked

Ordered by how much the ERP would stop looking like the system of record if an audience
pressed on it.

### 1. A Commerce-side shipment or invoice leaves the ERP wrong (HIGH) — IN SCOPE

If an SC (or the merchant in the story) ships or invoices an order **in Commerce Admin**, the
ERP still says *confirmed*. Nothing subscribes to Commerce's shipment or invoice events.

**Owner decision, 2026-09-24: build it.** The first draft of this section leaned toward
skipping it because the demo script fulfils from the ERP. That was reasoning from the script,
not the goal: a system of record that a click in Commerce Admin can make wrong is not one,
and "what if the warehouse ships it in Commerce?" is exactly where a real customer probes.
In a real business fulfilment happens where the goods are, and a real ERP integration
carries a Commerce-side shipment back so the ERP's record matches.

**Fix.** Subscribe to `observer.sales_order_shipment_save_commit_after` and
`observer.sales_order_invoice_save_commit_after` (the kit's `order-commerce/*` route is the
shape) and tell the ERP: `POST orders/:n/shipments` (lines from the Commerce shipment's
items by `order_item_id` → the ERP's `commerceItemId`) then `…/post`; `POST orders/:n/invoice`.
**The loop is closed by design:** the ERP's post would raise `order.shipped` and create a
SECOND Commerce shipment. So the moves take an `origin: { event }` (the pattern
`journalOrder` already uses for imports); with an origin present the ERP journals the
inbound entry and does **not** emit the outbound event — "this came from Commerce, Commerce
already has it". Contract: `origin` on the move requests. Changing a subscription after
install needs an uninstall/install cycle (README).

### 2. Credit hold is the missing beat, and it is bidirectional (HIGH)

Plan §6.1 / slice 3: an over-limit or blocked customer's order is **created and held**;
Confirm and Create shipment refuse; Release / Reject clear it. Demo step 11 depends on it and
nothing else on the path is missing.

**The Commerce half — owner decision 2026-09-24: build it.** Commerce has
`POST orders/{id}/hold` and `POST orders/{id}/unhold`, which put an order in status *On Hold*
and back. A held ERP order → a held Commerce order is the most convincing "the ERP decided"
moment the integration can show, and it is **reversible by construction** (unhold). Per the
standard: can Commerce undo it? Yes. Where is it ledgered? It need not be — detach unholds
every order the ERP holds (read from the ERP's own order list, as it clears `ext_order_id`).
Reject → the existing cancel event with reason *Credit rejected*.

New event `be-observer.sales_order_hold` (value: the order payload + `held: true|false` +
`reason`), one handler, contract change.

### 3. `stockSourceCode` shipped, but the ERP cannot name a warehouse (MEDIUM)

The shipment now carries the warehouse; Commerce's vocabulary (`default`, "Default Source")
is what the audience reads. The UI audit's Settings → Warehouses (ERP names for Commerce
source codes) closes it. ERP-only; no contract change.

### 4. Pricing source on the order line (MEDIUM)

The order document cannot say "Contract price CP01" per line because the ERP never learns
which condition the cart used. The quote it answered at cart time knew (`source`). Add
`source` to the order request lines (`erpOrderFrom` in `order-sync.js` would need the quote
result, which the cart webhook has and the order event does not — so either the ERP
re-derives at order creation against its own conditions, or the integration stores the last
quote per cart). Recommend the ERP re-derives at `createOrder` and stores `pricingSource` on
the line: it is the ERP's own pricing and it is "as priced when the order arrived". Contract:
`order.response` line gains a field. Small.

### 5. Confirm marks Processing only if a setting says so (LOW, already right)

`mark Processing on confirm` is a per-website setting. Fine; note it in the demo script.

### 6. What Commerce writes back that the ERP then re-imports (LOW, already right)

An ERP price edit → Commerce → product event → ERP import of the same value. Verified as
the intended loop (decision 3); the import overwrites with the identical number and the
journal shows both directions. No change.

## What was built this turn on this front

- `demo-erp 1c00e32` + `commerce-erp-integration 0fcec33`: the ERP's cancel event carries
  its reason; the integration writes *"Cancelled in the ERP (ERP sales order N): Duplicate
  order"* into the order history. Contract: `sales_order_cancel` gains `reason`. Inside the
  documented exception; nothing to ledger.
- `demo-erp ffc7be2` + `commerce-erp-integration 64a6844`: shipments and invoices as
  documents; the shipment event carries that shipment's items and `stockSourceCode`
  (the handler already read and defaulted it). Contract vendored.

### 7. Business structure: nothing maps Commerce's websites to ERP sales organisations (MEDIUM)

Every partner carries `salesOrg`, defaulting to `'1000'` (`lib/partners.js importPartners`);
the mirror never sets it (no `salesOrg` anywhere in the integration's `src/`), orders carry no
sales organisation of their own, and the ERP has no screen for the structure. So the
customer and order documents print "Sales organisation 1000" for everyone — present and
meaningless, the failure the realism audit ranks worst.

An ERP's business structure (SAP: sales organisation → distribution channel → division;
BC: company → responsibility centre) and Commerce's (website → store → store view) are two
hierarchies that a real integration MAPS, and the mapping is configured on the Commerce side
because that is where the merchant's structure is owned. The integration already has the
mechanism: its settings are scoped per Default Config / website / store / store view
(`businessConfig` in `app.commerce.config.ts`, read by `lib/settings.js`, edited in the
Admin screen's settings view with a scope picker). A `sales_org` setting in that schema —
"ERP sales organisation for this website", default `1000` — makes the mapping a per-website
merchant setting on the injected Admin screen. Then: the order request carries the website's
`salesOrg` (contract: `order.request` gains it), a partner's sales organisation comes from the
website its company's users last ordered through (or stays the default), and the ERP's
Settings gains a read-only **Organisation** card listing the sales organisations it has seen
and how many customers and orders each holds. Two ERPs on two websites (the multi-ERP
research) then read as two sales organisations, which is what they are.

## Recommended order (revised 2026-09-24 after the entity matrix)

1. **Credit hold, ERP side** (slice 3's remainder) — demo step 11, no cross-repo change.
2. **Hold → Commerce hold/unhold**, with detach unholding.
3. **Commerce-side order changes → ERP**: shipment, invoice, cancel, hold made in Commerce
   Admin, with the `origin` marker so the ERP does not echo them (item 1 + G4). One
   mechanism, four events.
4. **Per-source stock changes → ERP** (G2), and the small decisions G1, G3, G5.
5. **Business structure** (`.rptc/plans/erp-business-structure/`): sales organisation per
   website, warehouse names, legal identity, currency.
6. Then the order split has both axes and every entity it touches syncing both ways.

Nothing here is unattended-safe to *deploy*: 2 and 3 are new Commerce writes and event
subscriptions, and changing a subscription after install needs an uninstall/install cycle
(README, "Changing a webhook or event after install"). Build and test locally; deploy on the
owner's word.
