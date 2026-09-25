# Order to cash: when a web order is billed and when payment is taken

Date: 2026-09-25. Asked by the owner while deciding D3: "if Commerce is configured to invoice and
capture, can the ERP move an order straight to invoice and capture?", then "research how ERP
systems handle order to cash before we decide what setting to include, and whether a business
user should adjust it in the integration UI."

**Method and trust.** One researcher (it ran three passes internally) read SAP, Microsoft, Adobe
and connector documentation. Labels are the researcher's: READ = read on the page, SNIPPET =
search results only, INFERRED = reasoning. help.sap.com mostly returned JavaScript shells, so SAP
claims rest on one direct-read pass corroborated by snippets. I re-checked one claim myself (the
Adobe invoicing sentence, below: confirmed verbatim). The Celigo page returned 403 to my fetch, so
the connector settings are the researcher's reading, not re-verified.

## What each system does

**SAP S/4HANA**
- Goods are billed after goods issue: "the outbound delivery is the basis for billing"
  (delivery-related billing). Order-related billing is for services, down payments, billing
  plans. READ, help.sap.com billing relevance.
- Set on the item category and copy control in Customizing: consultant configuration, never a
  choice made per order. READ.
- Cards: authorized when the sales order is saved; settled "when you release the billing document
  to Financial Accounting", i.e. at billing, after shipment. Authorizations expire (validity is
  configured) and are re-authorized if shipping runs late. READ.
- Customers on payment terms: no authorization or capture at all; billing posts an open item,
  cleared later by an incoming payment. INFERRED (all passes agree).

**Business Central**
- Posting a sales order ships, invoices, or both; by default the person posting chooses per
  document; an admin can force one pattern company-wide (Sales Invoice Posting Policy). READ,
  learn.microsoft.com.
- With the Shopify connector, Shopify captures the payment; Business Central never captures a
  card, it records payments already captured. "Create Invoices From Orders" and similar are shop
  settings on the connector. READ.

**Adobe Commerce**
- Payment action per payment method: Authorize (capture later, by creating an invoice) or
  Authorize and Capture (invoice created at checkout; the order can no longer be cancelled). A
  store-admin setting, no code. READ.
- "Normally, orders are invoiced and captured when the shipping process starts. If the method of
  payment is a purchase order, or if the payment action is set to Authorize and Capture, the order
  is invoiced and payment is captured during checkout." READ and re-verified,
  [Invoices](https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/order-management/invoices).
- Offline methods (payment on account, gift card, store credit) are never invoiced automatically;
  "capture" on their invoice is bookkeeping only. READ.
- Adobe's SAP B2B integration article does not address invoicing or capture at all (checked,
  researcher). No Adobe page recommends who should trigger the invoice.

**Connectors in practice** (researcher's reading; not re-verified)
- Celigo NetSuite ↔ Magento: the ERP's invoice creates and captures the Magento invoice; an admin
  setting chooses where card payments are captured: Magento at sale, Magento after fulfilment, or
  NetSuite after fulfilment.
- i95Dev (SAP Business One, Dynamics NAV): invoices synced from the ERP; a Yes/No "Capture
  Invoice" admin setting.

## What this means for us

1. **The standard sequence.** Card-paid web order: authorize at checkout, capture when the goods
   are billed, which is after shipment. On-account B2B order: no capture; the invoice records a
   debt. Nothing found captures payment at ERP confirmation. So "invoice and capture when the ERP
   confirms" is not a standard option, and is dropped.
2. **Our ERP already bills the standard way**: an invoice is allowed only once every line is
   shipped or closed. It stays. Its billing rule is consultant configuration in a real ERP, so it
   is not a setting on the ERP's screen.
3. **The integration today** creates the Commerce invoice with capture when the ERP invoices. That
   matches the standard for cards, and is bookkeeping only for on-account orders. Correct default.
4. **Capture at checkout** is Commerce's own payment-method setting, not the integration's. When a
   store uses it, Commerce has already invoiced the order, so the ERP's invoice must be recognised
   as already done (recorded as a comment), not fail. Not yet tested.
5. **A business-user setting has precedent** (Celigo, i95Dev): where the integration captures.
   Proposed as D1 row 5: "Capture payment in Commerce: when the ERP invoices (default) / when the
   ERP ships". The two differ only when an order ships in parts. Everything else is automatic:
   offline methods invoice without a real capture, checkout capture is Commerce's own setting.
6. **D3 follow-on.** With capture at checkout the order is already Processing when the ERP
   confirms, so "Confirmed in ERP" is needed under Processing as well as Pending (whether one
   status can sit under two states: unverified, check in Admin).

## What could not be established

- The payment fields SAP Commerce Cloud sends to S/4HANA.
- A universal SAP authorization validity (configurable; 14 days was only an example).
- Whether SAP Commerce Cloud captures at checkout or after fulfilment by default.
- Any Adobe statement recommending that the ERP trigger the invoice.
- Whether i95Dev's Business Central connector or Commerce 365 offer an invoice-timing setting.

## Decided (owner, 2026-09-25)

Point 5 is superseded: invoice capture is a mapping, not a setting. The ERP decides when it
bills; an ERP invoice creates the Commerce invoice with capture; shown read-only on the Mapping
tab's Order card. Recorded on AB-26w.
