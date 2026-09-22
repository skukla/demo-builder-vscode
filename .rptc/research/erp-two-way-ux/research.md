# Two-way Commerce ↔ ERP integration: what each person sees

2026-09-22 · External research (public vendor docs). Evidence labels: **read** = I read the page;
**snippet** = I saw only the search-result text (the page blocked or failed to load);
**marketing** = a vendor product or press page, not documentation; **inferred** = my conclusion.

## Summary

1. **Commerce admin:** the common pattern is a run log, a list of failed records with the reason,
   and retry of one record. Email alerts are common in middleware. Pause/resume per direction is rare.
2. **Pricing:** where prices come live from the ERP, the ERP stays the only place rules are edited.
   The commerce side gets switches: use ERP prices, cache them, and what to do when the ERP is down.
   I found no product that shows ERP price rules read-only in the commerce admin, or turns them on/off.
3. **Multi-ERP:** each connection gets its own settings card, tied to a store or sales area. One
   store talking to two different ERPs at once: not seen.
4. **ERP user:** sees the web order number and the buyer's PO number on the ERP order, plus an
   import list with an error flag.
5. **Buyer:** contract prices, available credit, order history/status, invoices, live stock.
6. **Where:** mostly in the ERP or a middleware console. Inside the commerce admin is less common.

## 1. What the commerce admin gets

