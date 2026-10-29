# Are these real ERP features, and does anyone want them?

2026-09-23 · External research (public vendor docs) plus one pass over Adobe-internal field and
support material. Answers the owner's question: "validate that they are actually features that SAP
and other ERPs would provide, and that they are features that would be DESIRED."

## How to read this

Every verdict is split across **three tiers**, because a feature being standard in one tier says
nothing about the others.

| Tier | Who ships it | Products cited here |
|---|---|---|
| **1 · ERP-native** | The ERP itself, out of the box | SAP S/4HANA, SAP Commerce Backoffice, Dynamics 365 Business Central, NetSuite |
| **2 · Integration layer** | The middleware between the two systems | Boomi, Celigo, MuleSoft, Jitterbit, Workato, SAP Integration Suite, Patchworks |
| **3 · Commerce-side connector** | A connector whose screens live in the commerce admin | Sana Commerce, i95Dev, Dynamicweb, Adobe's own sync pages |

**Our App Builder integration is tier 2**, and our Admin UI SDK page renders in tier 3. A customer
would run Boomi or Celigo *alongside* App Builder, not instead of it. So a feature that is standard
at tier 2 is legitimate for us to build — but it is **not** something the ERP hands you, and that
distinction is what the owner will use in front of a customer.

Two axes are kept apart throughout: **A — does it exist**, **B — is it wanted**. "Not found" and
"no evidence" are real answers and are written as such.

Evidence labels: **read** = I read the page · **snippet** = search-result text only, the page
blocked or returned a JS shell · **internal** = Adobe-only corpus, described but never quoted or
linked, because this repo is public · **judgement** = my conclusion, not evidence.

---

## Bottom line

| # | Candidate | Tier 1 (ERP) | Tier 2 (integration) | Tier 3 (commerce admin) | Wanted? |
|---|---|---|---|---|---|
| 1 | Exchange / run history | **Standard** | **Standard** | **Standard** | Yes |
| 2 | Retry one failed record | **Standard** | **Standard** | **Standard** | Yes — strongest |
| 3 | Follow one order across both systems | Partial | **Standard (named)** | **Not found** | Yes — strong |
| 4 | "Why did this buyer get this price?" | **Standard (SAP)** | Not found | **Not found** | No direct evidence |
| 5 | ERP price rules read-only in commerce admin | n/a (the ERP has its own screens) | Not found | **Not found** | No evidence |
| 6 | Switches for how commerce uses the ERP | n/a | Not found | **Standard** | Yes, for the offline case |
| 7 | ERP user sees records from commerce | **Standard** | n/a | n/a | Yes — vendor investing now |

The headline correction to the previous pass: **candidate 3 IS a named feature** — Celigo shipped
it as **TraceView** in January 2026. It is named at tier 2, not tier 3. Detail below.

---

## 1 · Exchange / run history in the commerce admin — BUILT

### A. Does it exist

