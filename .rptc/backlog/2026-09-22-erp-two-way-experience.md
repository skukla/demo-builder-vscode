---
id: AB-25
kind: epic
area: app-builder
parent: AB-9
needs: []
value: med
status: backlog
---

# The two-way ERP integration, as the two business users experience it

The ERP integration moves data both ways, but nobody has designed what the PEOPLE on
either side can see and do. The owner, 2026-09-22: "we need to flesh out this
bidirectional integration, and the UI experience that a business user who works in an ERP
and a business user who works in Commerce should have."

Two business users, plus the buyer who sees the result:

- **The ERP user** (back office: sales ops, finance) works in the ERP's own screen.
- **The Commerce user** (store operations) works in the Commerce Admin.
- **The buyer** sees contract prices, credit and order status on the storefront.

The work lives in the two ERP repositories (`skukla/demo-erp`, `skukla/commerce-erp-integration`),
not in this extension. It is filed here because the extension ships the pair (AB-9).

## What each can do today, and what they cannot

Read from the code in a project's clone of both apps on 2026-09-22 (the Admin page
`src/commerce-backend-ui-2/web-src/src/pages/main-page.jsx`, the price webhook
`actions/webhook/item-prices`, `app.commerce.config.ts`). Not run.

| Who | Can | Today |
|---|---|---|
| Buyer | contract prices in the cart; ERP stock; ERP order number and shipment/invoice status; company credit and block | ✓ |
| ERP user | see web orders arrive with the Commerce number; ship, invoice, cancel and have Commerce follow; change a price, stock, credit or block and have Commerce follow | ✓ |
| Commerce user | see whether the ERP is reachable, and counts (products, partners, orders, events waiting) | ✓ |
| Commerce user | refresh partners from Commerce, push records to the ERP, reset the ERP's records | ✓ |
| Commerce user | choose per website what flows (orders, contract prices, discount ceiling) | ✓ business settings |
| Commerce user | **see a history of what crossed, which way, and whether it worked** | ✗ — the page's "log" is only what its own buttons did during one visit, gone on leaving |
| Commerce user | **see why a cart got its price** (which contract, the ERP's answer, a ceiling cut, a fallback) | ✗ — the price webhook writes only to its Runtime log |
| Commerce user | **retry or resend one failed item** (an order the ERP rejected, or held while it was down) | ✗ |
| Commerce user | **follow one record end to end** ("where is order 1042?") | ✗ |
| Commerce user | fix a mismatch (a company or SKU the ERP has no match for) | ✗ |
| ERP user | see, in the ERP, which of its records came from or went to Commerce, and their state | not designed |

## Decided so far (owner, 2026-09-22)

1. **Pricing logic stays in the ERP.** Commerce asks at cart time and keeps no editable copy;
   a pricing screen in Commerce would make two owners. The alternative — syncing contract
   prices into Commerce as B2B price lists — trades freshness for resilience and is not the
   demo's choice: a change in the ERP should show immediately.
2. **Commerce shows the ERP's reasoning read-only.** The Admin page asks the ERP live "what is
   this company's price for this SKU, and why" and shows the answer. The ERP owns the rules,
   so it is the one that can explain them.
3. **The exchange history lives in the INTEGRATION, and shows on the one Commerce Admin page.**
   The ERP sees most traffic, but never the failures where it could not be reached — and those
   are what "retry a failed order" is about. In real projects the integration layer, not the
   ERP, keeps this record; mirroring that reads true to customers who run these projects.
4. **Not the Commerce Action Log.** It records Admin users' own actions; on Adobe Commerce as a
   Cloud Service it cannot be configured, only read; and no documented way lets an app add
   entries (Experience League, "Action logs", read 2026-09-22 — the page is silent, which is
   not the same as a documented no). The Bulk Actions log could show ERP → Commerce changes
   made through the asynchronous bulk API, for that one direction only; untested on the
   cloud service.

## Parts

1. **The Admin menu reads "ERP integration" twice.** The section heading and the item both
   come from the app manifest: the item is `adminUi.menu.label`, the heading most likely
   `metadata.displayName` (inferred). Keep the section as the app's name; name the item for
   the page ("Sync status"). Bump `metadata.version`, or the change never reaches Commerce.
2. **An exchange history**, written by the integration for every crossing — price answers,
   orders sent, statuses received, failures — kept like its company ledger, shown on the
   Admin page with filters (failed; this order; this company).
3. **Price explanations**, answered live by the ERP and shown read-only (decision 2).
4. **Retry one failed item** from the history.
5. **Follow one record end to end**, built on the history.
6. **The ERP user's side**: what the ERP screen shows about Commerce (not designed; the table
   above has it as an open row).

The demo moments, in order of impact: retry a failed order ("the ERP was down; here is the
order that did not make it; one click and it is through"), then follow one order end to end,
then explain a price. Fixing mismatches and a forced resync matter least on stage.

## Related

- AB-10 — the ERP section in Commerce Admin for SETTINGS. Same page family, different job;
  build the two so they share the menu section.
- AB-15 — two installs on one Commerce collide (fixed webhook and event names per app id).
- AB-16 — several ERPs in one project; the extension side was built under AB-23 (two-ERPs
  plan, 2026-09-22), the Commerce side is AB-15.
- AB-19, AB-20 — the ERP answering live (availability, credit): the same "ask the ERP"
  shape as price explanations.

Filed 2026-09-22.

## Shipped so far

- 2026-09-22  docs(backlog): AB-25, the two-way ERP integration as its business users see it (`3da75a2ff`)
