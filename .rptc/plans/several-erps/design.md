# Several ERPs: the reference design

**Version: LOCKED v1 (owner, 2026-09-27).** Before locking, diagrams
and decks drawn from it are drafts. Every change after locking goes in the change log at the end
and is sent to the client tech-case session, naming the diagrams it affects.

Built from `.rptc/research/multi-erp-integration-shape/research.md` (the shape), four entity
research passes run 2026-09-27 (customers and credit; catalogue, prices and stock; the order and
fulfilment; after the sale), a comparison with the integration-examples deck, and the client
tech case (kept outside this public repo; no client detail here).

## Pending client answers

The design holds no rule that depends on a client's answer beyond those marked here (agreed with
the client tech-case session, 2026-09-28). Numbers are that session's client question register;
the answers arrive from it and cut design v2.

| Rule in this design | Pending |
|---|---|
| Sales organisation chosen per website, per ERP | client #1 (how a web order is booked in each ERP: company or legal entity, sales unit, region; do regions sell through different entities) |
| Credit limit owner (the ERPs in the demo; a CRM for some customers) | client #20 |
| Which brands share one website's cart | client #9 |
| One owning ERP per product; variants follow their product | client #17 |
| A company is a customer in each ERP it buys from; its number there | client #19 |
| Invoicing per ERP, and purchase-order payment | client #4 |
| Web routing only; whether EDI orders must share it | client #2 |

## 1. The rule this design keeps

