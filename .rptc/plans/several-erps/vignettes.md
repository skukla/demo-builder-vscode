# Several ERPs: vignettes for the deck

Drafted 2026-09-27 from the locked design v1 (`design.md`). Each vignette is one scenario of
that design, told for a slide. Brands are "Brand A" (cabinets) and "Brand B" (signage); the
tech-case session puts the client's real names in its private copy. **The owner wants the
tech-case session to choose which to use, and how many, once the tech case is complete.**

Every vignette ends with **Today**: what is proven live with one ERP, and what is built for
several ERPs but not yet live (Phase B slices B0 to B5, on the integration's work branch as of
2026-09-28), so no slide claims more than the demo can show.

**How a brand is made (owner, 2026-09-28; used in every vignette):** a brand is a product
attribute (`brand`), shown to shoppers as a name and a filter on the one shared website, which is
what lets one cart hold several brands. Which ERP owns a product is a SEPARATE attribute
(`erp_owner`): two brands can share an ERP, one brand can span two. A brand that stands alone can
also have its own website, with its own cart and checkout. Adobe has no built-in brand object.

---

## 0. What a brand is

- **Situation:** the group sells many brands, each an acquired company with its own product line,
  factory and usually its own ERP; some brands also keep a site of their own.
- **Buyer sees:** on the group's site, each product carries its brand name, and brand is a search
  filter; one cart takes products of any brand. On a stand-alone brand site, only that brand.
- **Staff see:** two product attributes on every product: `brand` (for shoppers) and `erp_owner`
  (which ERP fulfils it). The product information system (spoken to, not built) masters both and
  writes them into Commerce.
- **Each ERP:** receives only the products, orders and lines it owns, whatever brand they carry.
- **Why two attributes:** brand is how the business sells; the owning ERP is how it fulfils.
  They usually match, but not always (a brand whose lines come from two factories, or two brands
  folded into one ERP after an acquisition).
- **Design:** "How a brand is made" above; §3.2 product and its owner.
- **Today:** the integration routes by the owning-ERP attribute (built, not yet live); the brand
  attribute and its filter are Commerce and storefront setup.

## 1. One cart, two brands

- **Situation:** a buyer puts cabinets (Brand A) and signs (Brand B) in one cart and checks out
  once, against one purchase order.
- **Buyer sees:** one order number and one confirmation.
- **Staff see:** one Commerce order. Its history notes each brand's ERP order number as each ERP
  accepts its part.
- **Each ERP:** Brand A's ERP receives only the cabinet lines; Brand B's only the sign lines.
  Neither knows the other exists.
- **Design:** §2 the shape (the routing action is the only subscriber to placed orders); §3.3
  order placed, sending a part.
- **Today:** one ERP receives whole orders, with its number written back (proven on Bodea).
  Splitting by owning ERP is built for several ERPs, not yet live.

## 2. Prices by brand

- **Situation:** the buyer's company has a contract with each brand.
- **Buyer sees:** each brand's contract price on the product pages and in the cart.
- **Staff see:** the company's shared catalog holds both brands' contract prices; each brand's
  ERP wrote only its own products' prices.
- **Each ERP:** keeps its contracts and sends them to Commerce.
- **Design:** §3.2 contract prices (one shared catalog per company, each ERP writes its own SKUs).
- **Today:** contract prices apply in the cart for one ERP (proven); prices written into the
  shared catalog, so they show on product pages too, are planned (AB-26z).

## 3. Each brand ships on its own

- **Situation:** Brand B ships the signs on Tuesday; Brand A ships the cabinets on Friday.
- **Buyer sees:** one order with two shipments, each with its own tracking; the cabinets show
  as not yet shipped until Friday.
- **Staff see:** two shipments on one order, each from that brand's warehouse (inventory source).
- **Each ERP:** reports its own shipment; the integration creates it on the Commerce order.
- **Design:** §3.3 shipments; §3.2 stock per source.
- **Today:** shipments from one ERP, both directions (proven).

