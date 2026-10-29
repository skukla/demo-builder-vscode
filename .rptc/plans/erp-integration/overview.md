# ERP integration — the first pre-built integration in the catalog

Branch `feature/erp-integration` from `develop`. Research: `.rptc/research/erp-integration/research.md`.
Owner-directed design, one decision at a time; this ledger is the record.

## The ask (owner, 2026-09-14)

One gallery entry that gives an SC two demonstrable things: an ERP modeled on SAP, and an
Adobe Commerce integration to it built on Adobe's Commerce integration starter kit. Data flows
both ways. It works on whatever Commerce instance the project points at. Every ERP record can
be reset. Nishant Kapoor's private `agilent-erp-mock` (hosted under jogosset) is the reference and code donor.

## The pattern this follows (ADR-011, restated by the owner 2026-09-14)

One component = one public GitHub repository (`skukla/*`), cloned into `components/<id>/`,
built and deployed by its own scripts into the demo's single App Builder project, isolated by
package name, described declaratively by its catalog entry (source, kind, layout, lifecycle,
requiredApis, envSchema, providesEnvVars, compatible stacks). The extension never bundles app
code. Dependencies between components flow through env vars: `envSchema[].providedBy` names
the provider, and the add path checks it.

## Decisions ledger

| # | Date | Decision |
|---|---|---|
| 1 | 2026-09-14 | **Two components, two repositories, two catalog entries.** The ERP clone provides `ERP_BASE_URL`; the starter-kit integration consumes it. Nishant Kapoor's mock is private and Agilent-bound, so it is a reference and code donor, not the shipped repository. Follows from ADR-011; no vote needed. |
| 2 | 2026-09-14 | **One gallery tile; the ERP comes with it, and goes with it.** Adding the integration adds and deploys the ERP first, the way a package's required mesh is pulled in. Removing the integration removes the ERP too: they are a unit (owner, later the same day: "Removing the integration would also remove the ERP application. They are a unit."). The ERP is still its own component underneath — its own repository, clone, deploy, row in the project file, agent tools — but its lifecycle is the integration's. Extension to the add and remove paths: a consumer's bound system is added before it and removed after it. |
| 3 | 2026-09-14 | **The ERP mirrors the instance, then adds its own layer.** At install and on every reset it reads the instance's products, customers and companies through the Commerce API (the S2S credential the spine already injects) and creates SAP-style records for them (materials, business partners, sales org), then adds what only an ERP has: contract prices, discount ceilings, and its own view of list price, stock and credit limits. **Commerce stays the master the SC prepares the demo in**: every product, stock and company change in Commerce overwrites the ERP's copy (events, the partner refresh on every drain, the mirror at install and reset); the ERP only LOOKS like the system of record on stage, and an edit on its screen flows to Commerce and comes back as the same value (owner, 2026-09-14: "the ERP needs to appear to be the master system, while in reality … the commerce system needs to be the master"). Nothing is pre-supposed about the catalog; Nishant Kapoor's fixed CSV becomes a live read. |
| 4 | 2026-09-14 | **First-cut flows**, in build order: (a) order → ERP sales order, ERP order number written back to the Commerce order; ERP status changes (confirmed, shipped, invoiced) → Commerce order status. (b) ERP-owned list price and stock → Commerce through the kit's product/stock sync. (c) Contract pricing at cart time: the totals-collector webhooks with the max-discount ceiling, degrading gracefully when the ERP is slow (Nishant Kapoor's design). |
| 5 | 2026-09-14 | **Companies are ERP business partners; individual shoppers and contacts are not (that is a CRM).** A company created in Commerce becomes a business partner; the ERP admin sets credit limit and block, and those flow to the Commerce company. Owner's question "would an ERP control customers, or a CRM?" answered from SAP's split: the ERP owns the account of record (business partner, credit, terms, contracts, order-to-cash); a CRM owns leads, contacts and pipeline. |
| 6 | 2026-09-14 | **(Superseded by 23.) One tile, two sections in the flyout; no start/stop verbs.** (Reaffirmed after a detour: with the pair a unit, a card of the ERP's own would be a sibling for one thing, and there is no orphan and no sharing to argue for it.) Both apps are App Builder apps: deployed means running, nothing runs to be stopped, and the ERP's admin screen is a static app App Builder hosts, not a process on a server. The tile is the integration; its status dot summarises both apps (the worse of the two). The flyout gains a "SAP ERP" section with its own status and actions: Open ERP (its admin screen, also reachable inside the Commerce Admin), Reset ERP records, Redeploy. (An "ERP offline" switch was listed here at first as an "outage demo"; decision 19 drops it from the flyout: the demo is the flow between the two systems, and unavailability is a robustness property, not a scene.) No Remove of its own: removing the integration removes both. The integration section stays as today. Every action gets an agent tool. Owner's requirement, mid-turn: "the plan must address how the SC will control both applications … and think through the flyout." |
| 7 | 2026-09-14 | **Deployment: two components, two deploys, the spine manages both, in the same App Builder project and workspace as every other component.** ERP first (the integration consumes `ERP_BASE_URL`; the provider check enforces it); redeploy per component; remove as a unit (decision 2). **Namespacing decides the ERP's layout:** an App Management (extension) app is one-per-workspace (the AB-2 spike's limit), and the integration built on the kit IS that app. So the ERP is a plain App Builder app — its runtime manifest at its root, runtime actions for its API, App Builder Database for its records, a hosted static admin screen — package-isolated by the spine's rename, exactly as the meshes are. (The catalog's term for this layout is `standalone`; the owner read that word as "separate from the runtime", which it never meant, so it stays out of prose.) Everything Commerce-facing (order webhook, pricing webhooks, syncs) lives in the integration; the ERP knows nothing of Commerce. Lost on purpose: Nishant Kapoor's admin screen inside the Commerce Admin (needs an extension point); the ERP's screen opens standalone. Spike list: the one-per-workspace limit; the App Builder Database entitlement on the org's Console projects. Owner's questions, mid-turn: "will both apps be deployed separately … will it be namespaced? does it matter?" |
| 8 | 2026-09-14 | **Reset rule: Commerce is master of what it owns; the ERP is transitory.** Reset wipes every ERP record and re-mirrors Commerce as it stands (pushed prices and stock become the new baseline: no revert, no orphan). Commerce orders keep their ERP numbers; the ERP's order-number counter never rewinds, so an old number cannot collide and the ERP admin shows it as "before last reset". The one class reverted: company blocks and credit limits the ERP set, undone from a ledger of exactly those writes (Nishant Kapoor's write-back list, generalised), because a blocked company with no ERP decision behind it is the orphan to avoid. Owner: "I'm really afraid of orphan data … Commerce is the true master of data it owns. It's not possible to delete Commerce orders." |
| 9 | 2026-09-14 | **The integration gets a Commerce Admin screen through the Admin UI SDK** (owner, mid-turn: "allowing an end user to control aspects of the integration from inside the Commerce Admin"). It lives in the integration app, the workspace's one extension app, beside the kit's `commerce/extensibility/1`: an App Builder app may declare several extension points, and Nishant Kapoor's mock did (`commerce/backend-ui/1`, hand-authored). What the screen controls: the integration's health and sync log, the ERP link, and the same ERP controls the flyout has (Reset ERP records, ERP offline). Two UIs by design: the merchant's, inside Commerce Admin; the ERP's own screen, opened on its own, "the SAP side". Spike item: whether App Management's `adminUi` on `commerce/backend-ui/2` fits, or the hand-authored `backend-ui/1` registration Nishant Kapoor used. |