**The demo integration is the integration we would recommend.** Its code is what a customer
would be told to build. What exists only because it is a demo (filling the ERP, reset, undoing
the ERP's writes in Commerce) lives in Demo Builder, never in the integration. Where the demo
simplifies, the design says so, next to what a customer would do instead (marked **Demo:**).

### Demo scope: Commerce and the ERPs only (owner, 2026-09-27)

The demo shows how ERPs integrate directly with Commerce. It builds no CRM and no product
information system (PIM). Where a customer's CRM or PIM would own something, the demo lets the
ERP or the setup own it, and the talk track names the system that would own it for a customer:
the product's owning ERP is set in Commerce by setup (a PIM would write it); credit limits come
from the ERPs (a customer's CRM may own them instead, and then the integration simply does not
write the limit). These are named integrations the SC speaks to, not built ones.

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

**Code layout, as a customer would lay it out (owner, 2026-09-27):** a router folder that knows no
ERP; `adapters/<kind>/` with one folder per kind of ERP, each implementing the written contract
(one file stating "send this part" and "report this part's outcome"); an `adapters/example/`
skeleton with both functions stubbed and commented, to show what adding a new kind of ERP takes;
and a list of ERPs, one entry each: `id` (assigned when the ERP is added, unique, never changes;
the value a product's owner attribute holds, and the key for parts, the key map and settings),
`name` (the SC's label, fixed at creation, for people), `adapter` (the kind) and its connection.
Demo Builder refuses a second ERP whose name is already used in the project.

**Adding an ERP in Demo Builder (owner, 2026-09-27):** the ERP integration card offers "Add
another ERP". It asks for a name unique in the project, creates a new mock ERP in its own
workspace (own screen and look), and registers it in the integration's ERP list. The gallery
tile adds the integration once; adding it again is refused with a pointer to "Add another ERP".
Removing an ERP removes it from the list and deletes its workspace; removing the integration
removes every ERP. Filling, reset and "Load demo data" cover every ERP.

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
| Company block | Each ERP has its own blocking level; Commerce has one active/blocked flag. **Decided (owner, 2026-09-27): each brand for itself**, more exactly each ERP for itself: a block holds the lines whose `erp_owner` is that ERP, on any website and of any brand.** An ERP's block holds only that ERP's part of an order; it never changes the Commerce company's flag, which stays a group decision made in Commerce. Fits a group of separate brands whose orders span brands; to confirm with the client (is there group-level credit management?) | **Gap**: today the integration copies an ERP's block onto the company flag; that write is to be removed and replaced by per-part holds |
| Credit limit | Commerce's limit is the TOTAL across ERPs; each ERP's own limit, exposure and available credit in its own prefixed company custom attributes (decided 2026-09-26). **Demo: the ERPs own it** (demo scope above). For a customer whose CRM owns credit limits, the integration does not write the limit; the tech case tracks which applies to the client (#20). A brand's credit HOLD on its own part is unaffected | Built for one ERP (writes the limit); per-ERP attributes and the total built for several ERPs (B5, integration `f739c94`), not yet live. **Test**: does REST `setCustomAttributes` replace the whole set? |
| Credit exposure and balance | Each ERP counts only its own open orders and unpaid invoices; a hold on one ERP's exposure holds only its part | Built for one ERP; the payment leg (Commerce balance) is frozen (AB-26s) |
| Payment terms | Each ERP keeps its own; never in Commerce | Nothing to do |
| Company users, groups, shared catalogs | Commerce only. A company keeps ONE shared catalog; each ERP writes only its own SKUs' prices into it | Catalog writes not built (AB-26z) |

### 3.2 Catalogue, prices and stock

**How a brand is made (owner, 2026-09-28, from `.rptc/research` brand findings below).** A brand
is a product attribute (`brand`), shown to shoppers as a name and a filter on the one shared
website. Which ERP owns a product is a separate attribute (`erp_owner`); routing reads only that.
A stand-alone brand may also have its own website (own cart and checkout), using the per-website
settings the integration already has. The demo shows one website with brands by attribute; a
brand website is spoken to. Adobe docs: stores under one website share one checkout; each website
has its own cart and checkout (cart calls are store-scoped); Adobe's search ships
`attributes_brand` as a filter; Adobe has no built-in brand object.

**Brand, business unit, ERP, sales organisation (2026-09-28, PROVISIONAL: the sales-organisation
part depends on what the client tells the tech case).** Four words, four things:

| Word | What it is | Where it lives | What it decides |
|---|---|---|---|
| Brand | the name a buyer sees | product attribute `brand` | only what shoppers see and filter by; the ERP never sees it |
| Business unit | an acquired company that runs an ERP (the client says "brand" for this) | outside Commerce | who owns the ERP |
| ERP | a business unit's back-office system | its own system; one entry in the ERP list | who fulfils, ships, invoices, extends credit; routing uses product attribute `erp_owner` |
| Sales organisation | a selling unit inside one ERP | a setting on the ERP's entry, chosen by the order's website | which unit of that ERP books the order (numbering, prices, terms) |

An order line goes to the ERP its product's `erp_owner` names; that ERP books it under the sales
organisation it maps to the order's website; the brand is not used on the way. A block or credit
hold is the ERP's decision about its own customer account, so it holds that ERP's lines,
whatever their brand or website ("each ERP for itself"). Open with the client (tech case): how
each business unit books web orders (company, sales unit, region), and whether an ERP holding two
brands books them under different units; the design can express a sales organisation by website,
not by brand.

**Nothing is seeded (owner, 2026-09-28).** Demo Builder does not create brands, products or a
catalogue split. The SC creates the scenario they want and sets `brand` and `erp_owner` on the
products; the integration responds to whatever is there. The SC's instructions are the
integration's setup guide (`commerce-erp-integration/docs/demo-setup.md`, story 3).

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

**Combined order status** (the router is the only writer; revised by the owner 2026-09-28): Pending until every part is sent;
On Hold only while EVERY part is held (Commerce will not ship or invoice an order On Hold, so holding the whole order for one ERP's part would stop the other ERPs' shipments and invoices); while SOME parts are held, the order stays Processing with a custom "Partially Held" status and a note naming the waiting ERP and why; Processing while parts are moving; Complete
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

1. ~~Lock~~: locked as v1 (owner, 2026-09-27).
2. ~~Company block~~: each brand for itself (owner, 2026-09-27); see §3.1.
3. ~~Variants across ERPs~~: answered 2026-09-27. Products do not cross ERPs (owner, from the
   walk-through; the tech case's transcripts agree for product types). To confirm with the client:
   (a) is any SKU stocked or sold by two ERPs, including after an acquisition; (b) can variants
   of one product come from different ERPs.
4. **Cancel from an ERP after invoicing**: holding for staff is built (the interim answer);
   closing the rest by credit memo automatically waits on the credit-memo work (AB-26r).
5. ~~Returns~~: after the routing slices (owner, 2026-09-27).

## 7. Client questions this design depends on

Recorded in the tech case's question list: which ERPs and the ownership rule per line; whether
EDI and email orders must share the routing; one order per checkout; payment and billing per
brand; who owns price, stock and contract prices; one ERP down (send the rest, or hold); returns
for a mixed order; whether any SKU is sold by two ERPs.

## Change log

- 2026-09-27: v1 draft.
- 2026-09-27: products do not cross ERPs (owner; client transcripts agree for product types), variants follow their product; cancel-after-invoice holds for staff (fix built).
- 2026-09-27: LOCKED v1 by the owner. Returns come after the routing slices. The cancel fix went to the integration's main (`a76789a`).
- 2026-09-27 (after lock): company block is each brand for itself; the code layout (router, one adapter folder per ERP kind, the written contract, an example adapter, the ERP list keyed by id) and unique ERP names in a project. Diagrams affected: any that show a company block, and the integration's internal structure.
- 2026-09-27: the credit-limit row marked as depending on a client question (the client's stated direction is that their CRM owns credit limits). No decision changed. Phase B slice B5 waits on the answer.
- 2026-09-27: demo scope recorded: Commerce and the ERPs only; CRM and PIM are spoken to, not built. The credit limit is ERP-owned in the demo (no longer waiting on a client answer); a CRM-owned limit is a customer variation.
- 2026-09-27: adding a second ERP in Demo Builder is "Add another ERP" on the integration card; the tile is add-once (owner).
- 2026-09-28: how a brand is made: a `brand` attribute for shoppers, separate from the `erp_owner` attribute routing reads; one shared website in the demo, a stand-alone brand website spoken to. Vignettes gain "0. What a brand is"; their Today lines now say what is built for several ERPs but not yet live.
- 2026-09-28: nothing is seeded; the SC creates brands and products and sets both values; instructions in the integration's setup guide, story 3 (integration `5bffd76`).
- 2026-09-28: brand, business unit, ERP and sales organisation defined (provisional on the client's answer about selling units); "each brand for itself" reads as each ERP for itself.
- 2026-09-28: pending client answers listed by the tech case's register numbers (#1, #2, #4, #9, #17, #19, #20); no new rule added that depends on a client answer. The ERP's own credit block and the website account are two separate switches in each ERP (owner); the ERP never takes its own block from Commerce.
- 2026-09-28: combined status revised (owner): Commerce's On Hold only when every part is held; a partly held order stays Processing with a "Partially Held" status and a note, so other ERPs can still ship and invoice. With one ERP, a held part is the whole order, so it goes On Hold as before.
- 2026-09-28: the waiting-lines status is named "Partially Held" (code `partially_held`), owner; built in integration `6387fc9` and renamed after.