## 4. Each brand bills its own lines

- **Situation:** each brand invoices for what it shipped.
- **Buyer sees:** two invoices on one order, one per brand.
- **Staff see:** two partial invoices; neither brand ever bills the other's goods.
- **Each ERP:** invoices only its own lines; the integration creates each partial invoice before
  that brand's shipment, one at a time.
- **Design:** §3.3 invoices and payment capture.
- **Today:** one ERP invoices the whole order (proven); per-ERP partial invoices, one at a time,
  are built for several ERPs, not yet live. Open with the client: how purchase-order payments are
  invoiced.

## 5. One brand says "not yet"

- **Situation:** the buyer is over its credit limit at Brand B, but in good standing at Brand A.
- **Buyer sees:** the cabinets proceed; the signs show as on hold.
- **Staff see:** a hold on Brand B's part with the reason in the order history; the company can
  still order from Brand A.
- **Each ERP:** Brand B holds its part; Brand A carries on. A block never switches the company off
  site-wide; it holds only that ERP's lines, whatever their brand (each ERP for itself, owner
  2026-09-27).
- **Design:** §3.1 company block, credit; §3.3 credit hold; the combined status (On Hold while
  any part is held).
- **Today:** a credit hold round trip for one ERP (proven live); a block held per ERP part is
  built for several ERPs, not yet live.

## 6. A brand's system is down

- **Situation:** Brand B's ERP is offline when the order arrives.
- **Buyer sees:** one order, as usual.
- **Staff see:** Brand A's part sent; Brand B's part waiting, retried, then marked failed with a
  Re-send button on the integration's Admin page.
- **Each ERP:** Brand A proceeds; Brand B receives its part when it is back, exactly once.
- **Design:** §3.3 one ERP down or refusing; sends keyed by order and part.
- **Today:** one ERP's send can be retried and never double-sends (built); per-part retry is
  built for several ERPs, not yet live.

## 7. A cancel after shipping

- **Situation:** Brand B cancels its part after Brand A has already shipped and invoiced.
- **Buyer sees:** the cabinets delivered; the signs cancelled.
- **Staff see:** Commerce keeps the order (it cannot cancel an invoiced order); it is put on hold
  with a note to close the rest with a credit memo.
- **Each ERP:** Brand B cancels in its own system; Brand A is untouched.
- **Design:** §3.3 cancel from an ERP.
- **Today:** holding a cancel that Commerce refuses is built (2026-09-27); the automatic credit
  memo is planned.

## 8. Adding an acquired brand

- **Situation:** the group acquires Brand C, with its own ERP.
- **What changes:** one adapter for Brand C's kind of ERP (or none, if the group already runs
  that kind), one line in the ERP list, and Brand C's products loaded with two values: `brand` =
  Brand C and `erp_owner` = Brand C's ERP. In the demo both are set in Commerce; for a customer,
  their product information system writes them (spoken to, not built). If Brand C's products are
  instead folded into an existing ERP, only the brand value is new: no adapter, no list entry.
- **What does not change:** the routing action, the storefront, the checkout, the other brands.
- **Design:** §2 code layout (router, one adapter folder per kind of ERP, the written contract,
  the ERP list).
- **Today:** a second ERP can be added from Demo Builder in the demo (as a copy); the routing
  version is designed.

## 9. Returns across brands (planned)

- **Situation:** the buyer returns one cabinet and two signs from the same order.
- **Buyer sees:** one return request.
- **Staff see:** the returned lines grouped by brand.
- **Each ERP:** receives only its own returned lines.
- **Design:** §3.4 returns (after the routing slices, owner 2026-09-27).
- **Today:** not built.

## 10. Orders that don't come through the website

- **Situation:** most of the group's orders arrive by EDI and never reach Commerce.
- **The honest slide:** the routing described here handles web orders. Whether EDI orders must
  follow the same rules, and whether that points to a routing service or order management system
  in front of Commerce, is an open question for the client.
- **Design:** §7 client questions.
- **Today:** not applicable.