**Tier 1 — yes, SAP ships two of them.** S/4HANA's **AIF** (Application Interface Framework)
provides message monitoring for inbound and outbound messages, reachable as the Message Monitoring
Fiori app or transaction `/AIF/ERR`; S/4HANA Cloud's message monitoring is built on AIF (snippet,
[SAP Help: AIF Monitoring](https://help.sap.com/docs/btp/sap-business-technology-platform/aif-monitoring),
[Setting Up Message Monitoring on S/4HANA Cloud](https://help.sap.com/docs/r/08396ebe30e245e69ea8b1f00be0f9d0/AIF-Integration/en-US/87342fbbba7c4ee685e96cab0f5152cd.html)
— both pages returned a JS shell to `fetch`). Older and still ubiquitous: IDoc monitoring via `WE02`
/ `WE05`, showing each IDoc's status history — inbound status 51 = error, 53 = success (snippet,
[SAP Community: BD87](https://community.sap.com/t5/technology-blog-posts-by-members/how-to-use-transaction-bd87-to-reprocess-failed-idocs/ba-p/13641328),
[ecosio](https://ecosio.com/en/blog/reprocessing-idocs-in-sap-erp/)).

**Business Central ships it for its own commerce connector**: the **Shopify Orders to Import** page
with a **Has Error** field, **Shopify Products** with **Has Error** + **Error Message**, and a
**Last Error Info** page carrying the error message and call stack (read,
[BC 2025 wave 2 release plan](https://learn.microsoft.com/en-us/dynamics365/release-plan/2025wave2/smb/dynamics365-business-central/troubleshoot-shopify-connector),
[troubleshoot guide](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot)).

**NetSuite is the exception.** No native integration error queue. Practitioners describe building
saved searches over the Script Execution Log and correlating System Notes, or writing a custom error
framework (snippet,
[SuiteSolvers](https://suitesolvers.com/2025/09/01/troubleshooting-common-netsuite-integration-errors-practical-solutions-for-manufacturing-and-distribution-operations/),
[thenetsuitepro](https://www.thenetsuitepro.com/netsuite-customization/error-handling-retry-framework/)).

**Tier 2 — universal.** Celigo execution logs, Boomi Process Reporting, SAP Integration Suite message
monitoring, MuleSoft, Patchworks. Carried over from the previous pass; nothing contradicts it.

**Tier 3 — yes.** i95Dev's Message Queue Report inside the Magento admin (Pending / Success / Error /
Complete, filterable by entity), and Adobe's own **Data Feed Sync Status** page, which is the same
shape for Adobe's own services rather than an ERP (read, both cited in the previous pass).

### B. Is it wanted

Yes, but the demand is usually stated as *retry* (candidate 2) with the log as its precondition.
Implementation partners state it as a requirement in near-identical words: "A production-ready
integration surfaces errors in an admin interface that tells an operations manager exactly what
failed and why", and insists on "an error queue" rather than log files (read,
[Web Solutions NYC](https://www.websolutionsnyc.com/blog/magento-erp-integration/)).

**Internal (not quoted):** a 2026 Adobe solution-optimization review of a live Commerce customer
records ERP connectivity failures and failed order synchronization causing operational disruption,
and recommends retry plus failure-recovery mechanisms and ERP endpoint monitoring. A second review
recommends correlation IDs, sync-state monitoring and queue-health visibility. Both are consulting
recommendations, not product requests.

### Verdict and demo meaning

**Standard at all three tiers.** Building it is matching the norm, not innovating. For the demo it is
table stakes: an SC's audience has seen this screen in SAP and in every iPaaS. The one thing that is
*ours* to claim is that it renders **inside the Commerce Admin** rather than in a separate console —
which is tier 3, where only i95Dev and Adobe's own feed page precede us.

---

## 2 · Retry one failed record from the commerce admin — BUILT

### A. Does it exist

**Tier 1 — yes, and this is the oldest habit in SAP shops.** `BD87` is the production tool that
reprocesses IDocs in error, one at a time or in bulk; `WE19` replays a single case (snippet, same
two sources as above). AIF lets you "correct errors, restart, or cancel messages" (snippet, SAP
Community / SAP Help as above).

**One limit worth knowing and repeating:** for *synchronous* OData service calls, S/4HANA can only
display the error — correcting the payload, restarting or cancelling is not supported (snippet,
[SAP KBA 3080971](https://userapps.support.sap.com/sap/support/knowledge/en/3080971) and the AIF
monitoring material). That is exactly the shape of a live price call, and it is the honest limit of
"retry everything".

**Business Central:** manual restart per record — the **Create Item** action re-runs product
creation for a failed Shopify product; **Import Selected Orders** processes chosen orders (read,
release plan + troubleshoot guide).

**Tier 2 — universal.** Boomi "Re-run Document" for a single document; MuleSoft Partner Manager
replay of failed transmissions; Celigo retry per record (from the previous pass; Celigo pages remain
snippet-only behind a bot challenge).

**Tier 3 — yes.** i95Dev's **Sync** mass action after its automatic retries are exhausted; Adobe's
own **Schedule Resync** mass action on failed feed rows (read, previous pass).

### B. Is it wanted

**Strongest demand signal of the seven.**

- Magento core feature request [#32224](https://github.com/magento/magento2/issues/32224), open since
  February 2021, still "Ready for grooming" and unassigned. The use case named in the issue is
  literally ours: the MySQL queue is used to send orders to an external system, the external system
  fails, and the reporter wants bounded retries with backoff (read).
- Partner commentary states one-click retry as a requirement (read, Web Solutions NYC above).
- **Internal (not quoted):** one Adobe Commerce customer's support case is a direct request to
  control automatic retries against their ERP after repeated timeouts — Adobe confirmed at the time
  it was not possible. A separate internal engineering thread records a merchant requirement to see
  retry counts and identify the final retry for App Builder actions, answered as not currently
  possible and tracked as an enhancement.

### Verdict and demo meaning

**Standard at all three tiers, and actively missing from Adobe Commerce today.** This is the
candidate with the clearest "customers asked and did not get it" record. Demo it as the answer to a
known gap, and be ready for the synchronous-call caveat: a live price lookup that failed cannot be
"retried" the way a queued order can.

---

## 3 · Follow one order end to end across both systems — BUILT

**The previous note ("not a named feature anywhere") was too strong. Correcting it.**

### A. Does it exist

**Tier 2 — yes, and it has a name.** Celigo ships **TraceView** inside Execution Logs: "a
record-level debugging tool … that shows a single record's execution path through a flow, displaying
each step visited, its status, and where outcomes changed." Celigo states the motivating problem in
the merchant's own words: "which records were processed, which ones failed or were ignored, and at
which step a specific record's outcome changed" (read,
[Celigo: Execution logs](https://www.celigo.com/builders-hub/execution-logs-achieve-end-to-end-operational-visibility/),
published 21 Jan 2026). Weaker cousins at the same tier: Boomi tracked fields let you filter document
history by a business value such as an order number; MuleSoft's Set Transaction Id does the same;
SAP Integration Suite has correlation IDs (read, previous pass). Patchworks states a technician "can
trace a specific record through Patchworks logs" (marketing,
[Patchworks](https://patchworks.io/platform/features/process-flows/)).

So: **the per-record journey is standard in the integration layer**, and one major vendor shipped a
named, marketed version of it eight months ago.

**Tier 1 — partial, and only within one system.** SAP's **Document Flow** (from `VA03`) is a
chronological view of a sales order through delivery and billing — a genuine end-to-end order view,
but entirely inside SAP; it does not reach the commerce side (snippet,
[SAP Community](https://community.sap.com/t5/enterprise-resource-planning-q-a/sales-order-document-flow/qaq-p/6736633)).
The nearest cross-boundary thing is Business Central's new **Order total** FactBox on the Shopify
Orders page, which "displays totals from both the order in Shopify and the sales document in Business
Central" so you can "compare figures without opening each document" (read, BC 2025 wave 2 release
plan). That is a reconciliation panel, not a timeline.

**Tier 3 — not found.** No commerce admin I could reach shows one order's cross-system timeline.
Sana is the clearest counter-example: its Order Details admin page shows *dummy* data, because "the
information about sales orders is taken from the ERP system" and the real data is only rendered to
the buyer in the storefront (snippet,
[Sana: Order Details](https://support.sana-commerce.com/content/Sana-User-Guide/Content/System-Pages/Order-Details.htm)).

### B. Is it wanted

**Strong — and the strongest of the seven on internal evidence.**

- Celigo built and marketed it in 2026, which is a vendor telling you what its customers asked for
  (read, above).
- Microsoft added cross-system order comparison to BC in the 2025 wave 2 release, GA 1 Oct 2025
  (read, release plan).
- **Internal (not quoted):** an Adobe field deck describes a use case of diagnosing latency in order
  sync between Commerce and an ERP, calling for correlated logs and traces across Commerce, App
  Builder actions and ERP API calls. Two customer support cases are, in substance, this feature's
  absence: one where a single order reached the ERP and several others did not, with support asking
  the customer to hand over paired order IDs, request IDs, integration IDs and timestamps so the flow
  could be correlated by hand; another where orders failed to reach SAP with blank external order IDs
  and no corresponding Commerce error. A solution review for a third customer recommends transaction
  tracing and correlation IDs by name.

### Verdict and demo meaning

**Standard at tier 2 (named: TraceView). Not found at tier 3. Partial at tier 1.** Our version is
legitimate — it is the tier-2 capability rendered at tier 3, where nobody has put it. Say it that
way: "this is what your iPaaS gives your integration team, moved to where your operations person
already works." Claiming it as something no product has is now wrong.

---

## 4 · "Why did this buyer get this price?" — NOT BUILT

**The previous note ("not seen anywhere") was wrong about the ERP and right about commerce.**

### A. Does it exist

**Tier 1 — yes, SAP has shipped it for decades.** In a sales document's Conditions tab there is an
**Analysis** button; the pricing analysis screen lists every condition type in the pricing procedure,
whether each is active or inactive, and the reason, including which access was tried and which date
the system used to look for a condition record (snippet, consistent across
[SAP Community](https://community.sap.com/t5/enterprise-resource-planning-q-a/pricing-conditions-in-sales-order-are-inactive/qaq-p/8834740),
[SAP KBA 2799312](https://userapps.support.sap.com/sap/support/knowledge/en/2799312),
[SAP Help: SD Pricing overview](https://help.sap.com/docs/SUPPORT_CONTENT/sd/3362915291.html) —
help.sap.com returned a JS shell, so the SAP-hosted wording is snippet-level). It is per sales
document / per item, on demand, in the ERP.

**And it is on the wire already.** `API_SALES_ORDER_SIMULATION_SRV` — "The API gives you information
about pricing, material availability, and the customer's credit limit", not persisted — exposes
item-level pricing element entities `A_SalesOrderItmPrcgElmntSimln` carrying condition rates, bases
and manual-adjustment flags, plus header-level `A_SalesOrderPrcgElmntSimln` (read,
[Ballerina connector reference for the SAP API](https://central.ballerina.io/ballerinax/sap.s4hana.api_sales_order_simulation_srv/latest);
[api.sap.com listing](https://api.sap.com/api/API_SALES_ORDER_SIMULATION_SRV/overview)).

**Adjacent tier worth naming: CPQ.** "Price waterfall" is a marketed, named feature in Salesforce
CPQ, Pricefx, Vendavo and DealHub — a step-by-step breakdown from list price down to net price
showing each adjustment in sequence (snippet,
[DealHub glossary](https://dealhub.io/glossary/price-waterfall/),
[Nebula Consulting on Salesforce CPQ](https://nebulaconsulting.co.uk/insights/salesforce-cpq-the-price-waterfall/)).
So the *concept* has a market name; it just lives in the pricing/quoting tier.

**Tier 2 and 3 — not found.** And the near-miss is striking: SAP Commerce Cloud's Backoffice tab for
this integration is literally named **Sales Order Simulation**, meaning SAP Commerce calls the very
API that returns the condition breakdown — and surfaces only the resulting price, not the breakdown,
to a merchant (snippet,
[SAP Help: Configuring Pricing from SAP Commerce Cloud](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/4de682b754194a2493584e10c0864244.html);
the Backoffice tab set is confirmed read in the previous pass). Adobe's own Experience League
perspective states that Commerce has no native UI for SAP price simulation (read, previous pass,
[Experience League](https://experienceleague.adobe.com/en/perspectives/how-to-integrate-adobe-commerce-with-sap-erp-for-b2b-commerce)).

Sana gets closest at tier 3 and stops short: its admin chooses which ERP prices and discounts are
*shown* — including a discount amount or percentage next to the price — but that is presentation of
a number, not an explanation of a rule (snippet,
[Sana: Prices and Discounts](https://support.sana-commerce.com/Content/Sana-User-Guide/Prices-Discounts/Prices-Discounts.htm)).

### B. Is it wanted

**No direct evidence, publicly or internally.** I searched for a request in those terms and did not
find one.

What I did find is the adjacent pain, repeatedly:

- Partner commentary on the problem shape: "recreating this logic inside Adobe Commerce … creates two
  sources of truth that inevitably diverge", and nightly sync means "a Tuesday afternoon order gets
  Monday's rates" (snippet, [Bemeir](https://bemeir.com/articles/adobe-commerce-b2b-erp-integration-architecture-timeline/)).
- The "hundreds of customers, each with their own negotiated rates … buried inside the ERP" framing
  is standard in B2B commerce writing (snippet,
  [Virto Commerce](https://virtocommerce.com/blog/contract-pricing-in-b2b-ecommerce)).
- **Internal (not quoted):** Adobe B2B product planning material treats contracts as carrying pricing
  and discount models and entitlements, with import from ERP/CRM and a Commerce-side contract view —
  adjacent, and about contracts rather than a per-line explanation. One support case shows a merchant
  unable to reconcile a discounted cart price after removing the discount, resolved by tracing which
  price provider supplied the value for that customer group. That is price-provenance pain, not a
  request for this feature.

### Verdict and demo meaning

**ERP-native standard (SAP). Novel at tiers 2 and 3.** The market has the capability in the ERP, has
a name for the concept in CPQ, and has nobody putting it in a commerce admin — while the data is
already in the response SAP Commerce receives.

**Judgement, not evidence:** this is the best differentiator of the seven for a demo, precisely
because an SAP-literate audience will recognise the Analysis screen instantly and has never seen it
on the commerce side. The risk is the mirror image: with no demand evidence anywhere, it may impress
in the room and never be asked for after it. Cheapest honest framing is a demo-only capability with
a recognisable ancestor, not a validated requirement.

---

## 5 · ERP pricing rules shown read-only in the commerce admin — NOT BUILT

### A. Does it exist

**Tier 1 — the ERP obviously has these screens** (SAP condition record maintenance and the Fiori
"Manage Prices – Sales" app; BC price lists and the best-price principle). That is not the claim
being tested.

**Tier 3 — not found, and the market has settled on two *other* answers:**

- **Copy the prices down into commerce.** Business Central computes prices from its own price and
  discount groups and pushes them to Shopify, with a per-catalog "Sync Prices" toggle; Adobe Commerce
  B2B uses shared catalogs and customer groups for the same job (read, previous pass; snippet,
  [Shopify's own B2B/ERP guide](https://www.shopify.com/enterprise/blog/b2b-ecommerce-erp-integration)).
- **Read them live and show nothing in the admin.** Sana reads customer-specific pricing, trade
  agreements, discounts and volume prices from the ERP per request, and states plainly that Sana
  Commerce "does not have any influence on how prices are calculated" (read, previous pass). Its
  admin shows dummy data where ERP records would be (snippet, Sana Order Details above).

Dynamicweb splits along the same line: PIM owns enriched product data while "Business Central
maintains its role in managing pricing and financial data" (snippet,
[Dynamicweb](https://dynamicweb.com/resources/insights/news-articles/dynamicweb-launches-accelerated-pim-integration-for-microsoft-dynamics-365-business-central)).

### B. Is it wanted

**No evidence found**, public or internal. Nothing I read asks for an inspect-only mirror of ERP
pricing rules inside a commerce admin.

### Verdict and demo meaning

**Novel, and the weakest of the seven.** A read-only list with no action attached duplicates a screen
the ERP user already has, and the norm is either to copy the prices or to trust the live call.

**Judgement:** if candidate 4 gets built, this becomes redundant — "why this price" answers the same
question with an action and a context. I would not build 5 separately. *This is a decision for the
owner, not a filing: drop it, or fold it into 4 as the drill-down behind the explanation?*

---

## 6 · Switches for how commerce uses the ERP — PARTLY BUILT

### A. Does it exist

**Tier 3 — standard, and the third switch (offline behaviour) is better precedented than the previous
pass found.**

- **SAP Commerce Backoffice**, SAP Integration → Base Store Configuration: on/off for availability
  check, credit check and synchronous pricing for catalog and cart, plus a price cache switch; with
  the cache off, every price comes straight from S/4HANA (read, previous pass; corroborated snippet,
  [SAP Help](https://help.sap.com/docs/SAP_COMMERCE_INTEGRATIONS/8ce6157b995e418093b6e5410bcd74b2/4de682b754194a2493584e10c0864244.html)).
- **Sana has the offline switch explicitly.** When there is no connection to the ERP, Sana "automatically
  enables the maintenance mode". A setting named **Price when ERP connection is not available**
  decides whether prices show at all; when on, "customers can see the prices based on the latest
  imported list prices", while "customer specific prices, trade agreements, discounts and volume
  prices are not available". Two modes exist: full maintenance, where customers can still create
  orders and browse but stock and order history are hidden; and **ViewOnly**, where "customers can
  only browse the catalog" — i.e. checkout is blocked (read,
  [Sana: Maintenance Mode](https://support.sana-commerce.com/Content/Sana-User-Guide/System/Maintenance-Mode.htm)).
  That maps onto all three of our proposed offline choices: fall back, last known price, block
  checkout.
- Sana's admin also has a **Test connection** button on its ERP Connection page and an opt-in
  request/response logging switch, disabled by default because it affects performance (read,
  [Sana: ERP Connection](https://help.sana-commerce.com/sana-commerce-93/user_guide/tools/erp-connection)).
- **Business Central** has per-shop **Enabled**, "Allow Data Sync to Shopify" and per-catalog "Sync
  Prices" (read, previous pass).

**Tier 1 — n/a.** How commerce uses the ERP is a commerce-side decision; SAP's own pages define the
switches on the SAP Commerce side, not in S/4HANA.

### B. Is it wanted

**Yes for the offline case, and the evidence is unusually direct for a negative-path feature.**
Adobe's own Experience League perspective states that if SAP is unavailable the storefront cannot
show prices, and "a fallback strategy … is mandatory in production", naming cached last-known prices
or a degraded mode (read, previous pass). SAP's own synchronous-pricing pages do not describe a
fallback at all — so the gap is Adobe's to fill, by Adobe's own account.

**Internal (not quoted):** two 2026 solution reviews of live Commerce customers recommend monitoring
ERP endpoint availability and implementing failure recovery, tied to observed outages.

### Verdict and demo meaning

**Standard at tier 3 for the first two switches; the offline choice is standard at Sana and absent
from SAP's docs.** The demo point writes itself: SAP leaves ERP-down behaviour to the implementer and
Adobe's own guidance calls a fallback mandatory — so show the three-way choice and say who else makes
you build it yourself.

---

## 7 · The ERP user's side: which records came from or went to commerce

### A. Does it exist

**Tier 1 — standard, and this is the candidate with the cleanest evidence.**

Business Central ships the whole thing, in its own UI:

- **Shopify Orders to Import** — an inbound list where you "assess the orders that are available and
  check whether an error blocked the import of a specific order", with a **Has Error** field and
  **Import Selected Orders** (read, [troubleshoot](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/troubleshoot),
  release plan).
- **Has Error** + **Error Message** on Shopify Products, and a **Last Error Info** page with the
  message and call stack (read, release plan).
- Channel context: the connector "can include orders created in various sales channels, such as
  online stores, Shopify POS, or B2B" (snippet, troubleshoot).
- Provenance on the ERP record: **Shopify Order No.** on sales orders, invoices and shipments, and
  now **Shpfy Order Id** / **Shpfy Order No.** on archived sales headers and lines (read, release
  plan + [synchronize orders](https://learn.microsoft.com/en-us/dynamics365/business-central/shopify/synchronize-orders)).

SAP's equivalent is AIF / IDoc monitoring plus the shared order number: the S/4HANA sales order
carries the same number as the Commerce order (read, previous pass).

### B. Is it wanted

**Yes — and the best kind of evidence: a vendor spending money on it right now.** Microsoft's
Dynamics 365 Business Central 2025 release wave 2 shipped "Troubleshoot the Shopify Connector", GA
1 October 2025, whose stated business value is that "different levels of logging reduce the time it
takes to fix a problem with your integration between Shopify and Business Central" (read, release
plan). The added items are precisely this candidate: per-record error messages, manual restart, order
identity on archived documents, and a totals comparison across the two systems.

### Verdict and demo meaning

**ERP-native standard.** Our ERP mock is ours to build, so matching this is matching what an
SAP- or BC-literate audience expects to find when they turn around and look at the back office. Of
the seven, this is the one where "would the ERP give you this?" is answered with an unambiguous yes.

---

## What I could not establish

- **SAP's own wording, first-hand.** Every `help.sap.com` page returned a JS-rendered shell to
  `fetch`, including the AIF monitoring, sales-order-simulation and SAP Commerce pricing pages. The
  SAP claims above are snippet-level or come from SAP Community / KBA / a connector reference that
  quotes the API description verbatim. A browser pass would upgrade these; the substance is
  corroborated across independent sources, so I do not expect it to change any verdict.
- **Celigo's product documentation** remains behind a bot challenge (403 / Cloudflare). The TraceView
  claim comes from Celigo's own Builders Hub article, which is a vendor page, not docs.
- **Whether any commerce admin anywhere surfaces a price explanation.** I found none, and I checked
  SAP Commerce, Sana, i95Dev, Dynamicweb and Adobe. I cannot prove absence across the whole market —
  this is "not found", not "does not exist".
- **Whether anyone has ASKED for candidate 4 or 5.** No public thread, no vendor roadmap item, no
  internal field or support record. That is a genuine null result on the demand axis, not a gap in
  searching — I looked for it three ways.
- **NetSuite / Oracle / Infor / Epicor** got one pass each, not the depth SAP and Business Central
  got. NetSuite's "no native error queue" finding rests on practitioner articles, not Oracle docs.
- **How often SAP customers actually use the pricing Analysis screen.** It plainly exists and is
  taught; I have no usage evidence, so "SAPs ship it" is established and "SAP users live in it" is
  not.

## Three questions only the owner can answer

1. **Candidate 4 is the one real differentiator and the one with zero demand evidence. Build it
   anyway?** It is ERP-native in SAP, has a market name in CPQ ("price waterfall"), the data is
   already in the API response SAP Commerce receives — and nobody has asked for it on the commerce
   side. That trade is a product-intent call, not a research finding.
2. **Candidate 5 — drop it, or fold it into 4?** It is the weakest: no tier-3 precedent, no demand
   evidence, and it duplicates a screen the ERP user already has. As a drill-down behind "why this
   price" it costs almost nothing; standalone it is a list with no verb.
3. **How do we now describe candidate 3 out loud?** "No product does this" is no longer defensible —
   Celigo named and shipped TraceView in January 2026. The accurate line is "your integration layer
   gives this to your integration team; we give it to your operations person, in the admin they
   already use." Does the owner want the demo narrative rewritten to that, or to lead with the
   tier-3 novelty and let the tier-2 precedent come up only if asked?