| 10 | 2026-09-14 | **The tile is "ERP integration"; the SE names the integration at pick time, like any other** (owner: "This integration is an ERP integration. The SE should be able to offer the tile a name like any other integration."). **The ERP's own name is an input of the integration's configuration**, asked when the tile is added, default **"Acme ERP"**, changeable afterwards from the flyout and from the ERP's settings screen (owner: "let the SC give it a name as part of configuring the entire integration … for a default, something like Acme"). It reaches the ERP as `ERP_DISPLAY_NAME` and is what its title bar and the flyout section show. Nordwind was rejected; a fixed product name that a demo can point at, not the project's name, because no customer builds their own ERP. |
| 11 | 2026-09-14 | **Reset and the mirror are orchestrated by the integration, not the ERP.** The ERP knows nothing of Commerce (decision 7), so "Reset ERP records" is an integration action: revert the ledgered company writes in Commerce → wipe the ERP → re-mirror products and companies from Commerce into the ERP's import endpoints. The ERP itself only offers wipe, bulk import, and its counters. |
| 12 | 2026-09-14 | **No shared secret between the two apps.** The ERP's API actions require Adobe auth; the integration calls them with an IMS token minted from the S2S credential the spine already injects. Same org, same workspace, nothing to generate or store. The ERP's screen signs the SC in with their own Adobe login, as App Builder apps do. |

