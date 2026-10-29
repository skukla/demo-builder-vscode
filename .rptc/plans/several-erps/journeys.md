# Several ERPs: the walk-through journeys

Draft, 2026-09-28 (night loop), from the locked design v1 and its vignettes. What to show, in
order, on a freshly set-up demo (see `fresh-start.md`). Each journey says what to prepare, what
to click, what the audience sees, and the one sentence to say. Brands are "Brand A"
(cabinets, ERP-A) and "Brand B" (signage, ERP-B); the tech case uses the client's real names.

Status legend at the end of each journey: **Live** (proven on Bodea), **Built** (built and
tested, not yet proven live), **Planned**.

## Before any journey

- Two ERPs added from the integration card ("Add another ERP"), each with its own look.
- Products carry `brand` and `erp_owner` (setup guide, story 3); at least one cabinet (ERP-A)
  and one sign (ERP-B) in stock at their ERPs' warehouses on the website's stock.
- One B2B company with a credit line, Payment on Account on for the website.
- The "Partially Held" order status created and assigned (setup guide).
- Warm-up: add something to a cart once after any deploy.

## 1. What a brand is (vignette 0)

- **Show:** the storefront category page with the brand filter; a product page with its brand
  name. Then, in the Commerce Admin, the same product's two attributes: `brand` and
  `erp_owner`.
- **Say:** "Brand is how you sell; the owning ERP is how you fulfil. The storefront shows one,
  the integration reads the other."
- **Status:** Built (attributes are setup; routing by `erp_owner` built).

## 2. One cart, two brands (vignettes 1, 11)

- **Do:** as the company buyer, put a cabinet and a sign in one cart; check out on account.
- **Show:** one order number. In the Admin: one order; its history notes each ERP's order
  number. Open each ERP's screen: ERP-A has only the cabinet line, ERP-B only the sign.
- **Say:** "One order for the buyer; each brand's system gets only its own lines, booked under
  its own sales organisation for this website."
- **Status:** Built.

## 3. Prices by brand (vignette 2)

- **Show:** the company's contract price on each brand's product, in the cart.
- **Say:** "Each ERP prices its own lines; the cart asks both at once."
- **Status:** Built (cart pricing per ERP); product-page prices from the shared catalog are
  Planned (AB-26z).

## 4. Each brand ships and bills on its own (vignettes 3, 4)

- **Do:** in ERP-B, ship and invoice the sign part. Later, in ERP-A, ship and invoice the
  cabinet part.
- **Show:** the Commerce order gains a partial invoice then a partial shipment for the sign
  (from ERP-B's warehouse), then the same for the cabinet; the order reaches Complete only after
  both.
- **Say:** "Each brand invoices and ships only what it owns, on the one order the buyer sees."
- **Status:** Built. Partial invoices proven live for purchase-order and on-account payment
  (Live, 2026-09-28); per-ERP flow Built.

## 5. One brand says "not yet" (vignette 5)

- **Do:** in ERP-B, set the company's Credit block to "Stop all". Place another mixed order.
- **Show:** the order is **Partially Held**, with a note naming ERP-B; the cabinet part still
  invoices and ships. In ERP-B's customer page: "Credit block: Stop all"; "Website account:
  Active". In Commerce, the company is still Active. Lift the block in ERP-B: the sign part is
  sent, then billed and shipped.
- **Say:** "A brand's credit decision holds only its own lines; it never locks the customer out
  of the site."
- **Status:** Built.

## 6. A brand's system is down (vignette 6)

- **Show:** with ERP-B unreachable, the order goes Partially Held; the integration's order view
  shows ERP-B's part waiting, then failed, with Re-send.
- **Status:** Built (B7 adds the order view and Re-send).

## 7. A cancel after shipping (vignette 7)

- **Show:** ERP-B cancels its part after ERP-A has shipped: the order stays Partially Held with
  a note to close the rest by credit memo.
- **Status:** Built (the hold); the automatic credit memo is Planned.

## 8. Adding an acquired brand (vignette 8)

- **Do:** on the integration card, "Add another ERP", named Brand C; tag a few products with
  `brand` = Brand C and `erp_owner` = its id.
- **Show:** the next mixed order sends Brand C its lines; nothing else changed.
- **Say:** "Adding a brand is an adapter and a list entry, not a new integration."
- **Status:** Built after B6.

## 9. Where an order line goes, and who books it (vignette 11)

- **Show:** the same cabinet ordered on the main website and on a stand-alone brand website is
  booked by ERP-A under two different sales organisations (the ERP's per-website setting).
- **Status:** Built; pending client question #1 for the client's actual booking.

## Not shown (open)

Returns across ERPs (after routing, design first); orders arriving by EDI (client question #2).
