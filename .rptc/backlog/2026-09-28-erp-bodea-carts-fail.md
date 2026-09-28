---
id: AB-16b
kind: fix
area: app-builder
parent: AB-16
needs: []
value: high
status: backlog
---

# Bodea carts fail intermittently with "Internal server error"

Filed 2026-09-28.

## What was measured

- 4 of 5 guest carts holding one Northwind product (`accesspoint`) failed at a random step
  (`setShippingAddressesOnCart`, `setGuestEmailOnCart`, `cart`) with Commerce's "Internal
  server error"; one failed with "ERP discounts are unavailable". Mixed carts failed the same
  way, and one failed at `placeOrder` ("A server error stopped your order").
- Storefront queries and empty carts all succeeded (5 of 5 each), so Commerce itself answered.
- The integration's two cart webhooks ran and answered correctly each time (Runtime
  activations, code 0, 0.6 to 2.8 s; their results were valid operations).
- Carts worked earlier the same day (order 3000000018 at 09:08 UTC, mixed); the failures
  started after that day's integration deploys and the second ERP's listing.

## What it is not

Not the webhooks' 1 s soft timeout: Adobe's reference says exceeding it is only logged
(developer.adobe.com/commerce/extensibility/webhooks/create-webhooks/). Not duplicate webhook
registrations: System → Webhooks Subscriptions lists exactly two.

## Next

Read Commerce's webhook log (database logging is on, level WARNING, one-day retention; the
Webhooks Logs grid would not finish loading on 2026-09-28). Then compare with the price sync
(AB-26z), which removes these cart webhooks entirely.

## Shipped so far

- 2026-09-28  2026-09-28 after AB-26z removed both cart webhooks: 5 of 5 Northwind guest carts built (earlier the same day 4 of 5 failed with the same cart). Strong evidence the cart webhooks were the cause; which aspect is not known. Close once a placed order also succeeds.