| 13 | 2026-09-14 | **The ERP is a new kind of component: `system`.** Not an integration: a stand-in for an external system integrations talk to, alongside `mesh` and `integration` as the kinds a project MAY have (none is required; a project can have integrations and no mesh). What the kind means: deployed by the same runner; no Commerce install; provides env vars; bound to the integration that brings it (`boundTo`), so it appears as the second section of that integration's card, never as a card of its own (card placement superseded by 23); its own agent tools for open, reset, offline. Owner: "This ERP needs somewhat of a different classification, but should be treated as its own app within the same runtime as every other integration." |

| 14 | 2026-09-14 | **Repositories `skukla/demo-erp` and `skukla/commerce-erp-integration`**, public, under the owner's account like the other catalog repositories. Code names, independent of the ERP's display name. |
| 15 | 2026-09-14 | **An instance without B2B companies** gets one default business partner named for the project, priced at list, so every flow demonstrates on any instance; the B2B moments need an instance with companies. |
| 16 | 2026-09-14 | **Build to Adobe's standards with our tooling; assess Nishant Kapoor's code, don't trust it.** The integration is scaffolded through the kit seed and shaped by the seven starter-kit skills; the ERP follows the App Builder patterns those skills and the platform docs state. Nishant Kapoor's modules are read as a reference and carried over only where they meet that bar (owner: "I don't wanna necessarily trust John's code for its quality … if John's code does that already, great"). |
| 17 | 2026-09-14 | **The spike's scratch workspace is the agent's to create and delete**, through the SDK path proven 2026-08-27 (create workspace → download config → `aio app use` → deploy → undeploy → delete workspace). Owner: "You should have the ability to create your own scratch workspace without me." |

