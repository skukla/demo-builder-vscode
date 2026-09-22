# Two-way Commerce ↔ ERP integration: what each person sees

2026-09-22 · External research (public vendor docs). Second pass 2026-09-22 (browser, Perplexity,
Experience League). Evidence labels: **read** = I read the page; **snippet** = I saw only the
search-result text (the page blocked or failed to load); **marketing** = a vendor product or press
page, not documentation; **inferred** = my conclusion. **practitioner** = a named-author article,
not product documentation.

## Summary

1. **Commerce admin:** the common pattern is a run log, a list of failed records with the reason,
   and retry of selected records. Adobe already ships this exact shape in its own admin (Data Feed
   Sync Status: per-record status, error column, "Schedule Resync" mass action). Email alerts are
   common in middleware. Pause/resume per direction is rare.
2. **Pricing:** where prices come live from the ERP, the ERP stays the only place rules are edited.
   The commerce side gets switches: use ERP prices, cache them, and what to do when the ERP is down.
   SAP documents the cache switch but, in the pages I read, **no fallback** when S/4HANA is down.
   Adobe's own SAP article says a fallback is mandatory and must be built. No product shows ERP
   price rules read-only in the commerce admin, or turns them on/off.
3. **Multi-ERP:** each connection gets its own settings card, tied to a store or sales area.
   **Overturned:** one store CAN feed several back ends at once — SAP Commerce with Order Management
   Services splits one order into sub-orders across several SAP systems. Orders only; live pricing
   then only works with a single back end.
4. **ERP user:** sees the web order number (SAP: the same number; Business Central: its own field)
   and the buyer's PO number, plus an import list with an error flag.
5. **Buyer:** contract prices, available credit, order history/status, invoices, live stock. When
   SAP splits an order, the buyer still sees one order.
6. **One-order trace:** middleware lets you search by order number (MuleSoft, Boomi, SAP
   Integration Suite). A timeline of one order inside the commerce admin: still not seen.
7. **Where:** mostly in the ERP or a middleware console. Inside the commerce admin: i95Dev,
   Salesforce, and Adobe's own sync pages.

## 1. What the commerce admin gets

