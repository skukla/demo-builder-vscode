# Several ERPs: returns (design draft)

**Version: r1, APPROVED by the owner 2026-09-28** (the integrated flow below replaces r0's
manual steps where they differ). Design only; nothing here is built. Extends the locked design
v1 (`design.md` §3.4, "Returns" and "Credit memo" rows) and vignette 9. Owner decided
(2026-09-27): returns come after the routing slices, design first.

**Source labels.** **[Adobe]** = read on an Adobe page (URL given). **[Ref]** = listed in the
Cloud Service REST reference, not tried live. **[Code]** = read in the repos on 2026-09-28.
**Not verified** = no source found; a live test is named instead.

## r1: the integrated flow (approved 2026-09-28)

The owner's direction: Commerce's own return process is largely manual, and clients now expect
an integrated flow that handles the routine steps, with staff handling only exceptions. Where
this section and the r0 text below differ, this section wins.

| # | Step | Who | Return status in Commerce | Order status |
|---|---|---|---|---|
| 1 | Buyer requests a return on the storefront (`requestReturn`); staff can still enter one in Admin | Buyer | Pending | Complete (unchanged) |
| 2 | The integration splits the lines by the ERP that SOLD each one (the order's parts record) and sends each ERP its return order | Integration | Pending | Complete |
| 3 | Each ERP checks its own return policy (return window, returnable item) and accepts or refuses its lines; the integration authorizes or denies those lines in Commerce | Each ERP, then integration | Authorized / Partially Authorized / Denied | Complete |
| 4 | On authorization, a return label: from Commerce's built-in carrier connection for returns (UPS, USPS, FedEx, DHL, "Enabled for RMA") if the client uses one, else from the ERP; emailed with the return number | Commerce or ERP | Authorized | Complete |
| 5 | Goods arrive at the owning ERP's warehouse; the ERP posts the receipt; the integration sets the status | ERP, then integration | Return Received / Return Partially Received | Complete |
| 6 | The ERP posts its credit memo; the integration makes the matching Commerce credit memo for that ERP's lines, offline, refunding to company credit when the order was on account; shipping refunded by rule (below) | ERP, then integration | Processed and Closed once every ERP's piece is credited | Closed when fully refunded (Commerce moves it itself) |
| 7 | The buyer is told at each status by Commerce's own emails | Commerce | | |

**Decisions (owner, 2026-09-28):**
- **The integration moves the return's status** (Authorized/Denied from the ERP's policy, Return
  Received from the ERP's receipt, Processed and Closed from the ERP's credit). Replaces r0's
  "comments only". Waits on live test R-T2.
- **Shipping is refunded automatically, by rule**: once, on the credit memo that completes the
  return, when the return reason is the seller's fault (damaged, wrong item); a change of mind
  gets none. One integration setting, because clients differ. A credit memo's Refund Shipping
  amount is set through the same API (Experience League, "Issue a credit memo"). Replaces r0's
  "staff refund shipping by hand".
- **An ERP's refusal denies its lines in Commerce** (step 3), with the ERP's reason in a comment;
  staff can override. Replaces r0's "no".

**What the mock ERP gains beyond r0 §5.1:** a return policy (a return window in days per ERP,
and "returnable" per product), the check that accepts or refuses a return order line against it.
Both are standard (SAP returns with approval; Business Central return reason codes and a
return period); r0 had left return windows out.

**Live tests added to §6:** R-T2 now decides the status writes (it was optional). R-T6: are the
built-in carrier connections, "Enabled for RMA", available on Adobe Commerce as a Cloud Service?
R-T7: a credit memo with a shipping refund, to company credit, on an order paid on account.

**Open for the client:** whether they use a carrier connection for return labels or their
ERP/3PL issues them; their return policy per business unit (window, returnable items); whether
shipping is refunded for seller-fault returns only.

## 0. The answer in five lines

1. The buyer asks for one return in Commerce. Commerce's Returns feature (called RMA: "returned
   merchandise authorization") is available on the Cloud Service and has REST endpoints.
2. When staff authorize it, the integration splits the return by the order's parts record. Each
   ERP gets a return order holding only its own lines.