| 18 | 2026-09-14 | **Two doors, one click each, from the tile.** "Open ERP" opens the ERP's own screen (its hosted page from `deployedUrls`); "Open in Commerce Admin" opens the integration's Admin UI SDK page inside the Commerce Admin (the Admin's URL plus the app's menu route). Both in the flyout's respective sections and as agent tools (`open_erp`, `open_commerce_admin_page`, or the existing `open_url` with the resolved address). Owner, mid-turn: "make sure the end user can easily open the ERP's frontend and also easily access the Commerce backoffice … via the admin ui sdk". |
| 19 | 2026-09-14 | **(Completed by 24.) The demo use case is data flowing back and forth, with the ERP shown as the supposed master.** Not an outage. The story the SC tells: change a price, a stock level or a credit limit in the ERP and watch it land in Commerce; place an order in Commerce and watch it appear in the ERP with an SAP-style number; move the order through confirmed, shipped, invoiced in the ERP and watch the Commerce order follow. Underneath, Commerce is the master the SC prepares in (decision 3). That the store keeps working when the ERP is away is a robustness property the optional webhooks give for free; it is not a demo scene, so the "ERP offline" switch leaves the Demo Builder flyout and the agent tools (step 05, step 06) and stays only as a test control on the ERP's own Settings screen and the Commerce Admin page. Owner: "The demo use case is not an outage. The demo use case is just showing data flowing back-and-forth between the two systems. Showing the ERP as the supposed master between the two." |
| 20 | 2026-09-14 | **The ERP publishes its own events, and the integration subscribes to them the starter kit's way.** Decision 7's "the ERP knows nothing of Commerce" was read too literally as "the ERP tells nobody anything", which produced a change list the integration polled ("outbox"/"drain"). The owner's intent was transience: the ERP must be fully resettable and hold nothing that ties it to one Commerce instance. A real ERP emits events, and the kit's back-office route exists for exactly that: the external system posts to the kit's ingestion webhook, the kit publishes to Adobe I/O Events, the kit's handler actions apply the change to Commerce. So the ERP journals every change as an event (`be-observer.*` names), delivers it to the ingestion webhook at once and retries pending ones every minute; its address is derived from the workspace both apps share, with the ERP's own IMS token, so nothing is configured and nothing is shared. The pull, and the words that came with it, are gone. Owner: "Wouldn't the ERP emit its own events? Wouldn't those be subscribed to by the starter kit implementation? When I said the ERP should know nothing about commerce or the integration, what I was trying to ensure is that the ERP integration was fully transient and able to be reset completely." |
| 21 | 2026-09-14 | **Reset and removal clear the ERP number from Commerce orders.** The owner asked whether the external order id, being a native field, could not be cleared when the integration is removed or the project is reset. It can: a sparse order save (entity id plus the one field, the route the reference app proved on a Cloud Service instance) sets it back to empty. Reset does it before wiping the ERP, for every order the ERP numbered (read from the ERP's own order list, so nothing else's external ids are touched), and a `detach` action does the same, together with the ledger revert, for Demo Builder to run before removing the integration. What stays, because Commerce cannot delete it: the notes in order histories, shipments, invoices and cancellations. |
| 22 | 2026-09-14 | **Updates: App Builder components join the extension's update system, release-driven, redeployed through the spine, bound pairs provider first.** Today the updater covers only `components.json` components and never redeploys; App Builder catalog entries (the shell, the kit seed, the ERP, the integration) are cloned from `main` and never checked. Step 07 has the reading and the model. Owner: "the plan must cover how the ERP system repo and the integration repo are updated by the extension." |
| 23 | 2026-09-17 | **Supersedes decision 6 and the card half of decision 13: the ERP is a card of its own, linked to the integration** (`.rptc/plans/erp-linked-tiles/`). Several ERPs per project became a real demo case, and a flyout section cannot show several. The ERP card sits right after its integration's, carries an "ERP" type badge (catalog `systemType`) and its own status (no worse-of-two face), and each card names the other behind a link icon, with a Uses / Used by row in the flyout. Its verbs are Open, Reset records (ERP card only), Update, Redeploy and Remove; removing either card removes both, and removal deletes the ERP's records first. The link is stored per project (`systems` / `usedBy`), not read from the catalog. Owner, 2026-09-17: a link icon, a system card with a type badge, Reset on the ERP card only, side by side with the link line. |
| 24 | 2026-09-17 | **The ERP's offline switch is removed, not kept as a test control** — the last of decision 19. The owner: "I've never been asked to show ERP being off-line." It went from the extension's surface in 19 and survived on the ERP's own Settings screen and the Commerce Admin page; both are gone now, with the 503 path, the `offline` setting, the `erp/set-offline` action and its Admin button. What STAYS is the unrelated resilience setting `orders_hold_offline`: an ERP can be unreachable for real reasons, and what Commerce does with an order it cannot send is a product decision, not a rehearsal. Nothing is soft-deprecated: `demo-erp` `7d6f13f`.. and `commerce-erp-integration` deleted the code outright. |
| 25 | 2026-09-17 | **How ERP data reaches a shopper: through Commerce, never from the browser and never through the mesh.** The ERP is an internal system; only the integration calls it, server-side, with a token minted per call from the injected server-to-server credential and cached ~15 minutes (`src/lib/erp.js`) — there is no shared secret between the two apps. Whatever the ERP decides is written into Commerce, and the storefront reads Commerce, the same for every channel. Rejected on the way here: putting the ERP behind the project's API Mesh. The mesh composes CUSTOMER-FACING services, and the only way to point it at the ERP was a long-lived key (the owner: "that sounds like a hack") — which would invent a second, weaker credential for an API that already has a proper one. Also rejected: custom drop-ins built with the Drop-in SDK. Adobe's own guidance is to EXTEND a drop-in with a web component using the storefront's own `/@dropins/tools`, and this repo already learned that bolting on a drop-in from a different release blank-pages the site (the feature-pack removal). If a label is ever needed that Commerce does not render, it is a component in a block library, added to whichever storefront the SC picked. |
| 26 | 2026-09-17 | **Live calls to the ERP happen at decisions, through Commerce webhooks, and the two new ones BLOCK.** Cart pricing already works this way: two `out_of_process_totals_collector` webhooks, `required: false`, Commerce warning at 1s and giving up at 5s, the integration's own ERP call capped at 3s, falling back to Commerce's prices (`app.commerce.config.ts`). [[AB-19]] (availability) and [[AB-20]] (credit) use the same mechanism with `required: true`: a missing discount is survivable, an over-limit order let through is not. Adobe documents exactly this shape — their example checks stock with an external system on add-to-cart, `required="true"`, with a `fallbackErrorMessage` the shopper reads (developer.adobe.com/commerce/extensibility/webhooks, read 2026-09-17). NOT built: a live price on the product page. It would put the ERP in front of every product view, and a price arriving by a different route than the one Commerce totals with can disagree at checkout — the cart is where the number matters and it is already live. Consequence to accept deliberately: with `required: true`, an ERP that does not answer stops orders. |
| 27 | 2026-09-18 | **Every integration's settings live on its tile (AB-21); supersedes decision 10's "changeable afterwards from the flyout" and Configure Project's integration tabs.** The ERP's name is a setting of the ERP integration, changed in a Settings modal from the tile's menu or the flyout's Settings row; saving redeploys the ERP then the integration. The ERP reads the integration's value first, so the two cannot disagree. Configure Project keeps project settings only. Owner: "Any configuration of the ERP integration should happen via the integration's tile, not through the project set up", widened to every integration. Plan: `.rptc/plans/integration-settings-on-tile/`. |

