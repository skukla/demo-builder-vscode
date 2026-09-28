# Several ERPs: the reference design

**Version: v1 DRAFT (2026-09-27), for the owner to lock.** Until it says "locked v1", diagrams
and decks drawn from it are drafts. Every change after locking goes in the change log at the end
and is sent to the client tech-case session, naming the diagrams it affects.

Built from `.rptc/research/multi-erp-integration-shape/research.md` (the shape), four entity
research passes run 2026-09-27 (customers and credit; catalogue, prices and stock; the order and
fulfilment; after the sale), a comparison with the integration-examples deck, and the client
tech case (kept outside this public repo; no client detail here).

## 1. The rule this design keeps

**The demo integration is the integration we would recommend.** Its code is what a customer
would be told to build. What exists only because it is a demo (filling the ERP, reset, undoing
the ERP's writes in Commerce) lives in Demo Builder, never in the integration. Where the demo
simplifies, the design says so, next to what a customer would do instead (marked **Demo:**).

## 2. The shape

One integration app, one workspace, one Commerce app, one Admin page:

- a **routing action**, the only subscriber to Commerce's order event. It reads each placed
  order, decides each line's owning ERP, stores the order's parts, sends each part to its ERP's
  adapter, and is the only writer of the combined order status;
- **one adapter per ERP**, behind one contract: "send this part" and "report this part's
  outcome". Adapters know nothing of each other. The same adapter code, configured, serves every
  ERP of the same kind;
- **per-ERP settings** on the one Admin page: a section per ERP with a switcher (owner,
  2026-09-27);
- the ERPs are separate systems, each with its own data, screen and look.

An adapter that must deploy on its own (another team, another release cycle) moves behind a pair
of events without changing the router (research §Recommendation). **Demo:** at most two ERPs; a
second demo ERP is a settings entry because every mock ERP runs the same code.

## 3. Entities: how each splits across ERPs

Legend: **Built** = in the code today (single ERP); **Proven** = measured live on Bodea;
**Gap** = found by the 2026-09-27 passes and not yet designed or built; **Test** = needs a live
sandbox test before it is built on.

### 3.1 Customers and credit

| Entity | Across several ERPs | State |
|---|---|---|
| Company (identity) | One Commerce company becomes a customer in every ERP the buyer deals with; Commerce is the master | Built for one ERP; the company event is not proven live |
| Key map (company to ERP customer) | One pair **per ERP**: the map must record which ERP a pair belongs to | **Gap**: today one company may pair with one ERP customer only (`key-map.js` rejects a second) |
| Company block | Each ERP has its own blocking level; Commerce has one active/blocked flag | **Gap**: one ERP unblocking can undo another ERP's block. Proposed rule: Commerce is blocked while ANY ERP blocks |
| Credit limit | Commerce's limit is the TOTAL across ERPs; each ERP's own limit, exposure and available credit in its own prefixed company custom attributes (decided 2026-09-26) | Built for one ERP (writes the limit); per-ERP attributes not built. **Test**: does REST `setCustomAttributes` replace the whole set? |
| Credit exposure and balance | Each ERP counts only its own open orders and unpaid invoices; a hold on one ERP's exposure holds only its part | Built for one ERP; the payment leg (Commerce balance) is frozen (AB-26s) |
| Payment terms | Each ERP keeps its own; never in Commerce | Nothing to do |
| Company users, groups, shared catalogs | Commerce only. A company keeps ONE shared catalog; each ERP writes only its own SKUs' prices into it | Catalog writes not built (AB-26z) |

### 3.2 Catalogue, prices and stock

| Entity | Across several ERPs | State |
|---|---|---|
| Product and its owner | Exactly one owning ERP per SKU, from a product attribute a PIM would master (decided 2026-09-24; inventory sources are the alternative). Products do not cross ERPs: the client described ERPs split by product type and manufacturing facility, one ERP per brand (client tech case, architecture walk-through; the owner's recollection agrees). Stated for product types, not SKUs, so it is to be confirmed with the client | Built (`ownershipFilter`). Under source-based ownership a SKU stocked in two ERPs' sources would belong to both; the design takes the attribute as the rule |
| Variants | All variants of a product belong to its ERP (follows from products not crossing ERPs; to confirm with the client). Setup can check it: a configurable whose children name different owners is a setup error | Not checked today |
| List price | The owning ERP writes it | Built and proven |
| Contract prices | Each ERP writes its own SKUs' rows into the company's one shared catalog (tier prices) | Built only as a cart-time webhook; catalog write not built (AB-26z). **Test**: does the storefront send the customer-group header for a signed-in buyer? |
| Discount ceiling | Per ERP, at the cart | Built and proven; may fold into catalog pricing (AB-26z open) |
| Stock per source | One source per ERP warehouse; the ERP is the master of quantity | Built and proven. Commerce raises no event for a quantity at a non-default source; the integration's Move stock action is the path |
| Stock per website, salable quantity | Commerce configuration: a website served by an ERP's source needs a stock of its own (Default Stock takes only the Default Source) | Proven; a setup step |
| Product delete | Only the owning ERP should hear it | **Gap**: the delete handler does not check ownership (harmless today) |

### 3.3 The order and fulfilment

| Step | Across several ERPs | State |
|---|---|---|
| Order placed | The router is the only subscriber; it splits lines by owner into parts and stores them | Router not built; single-ERP send proven |
| Line owner on the order | Read from the product attribute at routing time. **Test**: the per-line nominated source (Cloud Service, 2026) as the carrier, set at checkout | Attribute read built |
| Sending a part | The adapter sends only that part's lines, keyed by order and part so a retry never double-sends | Built for whole orders (idempotent by order) |
| ERP acceptance and number | Each ERP's number goes to an order comment and the router's record; `ext_order_id` holds one value and is written only by the router, if at all. **Test**: custom order attributes written after Pending | Comment and write-back built for one ERP |
| Credit hold | One ERP holds its part; the order goes On Hold with the reason in a comment | Proven for one ERP |
| Hold, unhold, cancel from Commerce | Commerce acts on the whole order: the router tells every ERP with an open part | Proven for one ERP |
| Cancel from an ERP | That ERP's part only. An order with any invoice or shipment cannot be cancelled in Commerce: the rest is closed by a credit memo | Fixed 2026-09-27 (integration `71c1ab5`): the handler reads the order back and, if Commerce kept it, holds it for staff with the reason. The credit memo itself waits on AB-26r |
| Order edits | A Processing order cannot be substantially edited (Adobe) | Nothing to design |
| Shipments | One or more per ERP, each from that ERP's source, carrying only its lines | Proven for one ERP |
| Invoices | Each ERP invoices only its own lines (`items[]`), and invoices before it ships. Invoice calls on one order run one at a time (Adobe patch note MDVA-40399 reports simultaneous partial invoices fail; reported, not re-verified) | **Gap**: today whole-order `capture: true` would bill the other ERP's lines (AB-37) |
| Payment capture | One authorisation per order; each partial invoice captures its own amount. **Test**: is a purchase-order payment invoiced at checkout? (two Adobe pages disagree) | Whole-order capture built |
| Notifications | Each shipment and invoice can notify the buyer; the demo writes internal comments only | Deliberate demo choice |

**Combined order status** (the router is the only writer): Pending until every part is sent;
On Hold while any part is held or its ERP is down; Processing while parts are moving; Complete
only when every part is shipped and invoiced (Commerce's own rule); never cancelled
automatically. What a status cannot say ("one ERP confirmed, one refused") lives in the router's
per-part record, order comments, and an order-grid column plus an order-view button on the Admin
page (the Admin UI SDK documents no panel inside the order view).

**One ERP down or refusing:** the other parts go now; the stuck part is retried, then marked
failed with a Re-send on the Admin page; the order is never Complete while a part is open.

### 3.4 After the sale

| Entity | Across several ERPs | State |
|---|---|---|
| Returns | Commerce records them (GraphQL `requestReturn`, available on the Cloud Service); each returned line goes to its owning ERP | **Gap**: not designed or built; no REST endpoint found |
| Credit memo | Each ERP credits only its own invoice's lines | Frozen (AB-26r, AB-26v); the event payload has never been captured |
| Cancel after partial shipment | See the cancel row above: credit memo for invoiced lines | **Gap** |
| Reorder | A new checkout, routed like any order | Nothing to do |
| Negotiable quotes, requisition lists | Commerce only. **Test**: does cart-time ERP pricing apply inside a quote's checkout? | Untested |
| Payment received in the ERP | Updates the company's Commerce credit balance | Frozen (AB-26s); two ERPs sharing one balance not designed |

## 4. The deck, compared (the integration-examples deck)

| Slides | What they show | Against this design |
|---|---|---|
| Client section, order routing (topology, sequence) | One routing app, the only order subscriber, lines grouped by owning ERP, an adapter per ERP, one order with a shipment and partial invoice per ERP | Agrees |
| Client section, zoomed | One app holding the PIM feed and order routing | Agrees on routing; whether the PIM feed shares the app is a separate choice, not decided here |
| Generic "Multiple Systems" topology and sequence (added 2026-09-27) | Orders routed **by website** ("Website A to ERP 1"); one action per ERP | **Differs**: this design routes by each line's owning ERP. Website routing is a special case (a website that sells one ERP's products) |
| Generic "Multiple Systems" diagrams (original template) | Two "App" boxes side by side, one per ERP | **Unclear**: reads as an app per ERP; relabel as one app with an adapter per ERP |
| PIM section | One ERP, catalogue sync only | Not about routing |

The tech-case session owns the deck and decides the edits.

## 5. Live tests the design waits on

1. The per-line nominated source: how a cart line is nominated, and that it reaches the order line.
2. Custom order attributes written through REST after the order leaves Pending.
3. A purchase-order payment: invoiced at checkout or not.
4. Two partial invoices on one order in quick succession.
5. REST `setCustomAttributes` on a company: replaces the whole set or merges.
6. The storefront's customer-group header for a signed-in company buyer (contract prices).
7. Cart-time ERP pricing inside a negotiable quote's checkout.
8. The credit memo event payload.
9. The company event, live.

## 6. Decisions for the owner

1. **Lock this design as v1**, or name what to change.
2. **A company's block across ERPs**: blocked in Commerce while any ERP blocks (recommended).
3. ~~Variants across ERPs~~: answered 2026-09-27. Products do not cross ERPs (owner, from the
   walk-through; the tech case's transcripts agree for product types). To confirm with the client:
   (a) is any SKU stocked or sold by two ERPs, including after an acquisition; (b) can variants
   of one product come from different ERPs.
4. **Cancel from an ERP after invoicing**: holding for staff is built (the interim answer);
   closing the rest by credit memo automatically waits on the credit-memo work (AB-26r).
5. **Returns**: in the first build, or after the routing slices.

## 7. Client questions this design depends on

Recorded in the tech case's question list: which ERPs and the ownership rule per line; whether
EDI and email orders must share the routing; one order per checkout; payment and billing per
brand; who owns price, stock and contract prices; one ERP down (send the rest, or hold); returns
for a mixed order; whether any SKU is sold by two ERPs.

## Change log

- 2026-09-27: v1 draft.
- 2026-09-27: products do not cross ERPs (owner; client transcripts agree for product types), variants follow their product; cancel-after-invoice holds for staff (fix built).