3. Each ERP receives the goods and posts its own credit memo (the document that says "we owe
   the buyer this much back"). The integration then makes one matching Commerce credit memo for
   only that ERP's lines.
4. One ERP refusing or down never stops the others. Its piece waits, failed and open, with
   Re-send. This is the same rule the order parts already follow.
5. Each return gets its own record, keyed by return number. The order's parts record is only
   read, never written.

## 1. How Commerce represents returns

| Fact | Source |
|---|---|
| Returns (RMA) are an Adobe Commerce feature, not in Magento Open Source. The buyer or staff raise a request; staff authorize it fully, partly, or not at all | [Adobe] https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/order-management/returns/returns |
| Return statuses: Pending, Authorized, Partially Authorized, Denied, Return Received, Return Partially Received, Approved, Rejected, Processed and Closed, Closed | same page |
| In the Admin, staff can create a return only for an order whose status is **Complete** | same page, "Create a return request in the Admin", step 3 |
| Each line has a reason, a condition and a resolution (Exchange, Refund, Store Credit) | same page |
| Switched on by config: Stores > Configuration > Sales > Sales > RMA Settings > Enable RMA on Storefront; per product "Enable RMA" | [Adobe] https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/order-management/returns/rma-configure |
| Storefront GraphQL `requestReturn` is marked available on the Cloud Service. It takes `order_uid`, `items[]` (`order_item_uid`, `quantity_to_return`), `contact_email`, `comment_text`. `storeConfig.returns_enabled` says whether returns are on | [Adobe] https://developer.adobe.com/commerce/webapi/graphql/schema/orders/mutations/request-return/ |
| **REST for returns exists on the Cloud Service**: `GET/POST /V1/returns`, `GET/PUT/DELETE /V1/returns/{id}`, `GET/POST /V1/returns/{id}/comments`, tracking numbers, labels. A return's items carry `order_item_id`, `qty_requested`, `qty_authorized`, `qty_approved`, `qty_returned`, `status`, `reason`, `resolution` | [Ref] https://developer.adobe.com/commerce/webapi/reference/rest/saas/ (served from https://adobe-commerce-saas.redoc.ly, tag "returns") |
| A credit memo can only be made for an **invoiced** order. It can be full or partial, cover several invoices, or cover part of one line (3 of 5) | [Adobe] https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/order-management/credit-memos/credit-memo-create |
| Refund kinds: online (through the payment gateway); **Refund Offline** (check, money order; the memo is only a record); B2B **Refund to Company Credit** when the order was paid on account | same page |
| "Return to Stock" on a credit memo line puts the quantity back. With inventory sources on, it goes to the source that shipped it | same page |
| REST credit memo: `POST /V1/order/{orderId}/refund` (offline methods) and `POST /V1/invoice/{invoiceId}/refund` (online). Body: `items[]` (`order_item_id`, `qty`), `notify`, `appendComment`, `comment`, `arguments` (`shipping_amount`, `adjustment_positive`, `adjustment_negative`, `extension_attributes.return_to_stock_items`) | [Adobe] https://developer.adobe.com/commerce/webapi/rest/modules/sales/ ; body from [Ref] tag "orderorderIdrefund" |
| Credit memo event `sales_order_creditmemo_save_after`: its payload shape is in the integration's `EVENTS_SCHEMA.json`. It is not subscribed, and no live payload has been captured | [Code] `commerce-erp-integration/EVENTS_SCHEMA.json`, `docs/commerce-api-inventory.md` |
| **An event when a return is saved or authorized: not verified.** No RMA event is named in any Adobe page found, nor in `EVENTS_SCHEMA.json` | Test R-T1 |
| A return can be deleted (`DELETE /V1/returns/{id}`). The reference lists **no delete for a credit memo** | [Ref] |

**This corrects design v1 §3.4**, which says "no REST endpoint found" for returns. The Cloud
Service REST reference lists them. They are not yet tried live.

## 2. What a real ERP does with a return

| ERP | Documents | Source |
|---|---|---|
| Business Central | A **Sales Return Order**, filled from the posted invoice lines ("Get Posted Document Lines to Reverse"), with a Return Reason Code per line. Posting it records the receipt and "automatically issues the related sales credit memo". A plain **Sales Credit Memo** also works without a return order when nothing comes back | [MS] https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-process-sales-returns-orders |
| SAP S/4HANA | A **returns order** (sales document type RE) made with reference to the invoice. It carries a billing block (a flag that stops billing) by default. Then a returns delivery (goods received), then the block is lifted and a **credit memo** is billed. For money back with no goods, a **credit memo request** is used. Advanced Returns Management is a separate option (type RE2) | Search excerpts of https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/e39b7fc41e21465498820a32fe158821.html and SAP Community answers. **The SAP pages would not render for reading, so these are partly verified** |

Both do the same three things: a return document that references the sale, a goods receipt,
then a credit memo. The credit memo is the ERP's decision. So the ERP is the master of "how
much we credit", and Commerce is the master of "what the buyer asked to return".

## 3. The design

### 3.1 The flow for one return spanning two ERPs

| # | Step | Direction | What happens |
|---|---|---|---|
| 1 | Buyer asks | buyer → Commerce | One return on the order, in Commerce's Returns: from the storefront (`requestReturn`) or entered by staff. It stays **Pending** |
| 2 | Staff authorize | Commerce | Staff authorize the whole return or some lines, in Commerce's Returns screen as they do today. Commerce stays the one place a buyer's request is decided |
| 3 | Split | integration | On authorization, the integration reads the order's parts record (`order-parts-<order number>`). Each part lists the Commerce line ids it owns (`itemIds`). Each returned line (`order_item_id`) is matched to the part holding that id. The result is one **return piece** per ERP |
| 4 | Send | Commerce → each ERP | Each ERP's adapter sends its piece as a return order. It references that ERP's own sales order number (the part's `erpNumber`) and carries only its lines and authorized quantities. Keyed by return number + ERP id, so a retry never sends twice |
| 5 | ERP accepts | ERP → Commerce | The ERP's return order number goes into a return comment (`POST /V1/returns/{id}/comments`) and the return record |
| 6 | Goods back | in each ERP | The ERP posts the receipt. The integration writes a return comment ("Brand B received 2 signs") |
| 7 | ERP credits | ERP → Commerce | The ERP posts its credit memo. The integration makes one Commerce credit memo for only that ERP's lines and quantities: `POST /V1/order/{id}/refund`, offline, `return_to_stock_items` empty (the ERP owns stock), `shipping_amount` 0. It is keyed by the ERP's credit memo number, so a redelivered message credits nothing twice, and made under the order's existing lock (`lockOrder`) |
| 8 | Closed | Commerce | When every piece is credited or refused, the integration adds a closing comment. Staff set the return's final status (see the open question on writing return statuses) |

A line whose id is in no part (bought before routing, or never routed) is **unrouted**. It is
recorded and shown to staff, never guessed. The product's `erp_owner` today is not used: the
product may have changed owner since the sale. The ERP that sold it takes it back.

A credit memo **made in Commerce** by staff, not by an ERP, is told to each ERP for its own
lines only. This mirrors how Commerce-made shipments and invoices already reach each ERP
(`part-fulfilment.js`). It needs the credit memo event (design v1 live test 8).

### 3.2 What people see

| Who | Sees |
|---|---|
| Buyer | One return on their order, with its comments that are marked visible on the storefront. One refund (credit memo) per brand as each brand credits it. The storefront's return screen depends on the storefront (Test R-T5) |
| Staff, Commerce Returns screen | Commerce's own return, with a comment per ERP step: sent, the ERP's return number, received, credited or refused, and why |
| Staff, the integration's order view ("ERP parts" button) | A **Returns** section. Each return shows one row per ERP: its lines, status (`sending`, `sent`, `received`, `credited`, `refused`, `failed`), the ERP's return and credit memo numbers, and **Re-send** on a failed or refused piece |
| Each ERP's screen | A return order with only its own lines, referencing its own sales order and invoice |

### 3.3 One ERP refuses or is down

These are the order-parts rules (design v1 §3.3), applied to return pieces:

- The other pieces go now.
- A piece whose ERP is **down** is retried. Then it is marked `failed`, stays open, and gets
  Re-send.
- A piece its ERP **refuses** (for example, outside the return window) is marked `refused` with
  the ERP's reason. It is also open and can be re-sent. A return comment names the ERP and the
  reason. The integration never denies lines in Commerce on its own. Staff decide what to tell
  the buyer.
- An ERP that credits **fewer** units than authorized (for example, one arrived damaged) gets a
  credit memo for what it credited. A comment names the difference.
- The return is never closed by the integration while a piece is open.

### 3.4 The combined status of a return

The rule has one writer, the integration, which writes only comments:

| Pieces | Comment the integration writes |
|---|---|
| All sent, none credited | "With ERP-A (R-1001) and ERP-B (RS-77)" |
| Some credited, some open | "ERP-A credited (CM-5); waiting on ERP-B (received)" |
| Any failed or refused | "Waiting on ERP-B: refused, <reason>. Re-send from the ERP parts page" |
| All credited or refused | "All ERPs done; ready to close" |

Commerce's own order status is **not** touched by returns. After credit memos Commerce moves
the order itself (a fully refunded order closes). The router's existing rule already leaves a
Closed order alone (`combined-status.js`, `FINISHED`).

## 4. Where each thing lives

| Thing | Chosen | Rejected alternative, and why |
|---|---|---|
| The buyer's request and its decision | Commerce's Returns (RMA) | A return raised in each ERP. The buyer would file one per brand and see several returns for one order |
| Which ERP owns a returned line | The order's parts record (`itemIds` per part), read only | The product's `erp_owner` today. The owner may have changed since the sale (acquisition, re-tagging), and the ERP that invoiced it must credit it |
| Return pieces and their outcomes | **A new record per return** in App Builder State: `order-returns-<return number>`, holding the order number, and per ERP the lines, status, ERP return number and credit memos (keyed by the ERP's credit memo number) | Adding a `returns` field to the order-parts record. That record is saved whole with no compare-and-set, and shipments, invoices and re-sends already write it. One more writer raises the chance of two writes losing each other, and the record keeps growing |
| Credited quantity per line | The return record: the sum of its credit memos | Reading Commerce's `qty_refunded` each time. That costs a call per message and cannot tell which ERP credited what |
| The adapter contract | Two **optional** functions: `sendReturn` (send a piece) and the existing `readOutcome` reading return messages too. An adapter without `sendReturn` leaves its pieces "manual" with a note to staff | Making `sendReturn` required. It would break every adapter at once, including `adapters/example/`, for a feature some ERPs are not wired to |
| The Commerce credit memo | One per ERP credit memo, offline, stock untouched | One credit memo for the whole return. It would wait for the slowest ERP and could not say which brand credited what |
| Stock | The ERP's own stock update after receipt, through the stock sync already built | "Return to Stock" in Commerce. It would put stock back in Commerce while the ERP, the master of quantity, may scrap the item |

## 5. What the demo needs

### 5.1 The mock ERP

Today, `demo-erp` models **no returns and no credit memos** [Code]. Its routes and contract
have no return or credit memo route. One oddity: `lib/orders.js` shows a billing status
"credited" when an invoice's status is `credited`, but no code ever sets that status. The
owner's rule: model only what a real ERP has out of the box. Everything below exists in both
Business Central and SAP (§2):

| Add | Standard feature it copies |
|---|---|
| A **return order** document: made from a Commerce return, referencing the ERP's own sales order and invoice lines, with a reason per line | BC Sales Return Order; SAP returns order (RE) |
| **Receive** action (post the goods receipt), full or partial | BC posting the receipt; SAP returns delivery |
| **Reject line** with a reason | SAP rejection reason on a line; BC removing the line before posting |
| **Post credit memo** for the received lines. It lowers the customer's open balance, and so the credit exposure | BC Sales Credit Memo; SAP credit memo |
| Stock goes back to the warehouse on receipt, sent out by the existing stock event | both |
| Two outbound events, named like the existing ones: a return status change and a credit memo created | the ERP's own outbound messages, as for invoices |
| A Returns list and document page on its screen | both |

Not added: return windows, restocking fees, replacement orders, exchanges. BC and SAP both have
them, but the demo does not need them.

### 5.2 What the SC sets up in Commerce

| Step | Where |
|---|---|
| Turn returns on for the storefront, and on product level | Stores > Configuration > Sales > Sales > RMA Settings ([Adobe] rma-configure, URL in §1) |
| The order to return must be **Complete** when staff enter the return in the Admin | [Adobe] returns page |
| Leave "Automatically Return Credit Memo Item to Stock" off (the ERP owns stock) | Product Stock Options ([Adobe] credit-memo-create) |
| Payment on Account on for the website (already a setup step) so refunds go back to company credit | existing setup guide |
| The integration's app reinstalled after the new event subscriptions (the existing rule for changing subscriptions) | `commerce-erp-integration/README.md` |

**Reversibility (a finding).** A return can be deleted over REST. A credit memo cannot: the
reference lists no delete. This is the same as orders and invoices already made in a demo, so a
demo reset cannot remove a credit memo from Commerce. The reset must say so. Undo stays
possible on the ERP side and for the integration's return records.

## 6. Live tests the design waits on

| Test | Question | Changes |
|---|---|---|
| R-T1 | Is there a Commerce event when a return is saved or its status changes? (`GET eventing/supportedList`, a read) | If none: staff press "Send to ERPs" on the return from the order view (no polling; a minute refresh was removed on 2026-09-27 for good reason) |
| R-T2 | Does `PUT /V1/returns/{id}` set item statuses (Received, Approved) from the API? | If yes, the integration can move the return's status. If no, comments only (the default above) |
| R-T3 | `POST /V1/order/{id}/refund` with `items[]` on an order paid on account: does it refund to company credit? Two credit memos on one order, one per ERP? | The refund path for B2B buyers |
| R-T4 | The credit memo event payload (design v1 test 8) | Staff-made credit memos reaching each ERP |
| R-T5 | Does the storefront used in the demo offer a return request screen? | If not, staff enter the return in the Admin during the demo |

## 7. Open questions

**For the client (to the tech case register):**

| Question | Recommendation |
|---|---|
| Who decides a return: the web team in Commerce, or each business unit in its ERP? | Commerce authorizes and each ERP credits (this design). It is the only way the buyer sees one return |
| Is there one return policy, or one per business unit (windows, restocking fees)? | Per ERP. The ERP applies its own policy by refusing or crediting less, and the design already carries that |
| Are refunds by credit memo against the original invoice, and back to the company's credit line? | Yes, per ERP. Ties to client #4 (invoicing per ERP) |
| Do EDI and offline orders get returned through the web too? | Web orders only, as with routing (client #2) |

**For the owner:**

| Question | Recommendation |
|---|---|
| Who refunds shipping and order-level adjustments, which no ERP owns? | No ERP credit memo includes shipping. Staff refund shipping by hand in Commerce, with a comment naming it. Revisit if the client assigns shipping to one ERP |
| Should the integration write return statuses, or only comments? | Comments only at first. Statuses only if R-T2 passes and staff ask for it |
| Should an ERP's refusal deny the lines in Commerce? | No. It shows as a refused piece. Staff deny in Commerce, because telling the buyer is a Commerce decision |
| Does the cancel-after-invoice hold (design v1 §3.3) reuse the credit-memo writer from R3? | Yes. It closes design v1 decision 4 with the same code: a cancelled part's invoiced lines become a credit memo from its ERP |

## 8. Slices

Sized like the B-slices. All come after B8.

| Slice | What | Done when |
|---|---|---|
| R0 | **Live tests** R-T1 to R-T5 on the scratch workspace, owner-authorised | each test has a recorded answer in design v1's live-test section |
| R1 | **The mock ERP's returns**: return order, receive, reject line, post credit memo, the two events, the screen | a return order can be received and credited on the ERP screen, and both events are journaled |
| R2 | **Split and send**: the return record; on authorization, split by the parts record and send each piece through `sendReturn`; unrouted lines recorded | an authorized two-ERP return in the harness becomes one piece per ERP, each sent once |
| R3 | **Credit memos back**: an ERP credit memo becomes a Commerce credit memo of only its lines, under the order lock, keyed by the ERP's number; return comments per step | a two-ERP return in the harness ends with two credit memos, and a redelivered message makes none |
| R4 | **Failure and staff surfaces**: `failed`/`refused` pieces, Re-send, the Returns section on the order view, the combined comments | one ERP down leaves the other credited, and Re-send completes the return |
| R5 | **Commerce-made credit memos** reach each ERP for its lines; cancel-after-invoice closes by credit memo | a staff credit memo in Commerce shows on each ERP for only its lines |
| R6 | **Live on Bodea** with two ERPs; vignette 9 and journey "Not shown" updated; the setup guide gains §5.2 | vignette 9's "Today" line reads built |

## Change log

- 2026-09-28: r0 draft. Returns REST found in the Cloud Service reference (corrects design v1
  §3.4's "no REST endpoint found"); the RMA event is not verified.
- 2026-09-28: r1 APPROVED by the owner: the integrated flow (ERP policy authorizes, the integration moves the return's status, carrier label on authorization, shipping refunded by rule, an ERP refusal denies its lines). Live tests R-T6, R-T7 added.
