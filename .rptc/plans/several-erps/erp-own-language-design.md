# The ERP speaks its own language (AB-26y step 6, AB-60's ERP half)

Written 2026-10-02 from the owner's decisions that day and the research in
`.rptc/research/erp-event-formats/research.md`.

## What is wrong today

The mock ERP raises Commerce's own event names (`be-observer.sales_order_shipment_create`, …,
demo-erp `lib/events.js` EVENT_NAMES) with Commerce's ids in the payload (`orderId`,
`incrementId`, `items[].orderItemId`, `commerceReturnId`; `orderEventPayload` in
`lib/orders.js`). The integration's ingestion webhook passes them straight through
(`actions/ingestion/webhook/index.js`: `publishEvent(params.data.event, params.data.value)`).
So the ERP knows Commerce, and the integration translates nothing. Product edits of any kind
raise `product.price` (AB-60).

## Decisions

1. **Data events in the ERP's own words** (owner, 2026-10-02: "Product changed with the full
   record"). The research found that modern SAP and Business Central events mostly carry only
   a key and leave the receiver to read the rest back; IDoc-style data events are the other
   real shape. We keep the data-event shape, which needs no read-back round trip. Moving to
   notices later changes only the integration's translation module.
2. **Envelope: CloudEvents 1.0** (`specversion, id, source, type, time, datacontenttype,
   data`), as SAP uses. `source` is `/erp/<erp id>`, so several ERPs tell themselves apart.
3. **Names are object + action**, without SAP's namespace (the mock is not SAP):

| ERP change today | New `type` | `data` (ERP words) |
|---|---|---|
| order.confirmed / order.hold (both ways) / order.canceled | `SalesOrder.Changed` | the sales order: `SalesOrder`, `PurchaseOrderByCustomer`, `SoldToParty`, `OverallStatus` + `PrevOverallStatus`, `CreditBlock` + `PrevCreditBlock`, `Reason`, `Items[{ SalesOrderItem, Material, Quantity, CustomerLineReference }]` |
| order.shipped | `OutboundDelivery.GoodsIssueStatusChanged` | `OutboundDelivery`, `SalesOrder`, `PurchaseOrderByCustomer`, goods-movement status + previous, `Carrier`, `TrackingNumber`, `Items[...]` |
| order.invoiced | `BillingDocument.Created`, `BillingDocumentType: "Invoice"` | billing document, sales order, reference, amounts, items |
| creditmemo.created | `BillingDocument.Created`, `BillingDocumentType: "CreditMemo"` | as above, plus `ReferenceBillingDocument` and `CustomerReturn` when it credits one |
| return.received | `CustomerReturn.Changed` | `CustomerReturn`, `SalesOrder`, the shop's return reference, status + previous, items |
| payment.posted | `IncomingPayment.Posted` | `Payment`, `BillingDocument`, `Customer`, `Amount`, `Currency`, `PaymentReference` |
| product.price (any product edit) | `Product.Changed` | the whole product record, plus `ChangedFields: ["ProductName", …]` |
| product.stock | `ProductStock.Changed` | `Product`, `Plant`, `Quantity`, `PrevQuantity` |
| partner.blocked / partner.creditLimit | `Customer.Changed` | the customer record (credit limit, blocking level), plus `ChangedFields` |
| contract.changed | `PriceList.Changed` | `Customer`, the lines in force |

The exact field names are the builder's to settle against the ERP's own record names; the rule
is that no Commerce name or id appears.