## Plan status

Complete 2026-09-14; backlog item [[AB-9]] filed under [[AB-1]]. Steps 01–05 and 07's plan
built 2026-09-14 (`step-04-catalog.md` and `step-05-surface.md` carry the "Built" notes).
Next: step 06, the live acceptance on Bodea — owner-gated on "install" — then step 07's code.

## Facts gathered for the plan (2026-09-14)

- The kit (v4) has action groups `customer`, `ingestion`, `order`, `product`, `stock`,
  `webhook`, `starter-kit`; `order/commerce` is Commerce → external, `order/external`
  is external → Commerce (`shipment-created`, `shipment-updated`, `updated`). Decision 4's
  flows map onto these plus `product`/`stock` external → Commerce and `webhook` for cart-time
  pricing.
- One App Management app per workspace is structural (AB-2 spike, 2026-08-27): the lib's
  install record is stored under a fixed key with no app identity, and the
  `commerce/extensibility/1` registration is workspace-scoped. The kit's package names are
  fixed and generated, so no rename. Hence the ERP is a plain app with its manifest at the root (decision 7).
- A fresh workspace's first `aio app deploy` failed at the log-forwarding step in that spike
  (`--no-log-forwarding-update` bypasses); worth remembering for the ERP's first deploy.
- App Builder Database: one database per workspace, provisioned by the deploy from the app's
  config (or `aio app db provision`), regions amer/apac/emea/aus, init region must match.
  Nishant Kapoor's README: the Console project needs the App Builder Data Services entitlement or every
  collection call is 403. Spike: is it on the demo-system org's projects?
