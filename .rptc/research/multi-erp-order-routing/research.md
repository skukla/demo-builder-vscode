# Multi-ERP order routing: native Commerce, the ERP integration, and a routing layer on top

Researched 2026-09-23 on `feature/erp-integration`. External + codebase.

## Who this is for (added 2026-09-24)

Two real prospects shaped this, neither named here (public repo). The first grew by
acquisition and runs several ERPs, each the master of its own product lines; a PIM
aggregates the lines into one catalog, and one Commerce storefront sells all of it. The
question for them is which ERP each order line reaches. The second runs Dynamics 365 and
asks the plainer one-ERP question. The business-structure work
(`.rptc/complete/erp-business-structure/`, shipped 2026-09-24) put both axes the routing
layer will read in place: the sales organisation per website (Structure settings) and the
product's owner per pair (inventory sources or an `erp_owner` attribute). The demo does not
model a PIM; the product's owner stands in for "the PIM assigned this line to that ERP".

The customer grew by acquisition and runs several ERPs. Different SKUs are mastered in
different ERPs. One Adobe Commerce catalog sells all of them. An order can contain lines
owned by two ERPs, and each part has to reach the right system while the shopper keeps one
order.

The customer knows an order management system (OMS) exists and may be needed one day. They
are betting that native Commerce plus customisation carries them for now. **This research
assumes that bet and asks what it looks like.** No OMS in the picture. Where the bet runs
out is section 5, stated plainly, because that is what makes the rest credible.

Two things are held apart throughout:

- **the ERP integration** — the foundation. One ERP, one Commerce store, generic. It stays
  that way.
- **the routing integration** — a separate component added on top, which only has a job
  once two ERP integrations exist.

---

## Short version

Native Commerce gives us four real things: a per-SKU ownership marker that already exists
and is already mirrored into our mock ERP (inventory **sources**), an order that can carry
several shipments and several invoices, custom order statuses and comments, and per-website
configuration scope. It gives us **no** sub-orders, **no** per-line external reference,
**no** routing decision at order placement, and exactly **one** external order-number field
per order.

So the split itself, the per-ERP send, the merge of two status streams back onto one order,
and the partial-failure case are all App Builder work. That is the new layer's whole
purpose.

The foundation already has the switch the new layer needs (`orders_send`, per website), and
already has the two collisions the new layer must resolve (both copies subscribe to the
same Commerce order event; both want the same single `ext_order_id` field).

---

## 1. What native Adobe Commerce already gives us

### 1.1 Inventory sources and stocks (Inventory Management, formerly MSI)

A **source** is a physical location that stores and ships products. A **stock** maps a
sales channel to sources. Sales channels are "currently limited to websites", and a sales
channel can be assigned to only one stock.
([Introduction to Inventory Management](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/introduction),
[Stocks and sources](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/sources-stocks))

Sources are assigned per product: "Assign and update inventory quantities for each source
through the product page."
([Manage inventory sources](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/sources/sources-manage))

**What it does for us.** This is the closest native thing to "which system owns this SKU".
One source per ERP ("Acme plant", "Contoso plant"), assigned per SKU, visible in the Admin,
editable by a merchant, readable over REST. A SKU owned by two ERPs is expressible: two
sources with quantities.

It is also **already wired into our stack**: the ERP integration mirrors Commerce stock
per source into the ERP's own warehouses
(`skukla/commerce-erp-integration`, `src/lib/mirror.js:7` — `warehousesFor(sku, stockBySku, sourceNames)`).

**What it does NOT do.** A source is a *place*, not a *system of record*. Nothing in
Commerce sends anything to a source. The source never appears on an order line as a
routing decision — it appears at shipment time (1.2). And if two ERPs both stock the same
SKU, the source tells you where it is, not who should get the order.

### 1.2 Source Selection Algorithm and multi-source shipments

