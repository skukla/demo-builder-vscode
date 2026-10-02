# Card payments: how a real ERP handles a web order paid by card (AB-26s, card half)

Researched 2026-10-02 for the owner's question: "Do ERPs like SAP integrate with payment
gateways like CyberSource?" Read from vendor pages; each claim names its source. Pages that
would not load are listed as such, not inferred.

## Short answer

Yes. SAP S/4HANA reaches payment providers through the SAP Digital Payments add-on, and
Cybersource is a named provider for it. Business Central has no Cybersource feature out of the
box; its documented web-shop pattern (the Shopify connector) has the shop take the money and
Business Central record a payment against the posted invoice. In every case the ERP holds a
REFERENCE to the payment, never the card number.

## SAP S/4HANA

- The Digital Payments add-on "enables you to connect SAP and non-SAP consumer applications
  with non-SAP payment service providers"; its diagram shows S/4HANA connecting through it to
  Cybersource (Cybersource guide, pp. 7–8:
  https://developer.cybersource.com/content/dam/new-documentation/documentation/en/partner-solutions/developer/all/rest/sap-dpa-integration-rest.pdf).
  Cybersource calls itself "the only payment provider to be integrated into three SAP
  offerings" (https://www.cybersource.com/en-us/why-cybersource/partners/partner-marketplace/business-operations/sap.html;
  the vendor about itself).
- Operations (same guide, pp. 11–12): authorize; cancel an authorization; charge ("settles the
  authorization"); direct capture; reauthorize ("Refreshes a payment card payment authorization
  that was generated previously but has expired"); refund; and "Preparation", which
  "Prepares externally created payment card authorizations for further use".
- Card data "is tokenized" and kept "off your network" (Cybersource data sheet:
  https://www.cybersource.com/content/dam/documents/en/cybs-for-sap-digital-payments-addon-datasheet.pdf).
- Settlement: "When the settlement run is done, the status of the settled credit card payments
  changes to In Transfer"; "direct capture" is one step, "charge with authorization" two
  (https://learning.sap.com/courses/configuring-additional-settings-in-financial-accounting-in-sap-s-4hana/explaining-digital-payments).
- Authorization taken in the web shop: the guide shows a store authorizing (and possibly
  capturing) directly with Cybersource, then the add-on's Preparation step; the finance system
  then charges, refunds or cancels (p. 7). Both "the shop captures" and "the ERP charges at
  billing" are documented; it is a design choice.

## Business Central

- Built-in payment services: PayPal Payments Standard and WorldPay Payments Standard (WorldPay
  marked obsolete from 2023 release wave 2), adding a pay link to emailed invoices; no
  Cybersource (https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-enable-payment-service-extensions).
- Web orders paid in the shop (Shopify connector,
  https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/transactions-and-payouts):
  a payment-method mapping keyed on gateway and card company sets the sales document's payment
  method; posting the invoice creates a payment applied to it (balancing account), or the shop's
  transactions are suggested into a cash receipt journal and applied. Only Capture, Sale and
  Refund transactions count: "Authorization and Void are always excluded."
- Prepayment invoices exist for deposits before shipping
  (https://learn.microsoft.com/en-us/dynamics365/business-central/finance-set-up-prepayments),
  not presented as the web-card pattern.

## Adobe Commerce

- Payment action "Authorize": capture by creating an invoice; "Authorize and Capture": captured
  at checkout and invoiced automatically
  (https://experienceleague.adobe.com/en/docs/commerce-admin/config/sales/payment-methods/payment-methods).
- Invoice: Capture Online (from the gateway), Capture Offline (already captured at the
  gateway), Not Capture (later)
  (https://experienceleague.adobe.com/en/docs/commerce-admin/customers/customer-accounts/store-credit/refunds-customer-account).
- A custom payment method on the Cloud Service invoices the order when the gateway's
  authorization webhook arrives; gateway data goes into the payment's `additional_information`
  (https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/payment-use-cases).
- Cybersource lists an Adobe Commerce Marketplace extension
  (https://developer.cybersource.com/technology-partners/adobe-commerce.html).
- Payment Services (the Cloud Service default, powered by PayPal) keeps card data off the
  merchant's servers: an Experience League "perspectives" article, not reference docs.

## What it means for the demo

1. The order sent to the ERP carries a payment REFERENCE: method, gateway transaction or
   authorization id, amount, card brand, last four digits. Never a card number (PCI).
2. Simplest and documented (Business Central style): Commerce captures (its own invoice, or
   Authorize and Capture at checkout); the ERP posts its invoice and applies a payment carrying
   the gateway reference, so the invoice closes with no open item. Only captured or sale
   transactions count.
3. Richer, optional (SAP style): the order carries an external authorization; the ERP charges
   it at billing and offers Reauthorize when it has expired. Only if the demo needs the ERP to
   own capture.
4. Not prepayment invoices for card orders.

## Could not establish

- S/4HANA's exact sales-order card fields, the settlement transaction (FCC1 or its Fiori app)
  and its behaviour on an expired authorization: help.sap.com pages rendered blank.
- The full list of providers SAP supports for the add-on; any Cybersource connector for
  Business Central (AppSource answered 403); the Marketplace listing's details.
