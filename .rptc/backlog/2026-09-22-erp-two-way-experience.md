---
id: AB-25
kind: epic
area: app-builder
parent: AB-9
needs: []
value: med
status: active
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
5. **Each ERP gets its own section in the Commerce Admin menu**, named after the ERP
   ("Northwind ERP"), not one shared "ERP integration" item. Each ERP has its own contracts,
   settings and health, and with two ERPs (AB-16) one item cannot show both. Its items, as a
   first cut: **Status** (reachable or not, the exchange history, retry), **Pricing** (below),
   **Settings** (the rest of the integration's behaviour: orders, offline handling). Buildable:
   AB-10 records the reference app declaring a three-item section through the Admin UI SDK.
   With two copies each section needs its own ids — the same fixed-name problem as AB-15,
   solved by the same per-copy setting.
6. **The ERP's pricing rules are visible in Commerce, read-only**: which contracts exist, which
   companies they cover, their validity dates, active or not. The price explanation (decision
   2) widened from one cart to the rule list. It serves the store operator who fields "why is
   this buyer's price wrong?".
7. **Commerce switches its USE of the ERP's rules, never the rules themselves.** Pricing
   conditions sit behind the ERP's own approvals and audit trail, so switching one off from
   Commerce would go around them and bring back two owners. Commerce's switches are the
   integration's behaviour, per website: use contract prices, apply the discount ceiling, and
   what happens when the ERP does not answer (fall back to Commerce prices, or block checkout).
   The first two exist as business settings today. A "pretend the ERP is down" switch for live
   demos belongs here too (AB-10 names failure toggles).

Decisions 5 to 7 were proposed from how these integrations are usually run. The research pass
(`.rptc/research/erp-two-way-ux/research.md`, 2026-09-22, public vendor docs) checked them:

- **5, a section per ERP:** the common shape is one settings card PER CONNECTION, assigned to
  stores (Business Central, Celigo, SAP Commerce by sales area). One store feeding SEVERAL
  back ends does exist — SAP Commerce with Order Management Services splits one order into
  sub-orders across several SAP systems, and the buyer still sees one order (second pass;
  the first pass had said "not seen") — but for ORDERS only: live pricing then works with a
  single back end. Two ERPs from different vendors behind one store: not found. So if we demo
  two ERPs on one store, name which one prices.
- **6, rules read-only in Commerce:** not seen anywhere. It would be new — a way to stand out,
  not a copy of the norm. Worth building only if it earns its place in a demo.
- **7, switches for Commerce's use only:** confirmed. Sana's docs say it "does not have any
  influence on how prices are calculated"; its admin, like SAP Commerce's Backoffice, holds only
  "use ERP prices", a price cache, and what to show when the ERP is offline. Turning an ERP rule
  on or off from the commerce side: not seen. Offline options to offer: hide the price, show the
  last known price, or block checkout.

It also settled the rest of the table: a run log, a failed-record list with the reason, and
retry of one record are the common pattern (Boomi, Celigo, Business Central). Adobe ships that
exact shape in its own Admin — Data Feed Sync Status: per-record status, an error column, a
"Schedule Resync" mass action — for Commerce → Adobe services, not ERPs; it is the layout for
part 2. An end-to-end trace of one order inside a commerce admin is not a named feature
anywhere (middleware only lets you search its logs by order number) — a way to stand out.
When the ERP is down during live pricing, SAP's pages document no fallback; Adobe's own SAP
article calls a fallback mandatory and something you build — decision 7's offline switch. On the ERP
side, the ERP order carries the web order number and the buyer's PO number, with an inbound
list that flags errors and filters by channel (Business Central, NetSuite): the start of part 6.

## Parts

1. **The Admin menu reads "ERP integration" twice.** The section heading and the item both
   come from the app manifest: the item is `adminUi.menu.label`, the heading most likely
   `metadata.displayName` (inferred). Superseded in shape by decision 5 — a section per ERP,
   named after it, with items named for their pages — but the rule stands: bump
   `metadata.version`, or the change never reaches Commerce.
2. **An exchange history**, written by the integration for every crossing — price answers,
   orders sent, statuses received, failures — kept like its company ledger, shown on the
   Admin page with filters (failed; this order; this company).
3. **Price explanations and the rule list**, answered live by the ERP and shown read-only
   (decisions 2 and 6), with the per-website switches beside them (decision 7).
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
- 2026-09-22  docs(backlog): AB-25, a section per ERP, its rules read-only, switches only for their use (`8929da9d8`)
- 2026-09-22  docs(research): what two-way commerce-ERP integrations give each person (`3318afaa6`)
- 2026-09-22  docs(research): second pass on two-way ERP UX, one first-pass claim overturned (`7a31fd348`)
- 2026-09-22  History and Retry for orders sent to the ERP, in skukla/commerce-erp-integration on feature/sync-history (2244a65, 1aedb8e); not pushed, not deployed
- 2026-09-22  docs(plan): AB-25 history and retry, built in the ERP integration repo (`f88eee0e8`)
- 2026-09-22  ERP → Commerce events in the same history, with Retry, in skukla/commerce-erp-integration on feature/sync-history (7ae953a); not pushed, not deployed