- `deployedUrls` come from `aio app get-url --json` after deploy; the web SPA's URL is the
  ERP's "Open ERP" target and its API base is `ERP_BASE_URL` for the integration.
- Gallery pins that move when the catalog grows: `appBuilderComponentCatalogLoader.test.ts`
  (seeded entries by source repo; the gallery is `['app-builder-shell']`-shaped today),
  `appBuilderComponentSelection.test.ts`, `tileStatus.test.ts`.

## The shape, in one paragraph

Two public repositories, two catalog entries, one gallery tile. **The ERP** (`kind: system`, a
plain App Builder app in the same project and workspace as everything else) has runtime
actions for its REST API, App Builder Database for its records, and a hosted React Spectrum
screen; it provides `ERP_BASE_URL` and knows nothing of Commerce. **The integration** (`kind: integration`, extension layout, App
Management lifecycle, built from the kit) consumes `ERP_BASE_URL`, carries every
Commerce-facing piece — order webhook, pricing webhooks, product/stock/order-status syncs,
company write-back with its ledger, the mirror and reset orchestration — and an Admin UI SDK
screen inside Commerce Admin. Adding the tile adds the ERP first, then the integration; removing the integration removes
both; the flyout shows both; every action has an agent tool.

## Steps

| # | Step | Depends on | Item |
|---|---|---|---|
| 01 | Spike the four unknowns live (`step-01-spike.md`) | — | [[AB-9]] |
| 02 | The ERP repository (`step-02-erp.md`) | 01 | " |
| 03 | The integration repository (`step-03-integration.md`) | 01, 02 | " |
| 04 | Catalog entries, provider auto-add, naming, deploy order (`step-04-catalog.md`) | 02, 03 | " |
| 05 | Tile, flyout and agent tools (`step-05-surface.md`) | 04 | " |
| 06 | Live acceptance on Bodea, docs, how-to (`step-06-acceptance.md`) | 05 | " |
| 07 | Updates: App Builder components in the update system, releases on both repos, redeploy after update, bound pair provider first (`step-07-updates.md`) | 04 | " |

## Owner-gated actions (cloud writes)

- Creating the two public repositories (`skukla/demo-erp`, `skukla/commerce-erp-integration`): DONE 2026-09-14 with the gh CLI on the owner's word (public, Apache-2.0, a readme each).
- Step 06's deploys and Commerce writes on Bodea: asked before step 06.
- The spike's scratch workspace is NOT gated (decision 17).


### Admin UI SDK and the workspace (read 2026-09-14, owner's question)

The owner asked whether the Admin UI SDK forces a Production workspace. Read from developer.adobe.com:

- Release notes 3.0.0 (2025-04-15): "The limitation on Production-only workspaces has been resolved."
  2.1.0 had added a staging-testing option; 2.3.0 renamed "Staging Test mode" to "Sandbox".
- Eligible-extensions configuration (SDK 4.1 wording): Commerce loads extensions from the App
  Registry; the merchant picks the workspace — "Stage, Production, or Custom" (Custom takes the
  workspace name) — and "an extension is considered eligible when the deployed workspace is
  published to the `commerce/backend-ui/1` extension point" (the deploy-time registration, which
  `aio app deploy` does unless `--no-publish`).
- The publish page (Production workspace + approval by an org admin) describes DISTRIBUTING an app,
  not showing it in one merchant's Admin.
- The release notes' "Known issues" still say "you cannot deploy an app that uses the Admin UI SDK
  in a staging environment"; it predates 3.0.0 and contradicts it. Treat it as stale.
- 4.2.0 (2026-07-28) deprecated `commerce/backend-ui/1` (still served). The plan's choice of
  `commerce/backend-ui/2` through App Management stands.

So: the demo's one workspace, whatever its name, is fine. Step 03 configures the Commerce Admin's
"Configure eligible extensions" for that workspace (by name, via "Custom", when it is neither Stage
nor Production) and verifies the screen appears; nothing here needs Production.