"The system supports shipping a complete order from one source, and breaking the order into
multiple partial shipments across multiple sources." "Commerce generates a shipment for
every source you select."
([Manage orders and shipments from inventory](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/orders/shipments))

The Source Selection Algorithm (SSA) runs **during order shipment** and produces "a
recommended list of sources, available quantities, and amounts to deduct". Staff can
override it to ship partial shipments, ship everything from one source, or "break the
shipments across multiple sources in different amounts". Two algorithms ship: Source
Priority and Distance Priority.
([Source algorithms and reservations](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations))

**What it does for us.** One Commerce order legitimately becoming several shipments is
native, supported, and already familiar to an operations person. The customer experience —
one order, several shipments — needs nothing built.

**What it does NOT do.** Three things, all load-bearing:

1. It runs at **shipment**, not at order placement. It is not a routing decision made when
   the order arrives.
2. It is a **recommendation a human accepts**, not an automated dispatch.
3. It calls nothing. It moves numbers inside Commerce. It cannot send a line anywhere.

### 1.3 The one native order split: multiple shipping addresses

Commerce's multishipping checkout generates "a series of single orders — one for each
destination address".
([Sales > Multishipping Settings](https://experienceleague.adobe.com/en/docs/commerce-admin/config/sales/multishipping-settings))

**What it does for us.** It proves Commerce can produce several orders from one checkout
without anything custom, and that inventory, SSA and partial shipments behave normally
across them.

**What it does NOT do.** The split axis is the **shipping address**, chosen by the shopper.
There is no hook to split on "who owns this SKU", and no link back between the resulting
orders. It is the wrong axis for this scenario. Worth knowing, not worth using.

### 1.4 Partial invoices, order status, comments

Multiple invoices per order and custom order statuses assigned to states are native: "you
can create your own custom order status settings, assign them to order states, and set
default order statuses for order states."
([Order status](https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/order-management/orders/order-status))

**What it does for us.** "Part one invoiced, part two not yet" is expressible natively. A
status like *Partly confirmed* is a configuration, not code. Order comments are a native,
cheap, visible place to write what happened to each part — the ERP integration already
writes notes this way.

**What it does NOT do.** Custom statuses that are not set as default "can be used only in
the comments section of the order", so the status vocabulary is not free. And a status is
one value for the whole order — it cannot say "ERP A confirmed, ERP B refused" by itself.

### 1.5 The external order number field

Commerce orders carry `ext_order_id`, and our integration writes the ERP's number into it
with a sparse order save (`skukla/commerce-erp-integration`, `src/lib/commerce.js:283-292`),
then skips any order that already has one (`src/lib/order-sync.js:80-84`).

**What it does for us.** A native place for "the other system's number", visible in the
Admin, searchable in the order grid.

**What it does NOT do.** There is **one** of it. Two ERPs producing two numbers for one
order cannot both live there. Adobe's public REST documentation does not describe this
field; the evidence that it works is our own code, not a doc.

### 1.6 Websites, store views and per-scope configuration

Business configuration is scoped (default, website, store, store view). Our integration
already reads its settings by the order's store (`src/lib/order-sync.js:90`), and its
settings schema is per-scope by construction
(`app.commerce.config.ts:93` `orders_send`, `:101` `orders_hold_offline`,
`:117` `pricing_contract_prices`).

**What it does for us.** Two ERP integrations can be aimed at two different websites today,
with no routing layer at all. Each sends its own website's orders to its own ERP.

**What it does NOT do — and this is the whole scenario.** A single Commerce order belongs
to a single store. Website scope can never produce **one order containing lines owned by
two ERPs**. It gives you two stores, not a mixed basket. Anyone demonstrating website
scope is demonstrating a different problem.

### 1.7 Product attributes, and B2B

A custom product attribute ("system of record") is native, trivial, editable, and
exportable. It is the simplest ownership marker if sources feel like a stretch.

Adobe Commerce B2B ships company accounts and shared catalogs. Not verified in depth here:
whether shared catalogs are a useful second ownership axis (company X buys only from ERP A)
is an open question, not a finding.

### 1.8 What native Commerce does not do at all

- **No sub-orders and no order groups.** There is no parent order with child orders per
  back-end system, and no native grouping of related orders.
- **No per-line external reference.** Nothing native says "this line went to system B and
  came back as number 4711".
- **No routing at order placement.** Nothing native inspects an order and decides where its
  parts go.
- **No resend.** Nothing native re-sends a failed part of an order to an external system.
- **No cross-system view.** The Admin order page shows Commerce's own facts only.

---

## 2. Where App Builder fills the gap

Everything in 1.8, plus the glue. Specifically:

| Job | Native Commerce alone? | Where it lands |
|---|---|---|
| Decide which ERP owns each line | No | routing layer, reading a native ownership marker (1.1 / 1.7) |
| Turn one order into per-ERP parts | No | routing layer |
| Send each part to its ERP | No | the ERP integration, per ERP, on the routing layer's instruction |
| Write each part's ERP number back | Partly — one field only (1.5) | routing layer decides where the second number goes |
| Bring two status streams onto one order | No | routing layer |
| One part accepted, one refused | No | routing layer |
| Several shipments / several invoices on one order | **Yes, native** | Commerce |
| Customer sees one order | **Yes, native** | Commerce |

Two Adobe mechanisms make this reachable without touching Commerce PHP:

- **Asynchronous** — Commerce events delivered to App Builder. Our integration already uses
  `observer.sales_order_save_commit_after` (`app.commerce.config.ts:175`), which is how
  Adobe's starter kit sends orders: after the order is saved, not while the shopper waits.
- **Synchronous** — Commerce webhooks, which run inside the request and can validate or
  block order placement.
  ([Order placement validation use case](https://developer.adobe.com/commerce/extensibility/webhooks/use-cases/order-custom-attributes-validation),
  [Extend Adobe Commerce with webhooks and App Builder](https://developer.adobe.com/commerce/extensibility/webhooks/tutorial/))

And the Admin UI SDK V2 gives both audiences a screen inside the Commerce Admin: a menu
page, order **grid columns**, order **view buttons**, and grid mass actions.
([Order extension points (V2)](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/v2/order/),
[Admin UI SDK extension points](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/))

---

## 3. The three layers, and the seam between them

### 3.1 Native Commerce, underneath both

Ownership marker per SKU (source or attribute), one order, several shipments, several
invoices, custom statuses, order comments, `ext_order_id`, per-website settings scope.

### 3.2 The ERP integration — the foundation, unchanged

One ERP, one Commerce store. What it owns today, verified in
`skukla/commerce-erp-integration`:

- Orders to the ERP from the Commerce order-save event, ERP number written back,
  retry/hold when the ERP is down (`src/lib/order-sync.js`).
- Cart-time webhooks for contract price and discount ceiling, both optional with a
  one-second soft timeout, so an offline ERP does not break checkout
  (`app.commerce.config.ts` webhooks block).
- The ERP's own events applied back to Commerce: status, shipment, invoice, cancel, credit,
  block (`app.commerce.config.ts:205-247`).
- Per-website settings, including the three switches at `:93`, `:101`, `:117`.
- Its own Admin page, sync history, and a one-order trace across both systems
  (`src/lib/order-trace.js`).
- Copy identity: a second copy on the same store takes its own app id, so Commerce can tell
  the two apart (`app.commerce.config.ts:24-50`), fed by Demo Builder
  (`src/features/app-builder/services/deployInputs.ts:34,36`).

**None of this should learn about a second ERP.** That is the rule the seam has to protect.

### 3.3 The routing integration — the new layer

It owns exactly five things:

1. **The ownership map.** SKU → ERP. Read from the native marker; held and editable in the
   routing app.
2. **The split.** One Commerce order → parts, one per owning ERP.
3. **The dispatch.** Ask each ERP integration to take its part.
4. **The merge.** Two status streams onto one Commerce order, with a correct combined
   status and a per-part record.
5. **The failure.** One part accepted, one refused — what the order says, what operations
   can do about it.

### 3.4 The seam — what the routing layer needs the foundation to expose

The routing layer must not reach past the integration into the ERP. The mock ERP has a
public order API (`POST orders` with `{commerceOrderId, lines, …}`, idempotent —
`skukla/demo-erp` README), and calling it directly would work and would be wrong: it
bypasses the integration's settings, retry/hold, history, number write-back and status
mapping, and it would make the routing layer know about ERP APIs rather than about ERP
integrations.

So the seam is four things, and three of them do not exist yet.

| # | What the routing layer needs | Today |
|---|---|---|
| S1 | **Stop self-dispatching.** A way to tell one copy "do not send orders yourself" | **Exists.** `orders_send` per website (`app.commerce.config.ts:93`), honoured at `src/lib/order-sync.js:91` — but it is a website-scoped merchant setting, not a per-order instruction |
| S2 | **Send this part.** Accept an order plus a chosen subset of lines, and do the ERP send with all the per-ERP behaviour intact | **Missing.** `sendOrderToErp(params, order, deps)` takes the whole order and builds every line from `order.items` (`src/lib/order-sync.js:37-56`) |
| S3 | **Tell me what happened, per part.** The outcome of one part, keyed by Commerce order and line ids — sent, held, dropped, refused, plus the ERP's number | **Half there.** The outcome vocabulary already exists (`sent`/`skipped`/`held`/`dropped`, and `src/lib/order-trace.js` already merges Commerce, integration and ERP into one timeline) — but it is per *order*, not per *part*, and it is read by the integration's own page, not published to another app |
| S4 | **Who am I.** A stable identity for this copy (which ERP this is, in words the SC gave it) | **Exists.** `DEMO_BUILDER_APP_ID` / `DEMO_BUILDER_COPY_NUMBER` (`app.commerce.config.ts:24-50`) |

**The two collisions that exist today**, both verified by reading the code, both the
routing layer's job to resolve:

- **Double send.** Two installed copies both subscribe to
  `observer.sales_order_save_commit_after`. Both receive every order. Both send the whole
  order to their own ERP. Today the only thing separating them is website scope (1.6).
- **One number, two claimants.** Both copies write `ext_order_id`, and each skips an order
  that already has one (`src/lib/order-sync.js:80-84`). First writer wins; the second ERP's
  number has nowhere native to go.

The cleanest shape that keeps the foundation generic: the routing layer becomes the **only**
thing subscribed to the order event; each ERP integration keeps its own event subscription
but stands down when told to (S1), and gains one entry point that takes a part (S2) and
reports its outcome (S3). The foundation still works alone, with no routing layer
installed, unchanged. That is the test of whether the seam is right.

### 3.5 What is actually installable today

The backlog item this research serves is `AB-16` (`.rptc/backlog/2026-09-17-erp-integration-several-erps.md`).
Read it before planning: it records that a second add of the same tile is refused, and that
the real blocker was one shared workspace holding one App Management app. `AB-23`
(workspace per integration) removes that, and `AB-16` cannot be planned until it lands.

What exists now:

- Copy identity end to end — a catalog entry `erp-integration-2` is told it is copy 2
  (`src/features/app-builder/services/deployInputs.ts:131` `copyNumber`), the app builds its
  own Commerce app id from that (`app.commerce.config.ts:24-50`), and the id is recorded on
  first deploy because Commerce refuses to change it later
  (`deployInputs.ts:107-115`).

What does not:

- Adding the second ERP pair from the gallery, and the separate workspace it needs
  (`AB-23`).

`AB-16` also asks an open question this research answers: **one integration routing to
several ERPs, or one integration per ERP?** The owner's 2026-09-23 steer settles it — one
integration per ERP, generic and unchanged, with a routing integration above. Section 3.4 is
the seam that decision needs.

---

## 4. Ownership: how to record which ERP owns a SKU

Ranked, native first.

1. **Inventory source per ERP.** Native, per SKU, already mirrored into our ERP. Best fit,
   and it doubles as the shipment story (1.2). Caveat: a source means a place.
2. **A custom product attribute, `system_of_record`.** Native, blunt, obvious on screen,
   one value per SKU. Easiest to explain in a room.
3. **The routing app's own map.** Not native. Needed anyway for anything richer than "one
   ERP per SKU" — by customer, by region, by which ERP has stock today.
4. **Website / store view.** Native but wrong axis — it cannot produce a mixed order (1.6).
5. **Shared catalogs (B2B).** Unverified here.

Nothing native records ownership *at the order line*. If the demo needs "this line went to
Acme", that fact lives in the routing app, and is shown in the Admin through the Admin UI
SDK (section 2) or written into order comments.

---

## 5. The honest limits, and when they really do need an OMS

Say these in the room. They are what makes the rest believable.

**Where this approach strains:**

- **Money.** One Commerce order is one payment authorisation and one capture. If two ERPs
  each invoice their own part, the Commerce invoice stream and the ERP invoices are two
  different accounts of the same sale. Partial invoices make it *expressible*; they do not
  make it *reconciled*. Adobe-internal design discussion of splitting orders after checkout
  raises exactly this — payment capture and invoice streams — as the main risk, ahead of
  any technical concern. (Internal, paraphrased; not cited here.)
- **Legal entities.** ERPs inherited from acquisitions are usually different legal
  entities: different tax registrations, different terms, different remittance. One
  Commerce order, one tax calculation, one payment, one merchant of record. This is the
  first place the model actually breaks, and it is a finance problem, not a code problem.
- **Cancellations, returns, refunds per part.** Each is a second round-trip to a specific
  ERP, and Commerce's credit memo is order-shaped.
- **Promising a date.** With one ERP you can ask at cart time (our webhooks do, with a
  one-second budget). With several, "when will my order arrive" is the latest of several
  answers, and the budget does not grow.
- **Rule volume.** A handful of ownership rules is configuration. Cost-optimised sourcing
  across many nodes, with split minimisation and backorders, is a product.
- **Reprocessing.** "Re-send everything that failed last night" is an OMS feature. Built
  here, it is a job queue someone has to own.

**The point where an OMS is the right answer** — any one of these, not all:

- Sourcing has to be *optimised* (cost, distance, minimum shipments), not merely *routed*.
- Available-to-promise across systems, allocation, backorders.
- Returns and after-sales as a workflow rather than an event.
- A customer-service view of orders that is not the Commerce Admin.
- Store fulfilment, ship-from-store, click-and-collect.

Adobe's own OMS is not the fallback: Order Management System (OMS) "reached end of support
in October 2024" and its documentation is archived, historical reference only
([OMS connector, archived](https://commerce-docs.github.io/oms-documentation-archive/integration/connector/)).
Adobe's OMS direction is partner-led — publicly, Adobe announced order-management
partnerships in 2021, with IBM Sterling as a named direct integration
([Adobe blog, Aug 2021](https://blog.adobe.com/en/publish/2021/08/10/adobe-announces-new-partnerships-meet-growing-customer-demand-in-order-management),
[IBM Sterling Commerce on Adobe Exchange](https://exchange.adobe.com/apps/ec/1200087/ibm-sterling-commerce)).
Internal Adobe guidance draws the same line this research does: a fixed
SKU-to-system routing rule is App Builder work built from the integration starter kit;
sourcing, ATP, partial fulfilment, returns and service visibility are OMS work. It also
records that one major OMS vendor's Adobe-side integration investment is stopped, so not
every OMS name is an Adobe-supported path. (Internal, paraphrased; not cited here — check
current guidance before naming partners to a customer.)

One more piece of context, internal only: Adobe has design work exploring related or
grouped orders from a single checkout in the SaaS platform, with routing to an order
management system named as one reason a split could happen, and a companion design that
calls out separate invoicing, separate payment handling and partial failure. It is design,
not a shipped feature, and not the starter kit. Do not promise it. It does say the platform
direction is not hostile to this shape.

---

## 6. What the two people need

### IT / architecture — they own the rules

What they configure: the ownership map, the fallback when a SKU has no owner, whether an
order is held or partly sent when one ERP is down, and which ERP wins when both stock a
SKU.

What they need to see to trust it: the decision *before* it happens. This is the single
most convincing screen, and it is the one real OMS products all have. Fluent exposes
sourcing strategies as configuration objects with priority, status, conditions and criteria
([Configure Sourcing Strategies](https://docs.fluentcommerce.com/by-type/configure-sourcing-strategies));
IBM Sterling's sourcing rules "control routing of orders across the extended enterprise"
([Sterling Distributed Order Management](https://www.ibm.com/docs/en/order-management?topic=features-sterling-distributed-order-management)).
A documented **simulation or preview** UI: not found in either vendor's public docs — they
describe rules and priorities, not a "where would this order go" preview. So building one
is a differentiator, not a catch-up.

For us that is: an Admin page listing SKU → ERP, and a "try an order" box that shows the
split without sending anything.

### Operations — they live with the result

Their daily job, in the questions they actually get asked:

- "Where is order 1042?" — one answer, not three screens. Our integration already built
  exactly this for one ERP: `src/lib/order-trace.js` merges Commerce, the integration and
  the ERP into one time-ordered list. With two ERPs it needs to say *which* ERP each step
  came from.
- "Half of it shipped." — native (1.2/1.4). Nothing to build.
- "One part never arrived in the ERP." — needs a visible failed part and a **Re-send**
  button. Not native. Admin UI SDK order view buttons are the native-feeling place to put
  it.
- "This line went to the wrong system." — re-route one line. This is the expensive one:
  it means cancelling in one ERP and creating in another, and it is where the demo should
  stop and say so.

---

## 7. Who owns this problem in the market (context)

- **OMS products do split orders** — but they split by fulfilment *location*, not by
  system of record. Fluent: optimised split logic aiming to "fulfil the maximum number of
  items while using the minimum number of shipments"
  ([Split orders across multiple fulfilment locations](https://docs.fluentcommerce.com/by-type/split-orders-across-multiple-fulfilment-locations)).
  Sterling: sourcing rules routing across the extended enterprise (link above). SAP and
  Manhattan describe the same shape — multi-warehouse sourcing and split shipments
  ([SAP order management overview](https://www.sap.com/products/crm/order-management-system.html)).
  "Which ERP owns this SKU" only becomes an OMS question if each ERP maps to its own set of
  nodes.
- **The integration layer doing it** is the common pragmatic answer, and it is what the
  starter kit is shaped for: Adobe positions it as the accelerator for back-office
  integration
  ([Adobe blog](https://business.adobe.com/blog/accelerating-back-office-integrations-for-adobe-commerce) —
  link surfaced by search, page fetch timed out, so treat the characterisation as from the
  title and Adobe's developer docs, not from reading that page).
- **One ERP as master** is the third answer and the one the customer has already rejected
  by keeping several.

---

## 8. Is multi-ERP-after-M&A a real pattern?

**Recognised, not quantified.** Honest answer.

- Public industry commentary treats post-merger ERP duplication as ordinary and ERP
  consolidation as a project companies defer, with commerce sitting on top of several ERPs
  in the meantime
  ([Shopify Enterprise, ERP consolidation](https://www.shopify.com/enterprise/blog/erp-consolidation)).
  This is vendor commentary, not analyst research. I did not find a Gartner/Forrester
  figure.
- Implementation-partner material for Adobe Commerce ERP integration is plentiful and
  consistently single-ERP in its examples
  ([DCKAP](https://www.dckap.com/blog/magento-erp-integration/),
  [Creatuity](https://www.creatuity.com/insights/adobe-commerce-erp-integration-operations-playbook/)).
- Adobe internal field material contains at least one multi-country Commerce programme with
  more than one ERP behind it, integrated through middleware, and OMS target-profile
  material that names multi-ERP ecosystems as a qualifier. It does **not** quantify the
  pattern, and no internal artefact describes line-level splitting to several ERPs.
  (Internal; deliberately unnamed and uncited here — this repo is public.)

Verdict: safe to say "we see this in organisations that grew by acquisition, particularly
manufacturing and distribution". Not safe to say "common" as if measured.

---

## 9. Does anything already do this?

No. Checked:

- The Adobe Commerce Integration Starter Kit covers product, customer, order, stock and
  shipment flows in both directions and is explicitly modular so the back-office half can
  be swapped
  ([starter kit docs](https://developer.adobe.com/commerce/extensibility/starter-kit/)).
  Its published reference integration is **one** Commerce to **one** back office. No SKU
  ownership registry, no mixed order grouped by system, no parent/child correlation, no
  partial-failure compensation. (Confirmed against internal starter-kit reference material
  as well as the public docs.)
- Our own foundation is the same shape, by design: one ERP, whole order.

So the routing layer is genuinely new work, and it is the demo's whole point.

---

## 10. The smallest demo that lands it

Starting point: **two** ERP integrations in one project, each with its own mock ERP,
against one Commerce store. The routing integration is then added as a third component,
and every moment below is one the second layer makes possible.

Be accurate about what that starting point costs today — see 3.5. The copy machinery
exists; the second install does not work yet.

1. **The catalog, in the Commerce Admin.** Product grid, a column showing the owning
   system. Two SKUs, two different ERPs, one catalog. *"Your buyers see one catalog. Your
   back office is still two companies."* (native — section 1.1/1.7)
2. **Add the routing integration** in Demo Builder, next to the two ERP integrations. It
   finds them; it does not replace them. *"The connections you already have stay as they
   are."*
3. **The rules screen** (IT audience). SKU → ERP, the fallback, the down-ERP policy. Then
   the preview box: paste an order, see where each line would go. **Nothing is sent.**
   This is the trust moment, and no OMS vendor documents one.
4. **Place a mixed order** on the storefront. One basket, two owners, one checkout, one
   order number. *Customer's experience: one order.*
5. **The Commerce order page** (operations audience). One order. A panel: part 1 → Acme
   ERP, number 4711, confirmed. Part 2 → Contoso ERP, number 88012, confirmed. One order,
   two systems, one screen.
6. **Open both ERP screens** side by side. Two sales orders, each holding only its own
   lines. This is the moment IT asks for and the one that proves the split was real.
7. **Break one.** Stop Contoso ERP. Place another mixed order. The Commerce order shows
   part 1 confirmed, part 2 waiting, and says why in words. The customer still has one
   order. Operations presses **Re-send** and it clears. *"One system being down does not
   lose you an order."*
8. **Ship one part.** Native multi-source shipment. Customer sees one order, two shipments.
   Nothing custom on screen. *"That part is stock Commerce."*
9. **Reset.** Both ERPs wiped, project back to zero, run it again. (House rule: whatever
   can be done can be undone.)

Nine moments. Steps 1, 4, 8 are native Commerce. Steps 3, 5, 6, 7 are the routing layer.
Step 2 is the product. Say which is which out loud — that is what makes the architecture
legible to the IT audience rather than a magic demo.

---

## 11. Questions only the owner can answer

1. **Where does the second ERP number live?** `ext_order_id` holds one. Order comments, a
   custom attribute, or only in the routing app's own screen? This decides how native the
   order page looks.
2. **Does the routing layer own the order event, or do the integrations keep it?** The
   clean seam says the routing layer becomes the only subscriber and stands the copies
   down. That changes the foundation's default behaviour when a routing layer is present.
   Is that acceptable, or must the foundation be untouched?
3. ~~**Is the ownership marker a native inventory source, or a product attribute?**~~
   **ANSWERED (owner, 2026-09-23): Inventory Management IS in the ACCS backend, so the
   marker is a SOURCE.** It is the richer of the two and our integration already mirrors
   stock per source into the ERP's warehouses, so the mapping exists on both sides.
4. **How far does the failure story go?** Re-send a failed part (cheap, convincing) versus
   re-route a line to a different ERP (expensive, and honestly the beginning of an OMS).
5. **Does the demo run on ACCS, PaaS, or both?** Both the ERP integration and the mock ERP
   declare both backends. The Inventory Management half of this is settled — the owner
   confirmed on 2026-09-23 that MSI is in the ACCS backend, so sources and the
   two-sources-one-order moment exist there. Custom order statuses on ACCS are still
   unchecked.
6. **Do we say the OMS sentence?** Section 5 names the point where the customer would need
   one. Saying it builds trust and opens an OMS conversation. Not saying it keeps the demo
   tighter.

---

## What I could not establish

- ~~**Inventory Management on Adobe Commerce as a Cloud Service.**~~ **Settled 2026-09-23:
  the owner confirmed MSI is in the ACCS backend.** No public page states it, which is why
  this pass could not; the answer came from someone with an ACCS Admin open. Custom order
  statuses on ACCS remain unchecked.
- **`ext_order_id` in public documentation.** Our code proves it accepts a write. Adobe's
  public REST reference does not describe the field.
- **A preview/simulation screen in any OMS product.** Fluent and Sterling document rules,
  priorities and conditions. Neither public doc shows a "where would this order go" preview.
  Absence of documentation, not proof of absence.
- **Fluent's split objects.** Their public page describes the strategy, not whether a split
  produces sub-orders or fulfilments, nor how parts are numbered.
- **Prevalence, as a number.** No analyst figure found for multi-ERP-after-M&A in commerce.
- **B2B shared catalogs as an ownership axis.** Not investigated.
- One Adobe blog page (back-office integrations) timed out on fetch; its characterisation
  above comes from the search result and Adobe's developer docs, not from reading it.


---

## 12. The pattern, in the words to relay to the customer (owner decision, 2026-09-24)

**One consumer, many handlers, across apps.** Adobe's integration starter kit shapes every
integration as a consumer action that receives a Commerce event and hands it to the handler
for that event's kind, inside one app. The routing integration is the same shape one level
up: it is the ONLY subscriber to Commerce's order event. Its consumer action reads the
order, decides which ERP owns each line (the product's owning-system attribute, which a PIM
would write into Commerce in a real deployment), splits the order into parts, and dispatches
each part to that ERP pair's own runtime actions, which then raise that pair's own events
towards its ERP. The pairs stop listening to Commerce for new orders and know nothing of one
another; each stays exactly the single-ERP product.

What the customer hears: "an order placed in Commerce is consumed once; a routing layer
decides who owns each line; each ERP integration receives only its part, through the same
actions it uses for a single-ERP store." What that buys them: the ERP integrations are
generic and reusable, adding an ERP adds a pair and a rule, and the split logic lives in one
place that can be replaced (an OMS, one day) without touching any pair.

Where the parts' numbers live: each pair writes its ERP number into its own custom order
attribute on the Commerce order (Adobe Commerce as a Cloud Service; the Admin shows them on
the order view), symmetrically; `ext_order_id` carries the prefixed number of the pair that
took the order. Validation of the write path is an API-inventory row.