4. **Where Commerce's ids go.** A real ERP keeps the web shop's references on its own
   documents: SAP's `PurchaseOrderByCustomer` (the customer's order number) on the header and
   the customer's item number on each line. So the ERP stores what the integration sends it as
   **references** (`PurchaseOrderByCustomer` = Commerce order number; `CustomerLineReference`
   = Commerce order item id; a return's shop reference), not as Commerce fields. The contract
   renames them; contract version 16 (15 is the Settings form, AB-59).
5. **The integration translates in ONE module** (`src/ingestion/translate.js` or similar,
   AB-26y's "what the words mean: code, one named translation module"). The ingestion webhook
   validates the CloudEvent, translates it to the starter-kit event and payload the
   `order-backoffice/*` handlers already take, and publishes that. The handlers do not change,
   so the order-to-return flow proven live on 2026-10-02 keeps its tested code. Translation
   uses the integration's own records: the key map (customer number → company), the order's
   parts record (order number → order, line reference → item), the order-returns record
   (shop return reference → return). Blocking levels fold to the Commerce company status here
   (AB-26y's "folds the blocking levels"). An unknown `type` answers 400 and is journaled.
6. **The ERP's journal uses the same words**: "Sales order changed", "Goods issue posted",
   "Billing document created (credit memo)", and for a product the fields that changed
   ("Product changed: name, list price"), which fixes AB-60's mislabelled price change.
7. **Echo suppression stays** where it is (`emitUnlessFromCommerce`, demo-erp
   `lib/fulfilment.js`); moving it into the integration is AB-26y step 5's last item.

## Coverage check (2026-10-02)

**Outbound: all covered.** The ERP has 13 event kinds (`lib/events.js` EVENT_NAMES) raised from
15 places in `lib/`; every kind is a row in the table above.

**Inbound: NOT covered by the first draft, now in scope.** Commerce still shows through the
ERP's import side, in these places (counted in `lib/` and `actions/`, 2026-10-02):

| Where | Commerce word in the ERP | Becomes |
|---|---|---|
| sales orders and lines | `commerceOrderId` (23), `commerceIncrementId` (23), `commerceItemId` (24) | `PurchaseOrderByCustomer` and `CustomerLineReference`; the Commerce entity id is not kept (the integration has it) |
| returns | `commerceReturnId` (17), `commerceReturnIncrementId` (9) | the return's shop reference |
| a shipment made in Commerce (`lib/fulfilment.js` ~292) | `commerceShipmentId` (16), "Shipment … received from Commerce" | an external delivery reference; "posted from the web shop" in ERP words |
| an invoice made in Commerce (~394) | `commerceInvoiceId` (10), "received from Commerce" | an external billing reference |
| warehouses (`lib/structure.js`, `lib/orders.js`, `lib/fulfilment.js` ~494) | `commerceName` (8) | the plant's own name only; the source's name stays in the integration |
| the import log (`lib/inbound.js`) | `origin.event` holds a Commerce event name | `origin` names the sending system and its document, not its event vocabulary |
| `lib/partners.js` COMMERCE_FIELDS | the guard that strips old Commerce fields | stays: it is what keeps them out |

The integration's sends (order placement, shipment and invoice echoes, returns) switch to those
names in the same change. A grep for `commerce` in demo-erp `lib/` and `actions/` (excluding the
generated screen bundle and the guard) is the done-check: zero.

## Demo Builder pre-fills the mapping

Verified 2026-10-02 by reading the code: the per-ERP mapping (sales organization and its
name per website, order prefix, which products it owns) lives on that ERP's entry in the
integration's ERP list (`lib/erp-settings.js`, edited through `erp/erps`), and the
integration-wide settings go through `erp/settings` PATCH (`{ scope, values }`). Both are
web actions Demo Builder can call with the credential it already uses for `erp/settings` GET
and `erp/keymap`. So "can it be written from outside the app" is yes, through the app's own
actions, without touching App Management storage directly.

The ERP now owns its sales organizations, each naming the website it serves (AB-59's
Sales organizations table). After every fill (add, Reset ERPs, Load demo data), Demo Builder
reads them and writes each ERP's `settings.websites[<code>]` (sales organization and name)
**only where the mapping is still unset**, and reports what it left alone. A value someone set
on the Admin page is never overwritten (the same rule as owner principle 2 for files).

## Order of work

1. demo-erp: events, journal words, contract v16 (stores references; `Product.Changed`).
   Waits for the AB-59 Settings agent to land contract v15 in the same files.
2. commerce-erp-integration: vendored contract v16, the translation module, the ingestion
   webhook; the order placement send renamed to the references; box journeys pass unchanged
   end to end.
3. Demo Builder: the mapping pre-fill after each fill.
4. Deploy demo-erp, demo-erp-2 and the integration on Justrite; rerun the order-to-return
   rehearsal (`rehearse-order-to-return.sh`) and a product name change. All three repos must
   ship together: a v16 ERP talking to a v15 integration breaks every event.