- **Run history and per-record errors.** Celigo's dashboard shows flow run status, lets you view job
  errors, filter by status and date, and retry or resolve one record or all of them (snippet,
  [Celigo: resolve errors](https://docs.celigo.com/hc/en-us/articles/16182564553371-Retry-or-resolve-errors)).
  Boomi lets you re-run one failed document from Process Reporting: "To rerun one document, click the
  Actions icon and select Re-run Document" (read,
  [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Rerunning_documents_in_Process_Reporting_bc807a70-0433-4770-9f91-779e573fb816)).
- **Run-level logs only.** DCKAP Integrator's Logs screen shows records processed, succeeded, failed,
  duration and status. Its "Reprocess" re-runs the whole sync. The page does not mention single-record
  retry or alerts (read, [DCKAP logs](https://docs.dckapintegrator.com/project-manager/logs)).
- **Middleware without resend.** SAP Integration Suite message monitoring filters by status, time and
  artifact (snippet, [SAP](https://help.sap.com/docs/integration-suite/sap-integration-suite/message-monitoring)).
  A community answer says there is no built-in resend; teams build it with data stores or queues
  (snippet, practitioner, [SAP Community](https://community.sap.com/t5/technology-blog-posts-by-members/retry-failed-messages-in-cpi-with-automatic-and-manual-reprocessing/ba-p/13890655)).
- **Skipped records with reasons.** Business Central's Shopify connector has a "Shopify Skipped
  Records" page with the reason and time, a log with request/response per call, and an "Orders to
  Import" page with a **Has Error** field. It warns that job-queue runs "complete successfully even
  when records are skipped" (read,
  [Microsoft Learn: troubleshoot](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot)).
- **Manual resync.** Same product: reset the "last sync" date to pull everything again, or run
  "Sync order from Shopify" on one order card to force it (read,
  [troubleshoot](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot),
  [orders](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders)).
- **Matching / unmatched records.** Business Central smart-maps customers by phone and email, and
  B2B companies by tax or registration number (read,
  [overview](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview)).
  Skipped records include "a customer with the same email or phone number exists" (read, troubleshoot).
  Celigo documents location mapping (snippet,
  [Celigo](https://docs.celigo.com/hc/en-us/articles/360007449552-Map-NetSuite-locations-with-Shopify-locations)).
- **Alerts.** Celigo sends email per flow or for all flows, checks every 15 minutes, and also alerts
  when a connection goes offline or comes back (snippet,
  [Celigo notifications](https://docs.celigo.com/hc/en-us/articles/8961419557019-Get-error-notifications-via-email-You-only)).
  Celigo also supports assigning an error to a person (snippet,
  [Assign errors](https://docs.celigo.com/hc/en-us/articles/22663099178267-Assign-errors)).
- **Direction switches.** Business Central has an "Allow Data Sync to Shopify" toggle and a per-shop
  **Enabled** toggle (read, troubleshoot). Per-catalog "Sync Prices" toggle (read,
  [prices](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-prices)).
  A general "pause this direction" button: not seen.
- **Tracing one order end to end:** not seen as a named feature anywhere. The closest is Business
  Central's order card linking to the Shopify order, its fulfillments and the captured raw data (read,
  troubleshoot).
- **Adobe's own kit:** the Integration Starter Kit syncs products, customers, orders, stock and customer
  groups both ways. It has logging and OpenTelemetry, and no admin UI (read,
  [README](https://github.com/adobe/commerce-integration-starter-kit/blob/main/README.md)). Retry works
  through the event handler's HTTP status (read,
  [events](https://developer.adobe.com/commerce/extensibility/starter-kit/integration/events)).
  To put screens in the Commerce Admin, the Admin UI SDK offers a custom menu/page, order-view buttons,
  mass actions, and extra grid columns on orders, products, customers, invoices, shipments and
  credit memos (read,
  [Admin UI SDK v2](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/v2/)).

## 2. Pricing

- **The ERP owns the rules.** Sana: "Sana Commerce Cloud does not have any influence on how prices are
  calculated. The default ERP logic is used." Its admin only controls which prices are shown (read,
  [Sana price settings](https://support.sana-commerce.com/Content/Sana-User-Guide/Prices-Discounts/Price-Settings.htm)).
- **Commerce-side switches instead.** Sana offers: use ERP prices or cached local prices; show or hide
  prices per customer type; show cached prices in maintenance mode when the ERP is offline (read, same
  page). SAP Commerce: real-time price from the ERP, with a cache you can switch on ("Cache ERP Catalog
  Prices"); on a cache miss it calls the ERP (snippet, practitioner,
  [hybrismart](https://hybrismart.com/2025/02/23/customer-specific-pricing-and-availability-in-b2b-e-commerce/)).
  Its S/4HANA module lets the admin configure stock, credit and pricing checks at catalog and cart level
  in Backoffice (snippet,
  [SAP architecture](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/47ad58c1a27447949aad8addbee46fca/d39c858063fa47db9c08fc8793563421.html)).
  Salesforce B2B lets a developer replace the price service for listing pages and, separately, for cart
  and checkout (snippet,
  [PricingService](https://developer.salesforce.com/docs/commerce/salesforce-commerce/references/comm-apex-reference/PricingService.html)).
- **Copy-down, not live.** Business Central computes prices from its own price groups and discount
  groups, then pushes them to Shopify (read, prices page). i95Dev syncs tier prices from BC rules into
  Magento (marketing,
  [AppSource](https://appsource.microsoft.com/en/product/dynamics-365-business-central/PUBID.i95dev%7CAID.i95dev-standard-connector-for-business-central%7CPAPPID.2778a622-ecbe-41f8-945c-4438404be98c?tab=Overview)).
  The pricing settings for these live in the ERP, not the store.
- **Read-only rule view in the commerce admin (dates, customers, active/inactive):** not seen.
  **Turning an ERP rule on/off from the commerce side:** not seen.

## 3. More than one ERP or connection

- **One ERP, many stores** is well documented. Business Central supports several shops, "each shop has
  its own setup", on a Shop Card (read, overview). Celigo adds stores per license, with per-store
  settings and a store drop-down; you can clone an existing store's setup (snippet,
  [Celigo](https://docs.celigo.com/hc/en-us/articles/228367788-Install-an-additional-Shopify-store-with-the-same-NetSuite-account)).
- **Store ↔ ERP organisation unit.** SAP Commerce maps each catalog to an S/4 sales organisation and
  distribution channel, under SAP Integration in Backoffice (snippet,
  [SAP Learning](https://learning.sap.com/courses/commerce-and-s-4hana-integration-foundations/configuring-sap-commerce-cloud-for-the-initial-integration_b2631323-257c-4625-a47d-faec8a3d3d51)).
- **One store, two different ERPs:** not seen. i95Dev claims support for "multiple … Business Central
  ERP systems" (marketing, [i95Dev](https://www.i95dev.com/dynamics-erp-integration/magento-microsoft-dynamics-365-business-central-connect/)).

## 4. What the ERP user gets

- The ERP order carries the web order number. Business Central: a **Shopify Order No.** field on sales
  orders, invoices and shipments; the buyer's PO number goes into **External Document No.** (read,
  [orders](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders)).
- An inbound list with an error flag and message (**Shopify Orders to Import**, **Has Error**), and a
  **Channel** filter to treat POS and web orders differently (read, same page).
- A conflict message when the web order changes after the ERP processed it (read, same page).
- Commerce 365 keeps its sync queue inside Business Central (read,
  [NVision](https://help.n.vision/support/solutions/articles/80000957163-integration)).
- NetSuite's own connector maps Shopify B2B terms and PO number onto the NetSuite order (read,
  [Oracle](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0217123750.html)).

## 5. What the B2B buyer sees

- **Contract prices, live.** Sana reads prices from the ERP in real time (read, price settings).
  SAP: real-time price, stock, credit limit and order history from S/4HANA (snippet, SAP architecture).
- **Credit.** Adobe Commerce B2B shows the company admin outstanding balance, available credit and
  credit limit (read,
  [Experience League](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/credit-company)).
  SAP can block add-to-cart and order when the S/4 credit check fails (snippet, practitioner,
  [SAP Community](https://community.sap.com/t5/customer-relationship-management-blogs-by-members/integration-of-commerce-cloud-with-sap-s-4hana/ba-p/13478155)).
- **Blocked company.** In Adobe Commerce a blocked company's users can sign in and browse but cannot
  order (snippet,
  [Experience League](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/account-company-manage)).
- **Invoices.** Business Central exports posted invoices so buyers see all invoices in Shopify (read,
  overview). BigCommerce's invoice portal lets buyers pay invoices from online and offline orders
  (marketing, [press release](https://www.bigcommerce.com/press/releases/bigcommerce-revolutionizes-the-b2b-purchasing-experience-with-launch-of-b2b-edition-invoice-portal/)).

## 6. Where the screens live

- **Inside the ERP:** Business Central Shopify connector, Commerce 365 (read, above).
- **Separate console:** Celigo, Boomi, DCKAP, SAP Integration Suite; NetSuite's connector runs at its
  own connector site (read, Oracle page).
- **Inside the commerce admin:** SAP Commerce Backoffice holds the ERP switches (snippet). Sana Admin
  holds price display and ERP-offline behaviour (read). Adobe gives the means (Admin UI SDK) but no
  ready-made screen (read).

## Capability table

| Capability | How common | Examples |
|---|---|---|
| Run history / log | Common | [DCKAP](https://docs.dckapintegrator.com/project-manager/logs), [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot), [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Rerunning_documents_in_Process_Reporting_bc807a70-0433-4770-9f91-779e573fb816) |
| Failed-record list with reason | Common | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot), [Celigo](https://docs.celigo.com/hc/en-us/articles/16182564553371-Retry-or-resolve-errors) |
| Retry one record | Some | [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Rerunning_documents_in_Process_Reporting_bc807a70-0433-4770-9f91-779e573fb816), [Celigo](https://docs.celigo.com/hc/en-us/articles/16182564553371-Retry-or-resolve-errors), [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders) |
| Email alerts | Some | [Celigo](https://docs.celigo.com/hc/en-us/articles/8961419557019-Get-error-notifications-via-email-You-only) |
| Customer/company matching | Some | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview) |
| End-to-end trace of one order | Not seen (as a feature) | — |
| Pause per direction/entity | Rare | [BC toggles](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot) |
| ERP price rules read-only in commerce admin | Not seen | — |
| Toggle ERP price rule from commerce | Not seen | — |
| "Use ERP prices" / cache / offline fallback | Some | [Sana](https://support.sana-commerce.com/Content/Sana-User-Guide/Prices-Discounts/Price-Settings.htm), [hybrismart](https://hybrismart.com/2025/02/23/customer-specific-pricing-and-availability-in-b2b-e-commerce/) |
| Per-connection settings card | Common | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview), [Celigo](https://docs.celigo.com/hc/en-us/articles/228367788-Install-an-additional-Shopify-store-with-the-same-NetSuite-account) |
| One store, two ERPs | Not seen | — |
| Web order no. on ERP order | Common | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders), [NetSuite](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0217123750.html) |
| Buyer sees credit / invoices | Common | [Adobe](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/credit-company), [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview) |

## Implications for our demo (recommendation, not evidence)

1. **Commerce Admin:** one "ERP sync" page (Admin UI SDK menu page) with a per-record log: what, which
   direction, when, result, reason. A **Retry** button on a failed row. This matches the common pattern.
2. **Order view:** an order-view button or grid column showing the ERP order number and last sync
   result. An "order journey" timeline would go beyond what I found — a chance to stand out, not a
   copy of the norm.
3. **Pricing:** no rule editing in Commerce, consistent with what we decided and with Sana/SAP. Give
   Commerce only switches: "ask the ERP for prices on this website" and "if the ERP does not answer:
   hide price / show last known price / block checkout". A read-only view of ERP rules would be new;
   decide whether it is worth building.
4. **Multi-ERP:** one card per connection, assigned to websites. That is the common shape.
5. **ERP screen:** web order number, buyer PO number, channel "Web", and an inbound list with an error
   flag.
6. **Storefront:** contract price, available credit, a blocked-company notice, order status with the
   ERP order number, invoices.

## What I could not establish

- Celigo pages returned 403; its claims above come from search snippets only.
- SAP Help Portal pages would not render; SAP claims are snippets or practitioner blogs. I could not
  confirm what SAP Commerce does when S/4HANA is unreachable during synchronous pricing.
- i95Dev's user manual PDF failed (expired certificate). I could not see its admin screens.
- Whether any product offers a single-order end-to-end trace view.
- Whether any product connects one storefront to two different ERPs at once.
- What the SAP S/4HANA user sees on a web-created order (origin field, sync status). Not found.
- MuleSoft and Salesforce B2B monitoring screens: not researched in depth.