- **Run history and per-record errors.** Celigo's dashboard shows flow run status, lets you view job
  errors, filter by status and date, and retry or resolve one record or all of them (snippet — page
  shows a bot challenge,
  [Celigo: resolve errors](https://docs.celigo.com/hc/en-us/articles/16182564553371-Retry-or-resolve-errors)).
  Boomi lets you re-run one failed document from Process Reporting: "To rerun one document, click the
  Actions icon and select Re-run Document" (read,
  [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Rerunning_documents_in_Process_Reporting_bc807a70-0433-4770-9f91-779e573fb816)).
- **Adobe's own sync-status page.** Commerce Admin → System → Data Transfer → Data Feed Sync Status
  lists each feed with source, sent and failed counts. Its detail grid shows per record: status
  (Submitted / Failed, will retry / Failed, requires attention / Awaiting submission), last sync
  date, request ID and error. You select failed rows and choose "Schedule Resync". It covers Commerce
  → Adobe services, not ERPs (read,
  [Experience League](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/data-transfer/data-sync/data-feed-sync-status)).
  Adobe I/O Events has a smaller cousin: System → Events → Events Status, with Waiting / Success /
  Failure per event (read,
  [events troubleshooting](https://developer.adobe.com/commerce/extensibility/events/troubleshooting/)).
- **i95Dev inside the Magento admin.** A Message Queue Report (Reports menu) filters by entity and
  status: Pending, Success, Error, Complete. The connector retries errors a set number of times; after
  that the admin selects rows and picks **Sync**, or deletes them. It adds grid columns: **Origin**
  (which system created the record) and the ERP customer ID on customers and orders, and an ERP sync
  status on products (read, NAV-variant manual hosted on Adobe Marketplace,
  [user guide PDF](https://commercemarketplace.adobe.com/media/catalog/product/i95devconnect-navbases-100-0-4-ce/user_guides.pdf)).
- **Run-level logs only.** DCKAP Integrator's Logs screen shows records processed, succeeded, failed,
  duration and status. Its "Reprocess" re-runs the whole sync. The page does not mention single-record
  retry or alerts (read, [DCKAP logs](https://docs.dckapintegrator.com/project-manager/logs)).
- **Middleware without resend.** SAP Integration Suite's message monitor filters by time, status
  (including Failed, Retry, Escalated), artifact and IDs, and shows sender, receiver, correlation ID
  and application message ID. Automatic retry runs appear in the message's log. The page does not
  mention a manual resend button (read,
  [SAP](https://help.sap.com/docs/integration-suite/isuite-integrations-and-apis/monitor-message-processing)).
  A community answer says teams build resend with data stores or queues (snippet, practitioner,
  [SAP Community](https://community.sap.com/t5/technology-blog-posts-by-members/retry-failed-messages-in-cpi-with-automatic-and-manual-reprocessing/ba-p/13890655)).
- **Replay from the UI.** MuleSoft Partner Manager: Activity → Transmissions; replay failed or
  delivered transmissions, up to 100 at once, linked to the original record (read,
  [MuleSoft](https://docs.mulesoft.com/partner-manager/latest/replay-transmissions)). Salesforce B2B:
  a failed order shows a Process Exception on the order's Related tab; setting it to Resolved
  resubmits the order. This is Salesforce's own order placement, not an ERP sync (read,
  [Salesforce](https://help.salesforce.com/s/articleView?id=commerce.comm_async_admin_retriggers_place_order.htm&language=en_US&type=5)).
- **Skipped records with reasons.** Business Central's Shopify connector has a "Shopify Skipped
  Records" page with the reason and time, a log with request/response per call, and an "Orders to
  Import" page with a **Has Error** field. It warns that job-queue runs "complete successfully even
  when records are skipped" (read,
  [Microsoft Learn: troubleshoot](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot)).
- **Manual resync.** Same product: reset the "last sync" date to pull everything again, or run
  "Sync order from Shopify" on one order card (read,
  [troubleshoot](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot),
  [orders](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders)).
- **Matching / unmatched records.** Business Central smart-maps customers by phone and email, and
  B2B companies by tax or registration number (read,
  [overview](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview)).
  Celigo documents location mapping (snippet, bot challenge,
  [Celigo](https://docs.celigo.com/hc/en-us/articles/360007449552-Map-NetSuite-locations-with-Shopify-locations)).
- **Alerts.** Celigo sends email per flow or for all flows and alerts when a connection goes offline
  (snippet, bot challenge,
  [Celigo notifications](https://docs.celigo.com/hc/en-us/articles/8961419557019-Get-error-notifications-via-email-You-only)).
  Celigo also supports assigning an error to a person (snippet, bot challenge,
  [Assign errors](https://docs.celigo.com/hc/en-us/articles/22663099178267-Assign-errors)).
- **Direction switches.** Business Central has an "Allow Data Sync to Shopify" toggle, a per-shop
  **Enabled** toggle (read, troubleshoot) and a per-catalog "Sync Prices" toggle (read,
  [prices](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-prices)).
  A general "pause this direction" button: not seen.
- **Tracing one order.** Middleware lets you tag and search by order number: MuleSoft's Set
  Transaction Id shows e.g. an order number when analysing tracked events (read,
  [MuleSoft](https://docs.mulesoft.com/mule-runtime/latest/set-transaction-id)); Boomi tracked fields
  filter document history by a business value (read,
  [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Document_Tracking_bf2f68f0-a8b1-4efc-8726-424341acaccc));
  SAP Integration Suite has correlation IDs (read, above). These are searches in an integration
  console, not a timeline on the order. Closest in a business app: Business Central's order card
  linking to the Shopify order and its raw data (read, troubleshoot).
- **Adobe's integration kit:** the Integration Starter Kit syncs products, customers, orders, stock
  and customer groups both ways, with logging and OpenTelemetry and no admin UI (read,
  [README](https://github.com/adobe/commerce-integration-starter-kit/blob/main/README.md)). Retry
  works through the event handler's HTTP status (read,
  [events](https://developer.adobe.com/commerce/extensibility/starter-kit/integration/events)). The
  Admin UI SDK offers a custom menu/page, order-view buttons, mass actions, and extra grid columns
  on orders, products, customers, invoices, shipments and credit memos (read,
  [Admin UI SDK v2](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/v2/)).

## 2. Pricing

- **The ERP owns the rules.** Sana: "Sana Commerce Cloud does not have any influence on how prices are
  calculated. The default ERP logic is used." Its admin only controls which prices are shown (read,
  [Sana price settings](https://support.sana-commerce.com/Content/Sana-User-Guide/Prices-Discounts/Price-Settings.htm)).
- **Commerce-side switches instead.** Sana: use ERP prices or cached local prices; show or hide
  prices per customer type; show cached prices in maintenance mode when the ERP is offline (read,
  same page). SAP Commerce: Backoffice → SAP Integration → Base Store Configuration has on/off options
  for availability check, credit check and synchronous pricing for catalog and cart, plus a cache
  switch; with it off, every price comes straight from S/4HANA (read,
  [SAP Backoffice config](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/47ad58c1a27447949aad8addbee46fca/8db8712423fe4040bc07a74dca3d21c1.html)).
  When ERP prices change, an admin must clear the price cache and reindex (read,
  [SAP price display](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/80c3212d1d4646c5b91db43b84e9db47/62a707545d6b479fa738db35c88c082b.html)).
  Salesforce B2B lets a developer replace the price service for listing pages and, separately, for
  cart and checkout (snippet,
  [PricingService](https://developer.salesforce.com/docs/commerce/salesforce-commerce/references/comm-apex-reference/PricingService.html)).
- **When S/4HANA is unreachable.** SAP's synchronous pricing, architecture, Backoffice and services
  pages (read, [sync pricing](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/47ad58c1a27447949aad8addbee46fca/25ed7c0fd8904a38b3bb2001d0de96e1.html),
  [services](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/47ad58c1a27447949aad8addbee46fca/f9abb1f960014193a71fe47fc31d93e9.html))
  **do not mention** a fallback, an error shown to the shopper, or blocked checkout. Stock uses the
  cache first and calls S/4HANA on a miss (read, services page). A Perplexity search also found no SAP
  page describing a fallback. Adobe's Experience League article on SAP integration says: "if SAP is
  unavailable, the storefront cannot show prices. A fallback strategy … is mandatory in production",
  naming cached last-known prices or a degraded mode, and says Commerce has no native UI for SAP
  price simulation (read, practitioner,
  [Experience League](https://experienceleague.adobe.com/en/perspectives/how-to-integrate-adobe-commerce-with-sap-erp-for-b2b-commerce)).
- **Copy-down, not live.** Business Central computes prices from its own price and discount groups,
  then pushes them to Shopify (read, prices page). i95Dev syncs inventory and tier prices one way,
  ERP → Magento (read, i95Dev manual).
- **Read-only rule view in the commerce admin (dates, customers, active/inactive):** not seen.
  **Turning an ERP rule on/off from the commerce side:** not seen.

## 3. More than one ERP or connection

- **One ERP, many stores** is well documented. Business Central: several shops, "each shop has its
  own setup", on a Shop Card (read, overview). Celigo adds stores per license with a store drop-down
  and cloning (snippet, bot challenge,
  [Celigo](https://docs.celigo.com/hc/en-us/articles/228367788-Install-an-additional-Shopify-store-with-the-same-NetSuite-account)).
- **Store ↔ ERP organisation unit.** SAP maps a base store to order type, sales organisation,
  distribution channel and division (read, SAP Backoffice config).
- **One store, several back ends — found (overturns the first pass).** SAP Commerce with Order
  Management Services can use "a mix of SAP S/4HANA and SAP ERP systems", several clients, or several
  sales areas, chosen per base store. It splits each order by sourcing location and sends a sub-order
  to each back end, for businesses managing "different product lines from a single online store".
  Limits: asynchronous orders only; synchronous pricing and stock checks work only with a single back
  end (read, [multiple back ends](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/731ca9661fa647c489ddbd9c8477aa02.html),
  [options](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/5542577fe23f439b8e60d904fa2e1fb0.html)).
  Both back ends are SAP products. Two ERPs from different vendors behind one store: still not seen.
  i95Dev claims support for "multiple … Business Central ERP systems" (marketing,
  [i95Dev](https://www.i95dev.com/dynamics-erp-integration/magento-microsoft-dynamics-365-business-central-connect/));
  its manual does not show a multi-instance screen (read).

## 4. What the ERP user gets

- **SAP:** the S/4HANA sales order gets the same number as the Commerce order; number ranges must
  not overlap (read,
  [SAP](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/8baead5686691014bb358f2dcf8c0d83.html)).
  With several back ends, each gets a sub-order with an incremented number (123 → 124, 125), and
  orders can then be cancelled only in Commerce (read, options page). An Adobe practitioner article
  says the Commerce PO number is stored as the SAP purchase-order reference (read, practitioner,
  Experience League above). An "origin/channel = web" field on the S/4HANA order: the pages I read
  do not mention one (inferred: it comes from the order type and sales area the base store sets).
- **Business Central:** a **Shopify Order No.** field on sales orders, invoices and shipments; the
  buyer's PO number goes into **External Document No.** (read,
  [orders](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders)).
  An inbound list with **Has Error**, a **Channel** filter, and a conflict message when the web order
  changes after the ERP processed it (read, same page).
- Commerce 365 keeps its sync queue inside Business Central (read,
  [NVision](https://help.n.vision/support/solutions/articles/80000957163-integration)).
- NetSuite's connector maps Shopify B2B terms and PO number onto the NetSuite order (read,
  [Oracle](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0217123750.html)).

## 5. What the B2B buyer sees

- **Contract prices, live.** Sana reads prices from the ERP in real time (read, price settings).
  SAP: live price in product page, cart and checkout; shipping and payment costs from S/4HANA;
  vouchers and promotions not supported with synchronous pricing (read, SAP sync pricing).
- **One order, even when split.** With several SAP back ends, "Customers will not know that their
  order has been split" — order history shows one order (read, SAP multiple back ends).
- **Credit.** Adobe Commerce B2B shows the company admin outstanding balance, available credit and
  credit limit (read,
  [Experience League](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/credit-company)).
  SAP can block add-to-cart and order when the S/4 credit check fails (snippet, practitioner,
  [SAP Community](https://community.sap.com/t5/customer-relationship-management-blogs-by-members/integration-of-commerce-cloud-with-sap-s-4hana/ba-p/13478155)).
- **Blocked company.** In Adobe Commerce a blocked company's users can sign in and browse but cannot
  order (snippet,
  [Experience League](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/account-company-manage)).
- **Invoices.** Business Central exports posted invoices to Shopify (read, overview). BigCommerce's
  invoice portal lets buyers pay invoices (marketing,
  [press release](https://www.bigcommerce.com/press/releases/bigcommerce-revolutionizes-the-b2b-purchasing-experience-with-launch-of-b2b-edition-invoice-portal/)).

## 6. Where the screens live

- **Inside the ERP:** Business Central Shopify connector, Commerce 365 (read, above).
- **Separate console:** Celigo, Boomi, DCKAP, SAP Integration Suite, MuleSoft; NetSuite's connector
  runs at its own connector site (read, Oracle page).
- **Inside the commerce admin:** i95Dev queue report and grid columns (read); Salesforce process
  exceptions on the order (read); SAP Backoffice switches (read); Sana price display and ERP-offline
  behaviour (read). Adobe ships a sync-status page for its own services and the Admin UI SDK to build
  one, but no ERP screen (read).

## Capability table

| Capability | How common | Examples |
|---|---|---|
| Run history / log | Common | [DCKAP](https://docs.dckapintegrator.com/project-manager/logs), [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot), [SAP IS](https://help.sap.com/docs/integration-suite/isuite-integrations-and-apis/monitor-message-processing) |
| Failed-record list with reason | Common | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot), [i95Dev](https://commercemarketplace.adobe.com/media/catalog/product/i95devconnect-navbases-100-0-4-ce/user_guides.pdf), [Adobe feeds](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/data-transfer/data-sync/data-feed-sync-status) |
| Retry selected records | Common | [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Rerunning_documents_in_Process_Reporting_bc807a70-0433-4770-9f91-779e573fb816), [i95Dev](https://commercemarketplace.adobe.com/media/catalog/product/i95devconnect-navbases-100-0-4-ce/user_guides.pdf), [MuleSoft](https://docs.mulesoft.com/partner-manager/latest/replay-transmissions), [Adobe feeds](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/data-transfer/data-sync/data-feed-sync-status) |
| Automatic retry, then manual | Some | [i95Dev](https://commercemarketplace.adobe.com/media/catalog/product/i95devconnect-navbases-100-0-4-ce/user_guides.pdf), [Adobe feeds](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/data-transfer/data-sync/data-feed-sync-status) |
| Email alerts | Some | Celigo (snippet only) |
| Origin / ERP ID column on admin grids | Some | [i95Dev](https://commercemarketplace.adobe.com/media/catalog/product/i95devconnect-navbases-100-0-4-ce/user_guides.pdf), [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders) |
| Customer/company matching | Some | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview) |
| Search integration log by order no. | Some (middleware) | [MuleSoft](https://docs.mulesoft.com/mule-runtime/latest/set-transaction-id), [Boomi](https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Document_Tracking_bf2f68f0-a8b1-4efc-8726-424341acaccc) |
| Timeline of one order in commerce admin | Not seen | — |
| Pause per direction/entity | Rare | [BC toggles](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot) |
| ERP price rules read-only in commerce admin | Not seen | — |
| Toggle ERP price rule from commerce | Not seen | — |
| "Use ERP prices" / cache switch | Some | [Sana](https://support.sana-commerce.com/Content/Sana-User-Guide/Prices-Discounts/Price-Settings.htm), [SAP](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/47ad58c1a27447949aad8addbee46fca/8db8712423fe4040bc07a74dca3d21c1.html) |
| ERP-offline price fallback setting | Rare | [Sana](https://support.sana-commerce.com/Content/Sana-User-Guide/Prices-Discounts/Price-Settings.htm); SAP does not mention one |
| Per-connection settings card | Common | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview), Celigo (snippet) |
| One store, several back ends (order split) | Rare | [SAP OMS](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/731ca9661fa647c489ddbd9c8477aa02.html) |
| One store, ERPs from two vendors | Not seen | — |
| Web order no. on ERP order | Common | [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders), [SAP](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/8baead5686691014bb358f2dcf8c0d83.html), [NetSuite](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0217123750.html) |
| Buyer sees credit / invoices | Common | [Adobe](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/companies/credit-company), [BC](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/shopify-connector-overview) |

## Implications for our demo (recommendation, not evidence)

1. **Commerce Admin:** one "ERP sync" page (Admin UI SDK menu page) copying Adobe's own Data Feed
   Sync Status layout: a summary per entity and direction (sent / failed), then a per-record grid
   with status, last sync, error, and a "Resync" mass action. An SC's audience already knows that
   screen; statuses like "Failed, will retry" vs "Failed, requires attention" are worth reusing.
2. **Grids and order view:** an **Origin** and **ERP ID** column on orders and customers (i95Dev
   does this), plus an order-view button showing ERP order number and last sync result. An "order
   journey" timeline is still beyond what I found — a chance to stand out, not a copy of the norm.
3. **Pricing:** no rule editing in Commerce. Give Commerce only switches: "ask the ERP for prices on
   this website", "cache ERP prices", and "if the ERP does not answer: hide price / show last known
   price / block checkout". SAP leaves that last one to the implementer; Adobe's own article says it
   is mandatory — a strong demo point. A read-only view of ERP rules would be new.
4. **Multi-ERP:** one card per connection, assigned to websites, is the common shape. Splitting one
   store's orders across two back ends has a real precedent (SAP OMS), with the catch that live
   pricing then needs one pricing authority. If we demo two ERPs on one store, name which ERP prices.
5. **ERP screen:** web order number, buyer PO number, channel "Web", and an inbound list with an
   error flag.
6. **Storefront:** contract price, available credit, a blocked-company notice, order status with the
   ERP order number, invoices; one order in history even if split.

## What I could not establish

- **Celigo:** every page returned a Cloudflare bot challenge in the browser; I stopped there. Its
  claims remain snippets.
- **SAP fallback:** answered as far as public docs go — the SAP pages I read do not mention what
  happens when S/4HANA is down during synchronous pricing. Actual runtime behaviour would need a
  running system to test.
- **S/4HANA order origin field and replication status:** same order number is confirmed; a
  channel/origin field and where an S/4HANA user sees replication errors (IDoc or message
  monitoring) were not found on pages I could read.
- **i95Dev:** read the Dynamics NAV variant's manual; I did not find a Business Central–specific
  manual or any screen for connecting several ERP instances.
- **One-order timeline** inside a commerce admin: not found in any product.
- **Two ERPs from different vendors** behind one store: not found.
- **Salesforce B2B:** no standard screen for ERP sync status found; the retry flow read covers
  Salesforce's own order placement only.
