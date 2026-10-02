# Loop report — 2026-10-02, order to return on Justrite

## In short

The goal is met. One Justrite order, split between Justrite ERP and Accuform ERP, now goes
from cart to shipped, invoiced, returned and credited, with every system showing its part, and
it ran end to end three times live with no hand step (orders 5000000005, 5000000006,
5000000007). The steps to show it are written: `commerce-erp-integration/docs/walkthrough.md`,
"One order, two ERPs, from cart to return". Getting there meant fixing three defects that
stopped or spoiled the flow on the live store, and building returns and credit memos in both
repos. A few owner decisions are queued at the end.

## The story

The first test order failed: every Justrite order was refused at checkout with "The ERP could
not confirm this order right now". The integration's check at checkout read Commerce slowly
before asking the ERPs and ran past Commerce's 10-second limit. It now has an 8-second
deadline and reads each line's owner in one search (16 s became 3.5 s). That exposed an older
bug: before an order is saved its lines have no ids, so the check sent every line to the last
ERP; it now keys lines by position. Both fixed and deployed (AB-55).

The baseline then worked: the order split, each ERP shipped from its own warehouse and
invoiced its own part. Live tests settled the facts the returns design was waiting on:
Commerce has a return event, its API moves a return through every status, and one credit memo
per ERP refunds to the company's credit line.

Returns and credit memos were then built in parallel: in the mock ERP (return orders,
receive, credit memos, and their screens) and in the integration (a Commerce return split and
sent to each ERP; each ERP's credit memo becoming a Commerce credit memo of only its lines;
the return's status moved as each ERP acts). Live checks before deploying caught a bug the
tests could not: return comments used the order comment's field names, which Commerce
refuses. The first live run caught another: Commerce refuses to save a return item that is
already approved, so the second ERP's credit never closed the return. Both fixed and proved.

Reading the order history afterwards showed a split order being re-sent to its ERPs on every
later save (no duplicate ERP orders, but "waiting for confirmation" on a completed order, and
the parts' statuses reset). Fixed, and confirmations now name their ERP (AB-56).

## Shipped (on main in both ERP repos, deployed to Justrite; Demo Builder on the loop branch)

| Item | What | Where |
|---|---|---|
| AB-55 | Checkout check answers in time, one ERP per line | commerce-erp-integration f63574a, cd4629c |
| AB-16e | Returns across several ERPs, both directions, statuses and comments | commerce-erp-integration b74445f … d32060e; demo-erp 59d7200, 7f40389 |
| AB-26r (ERP side) | ERP credit memo, from an invoice or a return, into Commerce | same |
| AB-56 | A split order is no longer re-sent; confirmations name the ERP | commerce-erp-integration 83cb0a0, ce2cde4 |
| AB-54 | ERP lookup no longer fails on a product Commerce lacks | commerce-erp-integration 3b13fe2 |
| AB-26v | Partial invoicing written up as a customization | commerce-erp-integration docs/partial-invoicing.md |
| AB-53 (part) | All 24 AccuformNMC signs read in stock on the storefront | live data fix, cause recorded |
| — | Demo Builder's Commerce write tool sends a DELETE body | this repo 502bec122 |
| AB-38 | A business user sets when the price publish runs (heartbeat + six settings) | commerce-erp-integration 3c55ebf, app 0.12.0 |
| AB-57 | An ERP's own shipment echoed from Commerce is no longer refused and re-delivered for hours | commerce-erp-integration c84a116 |

Deployed: integration c84a116 (app version 0.12.0 upgraded in Commerce), both ERPs 7f40389,
contract version 13. Rehearsal script: `.rptc/plans/several-erps/rehearse-order-to-return.sh`.

## Filed / found

- After the goal was met, the integration's failed runs showed about a hundred re-deliveries
  of Commerce shipment events from 05:24 to 07:25: every shipment an ERP made came back from
  Commerce with the configurable's child line, which the ERP refused, and the integration
  asked for it again forever. Fixed and deployed (AB-57); none since.

- A return cannot be deleted over REST on this store, even with the return in the body; a
  credit memo cannot be deleted at all. Rehearsals leave credited orders behind; retire a
  return by closing it.
- Returns are off for shoppers on Justrite (`sales/magento_rma/enabled` unset); staff enter
  them in Admin until "Enable RMA on Storefront" is switched on.
- A REST bulk load of configurable products leaves the parents out of stock in Catalog
  Service until one child's stock is saved again after the links exist (logged on AB-53).

## Retracted / corrected

- The ERP lookup bug was first called a one-line fix in the one-ERP path; reading the code
  showed it was the several-ERPs ownership read.
- AB-56 was first guessed to be a lost-update race; the code showed a plainer cause (a list
  of "done" statuses that missed every status an ERP message sets).
- A first live test of partial return statuses was aimed at a closed return and proved
  nothing; redone on an open one.

## Environment facts

- Test data left on Justrite (read 2026-10-02): orders 5000000002 to 5000000007, ten Commerce
  credit memos (5000000001 to 5000000010) and their ERP counterparts, six returns all closed
  or processed (5000000002 to 5000000007), an empty admin cart 72. Northgate's credit balance carries the test orders
  less their credits. "Reset ERPs" clears the ERP side; Commerce keeps the orders.
- The permission system did not block the Justrite deploys after your authorization.

## Your decisions (walkthrough queue)

0. **AB-38, one look:** in Commerce Admin, the ERP integration's App Management configuration
   now has six schedule settings (store timezone; price publish on/off, how often, minute,
   time, weekday). Open it, check they render, and save once.

1. **Merge?** Demo Builder's loop branch `loop/2026-10-02-order-to-return` (the DELETE-body
   fix, backlog and design records). Recommendation: merge into feature/erp-integration.
2. **AB-26m** (the entity map): the Data Map tab shipped in its place on 2026-09-28 and you
   confirmed that page on 2026-09-29. Recommendation: mark AB-26m superseded by AB-16k.
3. **AB-26y step 6** (the ERP speaking its own event language, and its delete rules): a
   rewrite of every event path the flow just proved. Recommendation: schedule it as its own
   supervised run, not unattended. Also its two open questions: Wipe moves to Demo Builder
   (recommended yes), and whether Demo Builder can pre-fill the mapping settings.
4. **AB-53 clean-up**: delete the CitiSignal and Bodea websites and their unassigned products,
   or leave them off every website. Recommendation: leave them (deleting is irreversible and
   nothing in the Justrite demo reads them).
5. **AB-29**: mark built for Commerce as a Cloud Service and file the PaaS admin-token path
   when a PaaS demo needs it.
7. **AB-26s, the payment leg:** designed, not built
   (`.rptc/plans/several-erps/payment-leg-design.md`). Three questions there; the on-account
   half (pay in the ERP, the company's credit back in Commerce) is buildable on Justrite, the
   card half needs a card payment method the store does not have.
8. **AB-26w:** what remains (always asking Commerce to email the customer) waits on proving
   that disabled Sales Emails suppress an API notify, which the sandbox cannot show (it sends
   no email). Needs a store that sends mail or an Adobe source.
6. **Shopper returns**: switch on "Enable RMA on Storefront" for Justrite if you want the buyer
   to start the return in the demo (a Commerce Admin setting; the loop does not change store
   configuration).
