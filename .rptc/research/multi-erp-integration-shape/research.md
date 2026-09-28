# One multi-ERP integration with a routing action, or an app per ERP?

Written 2026-09-27 at the owner's request ("gather all the information ... do the research ...
then make a recommendation", then "write this up as research"). It serves [[AB-16]] and the
Phase B rewrite of `.rptc/plans/several-erps/overview.md`.

**Recommendation: one integration app holding a routing action and one adapter per ERP (the
owner's 2026-09-24 decision), with the router-to-adapter hand-off written as one fixed contract
so an adapter can later move to its own app behind events if a customer's scale needs it.**

## The question

The owner decided on 2026-09-24 that routing is "a consumer action that then routes to the
specific ERP's runtime actions and events in the integration", inside one integration
(`.rptc/research/multi-erp-order-routing/research.md` §12b). On 2026-09-27 the owner also
asked whether each ERP's integration could be its own app, which would need a separate app to
split and route orders, "unless there's another approach I'm missing". A client building the
real thing must be able to add ERPs easily. This document compares the shapes against three
yardsticks and recommends one.

## The three yardsticks

1. **The demo.** An SC adds, resets and removes an ERP as a unit and can return to zero
   (CLAUDE.md, "whatever can be done can be undone"); every ERP runs the same baseline code;
   at most two ERPs in a demo (owner, 2026-09-26).
2. **Integration practice.** One owner per decision; ERPs unaware of each other; one owner of
   the combined order status; each ERP bills only its own lines; every send safe to repeat.
3. **The client's case**, from a client tech case whose research is kept outside this public
   repo. The client grew by acquisition and runs nine ERPs today, possibly "dozens", adding
   about three brands a year with no plan to consolidate; product lines are mastered in a PIM,
   which records which ERP owns each line; the tech case commits to one Commerce order per
   checkout, each ERP's share expressed as its own shipments and partial invoices on that order.

## What was established

Each finding names its source. VERIFIED means an Adobe document says it; OBSERVED means our
own code or a live measurement; INFERRED is reasoning from those.

### Commerce apps and workspaces

- VERIFIED: one Commerce instance holds several Commerce apps, including apps deployed from
  different workspaces. App Management describes itself as "one place for all your apps"
  (https://experienceleague.adobe.com/en/docs/commerce/app-management/overview), and the Admin
  UI SDK release notes fix defects for exactly this case: v5.0.0 (2026-09-16) "registering
  menus from apps deployed to different workspaces could cause a menu item to disappear";
  v4.2.1 (2026-07-29) "multiple apps registering at the same Admin UI extension point could
  produce colliding identifiers"
  (https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/release-notes/).
- OBSERVED: one App Management app per workspace is structural. The library's install record
  has a fixed key with no app identity, so a second app in the same workspace overwrites the
  first's install state; a second app in a second workspace of the same project installed and
  answered side by side (AB-2 spike, `.rptc/backlog/per-sc-io-project.md:128-129`). One
  workspace also has one static site and one database
  (`.rptc/research/workspace-per-integration/research.md:31-33`).
- OBSERVED: a runtime action in one workspace cannot call an action in another (401,
  technical-account mismatch); events do cross workspaces
  (`.rptc/research/workspace-per-integration/research.md:47-52`).

So "an app per ERP" means a workspace per ERP, and a separate router could not call the ERP
apps directly; it would have to hand them their parts as events.

### Custom events as the hand-off

- VERIFIED: a custom events provider is created through the Provider API, scoped to a project
  and workspace (`POST .../{consumerId}/{projectId}/{workspaceId}/providers`,
  https://developer.adobe.com/events/docs/guides/api/provider-api), not declared in
  `ext.config.yaml` (whether plain `ext.config.yaml` can declare one was not established).
  Events are published to `https://eventsingress.adobe.io` as CloudEvents
  (https://developer.adobe.com/events/docs/guides/api/eventsingress-api), throttled at 3000
  requests per 5 seconds per API key.
- VERIFIED: providers are listed org-wide and a registration names only `provider_id` and
  `event_code`, so an app in workspace B can subscribe to a provider created in workspace A
  (Provider API listing; "the list of event providers created in your organization",
  https://developer.adobe.com/commerce/extensibility/events/configure-commerce/).
- VERIFIED: delivery is at least once and **not ordered**; duplicates are possible and are
  removed by event id; the Journal keeps events for 7 days; a registration can filter on any
  payload field, so an ERP app can take only its own parts
  (https://developer.adobe.com/events/docs/support/faq). The event size limit was not found.
- OBSERVED: the integration already publishes its ERP's events to its own `erp` provider and
  consumes them (`commerce-erp-integration/app.commerce.config.ts:419-424`,
  `src/commerce-extensibility-1/actions/ingestion/webhook/index.js`), so the mechanics are proven
  in our own code. No Adobe document describes a router fanning order parts out this way.

### What Adobe and practice say about the shape

- VERIFIED: Adobe's back-office integration starter kit is one integration: each outgoing
  message passes validate, transform, preprocess, send and post-process hooks inside it
  (Experience League, back-office integration starter kit, last-mile integration), with I/O
  Events retrying by the consumer's HTTP status (same kit, retry mechanism). Adobe's App
  Builder example of sending to several backends is one orchestrator action that routes each
  request (Experience League, "Create a split payment POC"). No Adobe document describes
  splitting one order across several back offices (also the client tech case's finding).
- INFERRED from practitioner writing on distributed order management (practitioner blogs,
  not analyst reports; the analyst route was unavailable): a central splitter with one adapter
  per system isolates one system's outage and makes a new system an adapter rather than an
  edit to shared code; sends need idempotency keys; order state needs one owner.
- VERIFIED: Commerce holds one order with one state and status, and several partial invoices
  and shipments per source; "Complete" means paid and shipped in full (Experience League,
  order status, shipments, invoices). It knows only what is written back into it, so the
  component that writes shipments and invoices back owns the combined status (INFERRED).
- VERIFIED: a partial invoice is `POST order/{id}/invoice` with an `items[]` array
  (developer.adobe.com, create an invoice tutorial), and Adobe's quality patch MDVA-40399 says
  partial invoices for the same order cannot be created simultaneously through the API.
  Two ERPs billing close together must be invoiced one at a time.
- VERIFIED: Commerce as a Cloud Service added a per-line nominated inventory source (release
  notes, July and September 2026), shown on the order view and shipment screens. How a line is
  nominated at checkout was not found in the notes; the client tech case names
  `setNominatedSourceOnCartItems`, still to be tested.

## The shapes compared

| | A. One app: router + adapters (recommended) | B. App per ERP, router calls them | C. App per ERP, router publishes events |
|---|---|---|---|
| Works on the platform | Yes | **No**: actions cannot be called across workspaces | Yes |
| Adding an ERP of a kind already built | A settings entry | n/a | Deploy an app in a new workspace, subscribe it |
| Adding a new kind of ERP | An adapter module, one redeploy | n/a | A new app; router untouched |
| Combined order status | The router holds every part | n/a | Needs a return channel of result events from every ERP app |
| Duplicates and ordering | Inside one app | n/a | Every ERP app must tolerate duplicates and out-of-order parts |
| What an SC or client runs | 1 app, 1 workspace, 1 Commerce app, 1 Admin page | n/a | N+1 of each |
| Matches Adobe's documented pattern | Yes (starter kit, orchestrator example) | n/a | Not documented |
| Failure isolation | Per part, inside one deploy | n/a | Per app, separate deploys |

C is the approach the owner was missing: separate apps without a router that calls them. Its
cost is the return channel, the at-least-once handling in every ERP app, and N+1 of everything
to install and remove. Its gain is independent deploys, which matters most when different
teams own different ERPs.

## Recommendation

**A, as decided on 2026-09-24, with the hand-off written so C stays open.**

- **For the demo:** one app is one thing to add, reset and remove. Every mock ERP runs the
  same code, so a second demo ERP is a settings entry, not an app. The mock ERPs stay separate
  systems with their own workspace, screen, look and data.
- **For a client with dozens of ERPs:** A is the starting shape Adobe documents. The router
  hands each part to an adapter through one contract, "send this part" and "report this part's
  outcome". Inside one app that is a direct call; an adapter that must live on its own (another
  team, another deploy cycle) moves behind a pair of events without changing the router's
  logic. This is the "re-homed, not rewritten" rule of
  `.rptc/research/multi-erp-order-routing/research.md` §12a.

### What the design carries either way

1. The router is the only subscriber to placed orders. It stores each part (App Builder state,
   or the database) and is the only writer of the combined status.
2. A line's owner comes from a product attribute, as a PIM would write it. The nominated source
   becomes the carrier only after a sandbox test proves how it is set.
3. Each ERP invoices only its own lines (`items[]`); invoice calls on one order are serialised.
   An invoice precedes its shipment ("To complete and ship an order, it must have completed
   payment and be invoiced", Experience League, manage orders and shipments).
4. Sends are keyed by order and part so a retry never double-sends.
5. One ERP down: the other parts go now; the waiting part is retried, then marked failed with a
   manual re-send on the Admin page.
6. ERP numbers go to an order comment and the router's record. Custom order attributes are used
   only if a live test shows they accept a write after the order has left Pending (Experience
   League says the Admin edits them only while Pending; [[AB-37]]).
7. Settings: one Admin page with a section per ERP and a switcher (owner, 2026-09-27: "Your
   approach seems good as well").

## What could not be established

- Whether plain `ext.config.yaml` can declare a custom events provider (docs show API and CLI).
- The I/O Events size limit.
- An Adobe sentence stating two apps may subscribe to the same Commerce event (inferred from the
  provider and registration model).
- How a cart line is nominated to a source on the storefront or through a webhook.
- Whether two copies of the same app package can coexist on one Commerce store (never tried
  live, `.rptc/research/workspace-per-integration/research.md:51`).
- A named case study of a multi-ERP router built on App Builder.

## Sources used

- Research workers' reports, 2026-09-27, each citing the Adobe pages above.
- `.rptc/research/multi-erp-order-routing/research.md` (§3.4 the seam, §12 to §12b the pattern
  and decision), `.rptc/research/workspace-per-integration/research.md`,
  `.rptc/backlog/per-sc-io-project.md`.
- The client tech case's research on Commerce as a Cloud Service and App Builder, kept outside
  this repo.
- Session transcript, owner messages 2026-09-24 12:14 and 12:26, 2026-09-26 17:53, and
  2026-09-27.
