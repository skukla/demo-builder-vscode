# The ERP integration

The first pre-built integration in the catalog (2026-09-14). One tile in the Integrations
gallery, "ERP integration", gives a project two things it can show on stage: an ERP
modelled on SAP, with its own screen, and an Adobe Commerce integration to it built on
Adobe's Commerce integration starter kit. The design record is
`.rptc/plans/erp-integration/overview.md` (decisions 1 to 22).

## What the SC gets

- **An ERP that appears to be the master.** Products, business partners (Commerce
  companies), contract prices and sales orders, on the ERP's own React Spectrum screen.
  Demo Builder opens it in a private browser window. Every record is transient: reset wipes them and Demo Builder
  fills the ERP from the Commerce instance again. Commerce is the master the SC prepares in; the ERP adapts.
- **Data flowing both ways.** An order placed on the storefront gets an ERP order number;
  marking it shipped, invoiced or cancelled in the ERP reaches the Commerce order. A price
  or stock change in the ERP lands on the Commerce product. A company's credit limit
  set in the ERP lands on the Commerce company; a block set in the ERP holds that ERP's orders
  of the company (On Hold, the reason in each order's history) and never switches the company
  off: each ERP for itself (owner, 2026-09-28). A company's prices in the ERP (its customer
  price list, or its price group's) are published into that company's own shared catalog, so
  its buyers see them on the listing, the product page and the cart (AB-26z).
- **A screen inside the Commerce Admin** (Admin UI SDK), showing whether the ERP is
  reachable, counts of what it holds, and buttons to refresh partners, push records and
  reset. It keeps no history of what crossed — its log is only what its own buttons did
  during one visit (read from the page's code, 2026-09-22; the history is AB-25).

## The two components

| | `demo-erp` (the ERP) | `erp-integration` |
|---|---|---|
| Catalog kind | `system`, bound to `erp-integration` | `integration`, extension layout, App Management lifecycle |
| Repository | `skukla/demo-erp` | `skukla/commerce-erp-integration` |
| Provides / consumes | provides `ERP_BASE_URL` | consumes `ERP_BASE_URL`; both take `ERP_DISPLAY_NAME` (default "Acme ERP"); the integration alone takes `INTEGRATION_DISPLAY_NAME` (default "ERP Integration") |
| Commerce install | none | yes, the starter kit's, after the deploy |
| Screen | its own, served by its `screen` action, opened with a key | the Commerce Admin page, on the workspace's static site |

They are a **unit**. Adding the integration adds and deploys the ERP first, then the
integration, into the project's one App Builder workspace. Once the integration is installed
into Commerce, Demo Builder fills the ERP (the catalog's `fillsSystem: true` on the
integration; see "Filling the ERP"), so the ERP holds Commerce's products, companies and
inventory sources before anyone opens it. A fill that fails does not undo the add: the
integration's card says the demo data did not load, and why. Removing the integration first
calls its `erp/detach`, which undoes the company credit limits, company blocks and ERP order
numbers it wrote into Commerce (Commerce keeps the order notes; it cannot delete them); then
it uninstalls the integration from Commerce and deletes the ERP's records (the ERP's
`POST admin/wipe`, declared as `wipe` in the catalog; its order-number counters and settings
stay). Only then does it undeploy the integration and the ERP. Removing the ERP does the
same: it removes the integration, which takes the ERP with it. The ERP is never offered on
its own. The integration is added once; more ERPs are added from its card (see "Several
ERPs"), and removing the integration removes every one of them.

Those three clean-ups live in code the undeploy deletes, so if any of them fails, **nothing
is removed**: the removal stops, the reason is saved on the component (`removalStopped`),
and the card reads **Removal stopped** and opens a confirm. Remove again retries; **Remove
anyway** (`remove_integration` with `force: true`) undeploys regardless and reports what
stays behind: the changes in Commerce, the webhooks and event subscriptions, or the ERP's
records, which would then come back on a re-add. A Runtime package either undeploy left, an
ERP that failed after its integration was removed, and a missing local folder are reported
beside a removal that goes ahead.

The link between the two is stored on the project (`systems` on the integration, `usedBy`
on the ERP), so removal and the cards follow it rather than the catalog. A project saved
before links were stored reads the catalog pairing until its next add.

## On the dashboard

The pair is two cards, the ERP's right after the integration's. Each shows its own
status and the other's name behind a link icon; the ERP's card carries an **ERP** badge,
from the catalog's `systemType`, beside the name the SC gave it. Each flyout has a row
(**Uses** on the integration, **Used by** on the ERP) whose name opens the other card.

The ERP's kebab offers **Open** (its screen), **Load demo data** (fills the ERP from
Commerce as it stands, with no confirm since it removes nothing; a value changed by hand
in the ERP goes back to Commerce's), **Reset records** (confirmed: it wipes the
ERP, fills it from Commerce again, and undoes the credit limits, blocks and ERP order numbers the
ERP wrote into Commerce; this and Load demo data are offered only while both cards are
deployed), **Redeploy** and
**Remove**. The integration keeps its own verbs; its **Open Commerce Admin** opens the Admin
UI SDK screen. Remove on either card names both. The screen's count names the kinds once a system is
there ("1 integration · 1 system"). The dashboard's Integrations tile counts the ERP's card
too: its dot shows the worst status across both, and turns amber for a removal that
stopped.

## Where the ERP's answers reach a shopper

The ERP is an internal system. Only the integration calls it, server-side, with a token it
mints per call from the workspace's own credential; nothing else — not the browser, not the
API Mesh — has a way in, and none is added. Whatever the ERP decides is written into
Commerce, and the storefront reads Commerce, the same for every channel.

Prices are synced ahead, never asked on a cart change (owner, 2026-09-28;
`.rptc/plans/several-erps/pricing-and-live-checks.md`). The ERP holds price lists, per
customer or per price group, with dated lines and quantity breaks. The integration publishes
the prices in force for each customer into that company's own shared catalog, as tier prices
(`erp/prices`), after every fill and whenever the ERP changes a price list; each ERP writes
and removes only its own products' prices. The cart, the listing and the product page all
price from Commerce, so the buyer sees the company's price everywhere and checkout never
waits on an ERP. There is no cart webhook: the two that priced the cart (contract price and
discount ceiling) were removed with AB-26z.

Promotions stay in Commerce, and the two kinds reach the ERP's sales order differently
(AB-16l; commerce-erp-integration, src/lib/order-sync.js). Tell the SC before a promotion demo:

- A **catalog price rule** arrives as a **lower price**. Commerce applies it before the
  cart, so the order line's price already includes it, and the ERP shows no discount.
- A **cart price rule** arrives as a **line discount**. The line keeps its price and carries
  the amount taken off, so the ERP's order shows the promotion and adds up to what the buyer
  paid. This needs the integration from `030bc88` on, redeployed and reinstalled, because the
  order event must carry each line's `base_discount_amount`.
- A catalog price rule aimed at an ERP-priced company's customer group competes with the
  ERP's price: by default Commerce charges the lowest of the two. With **Apply Catalog Price
  Rule on Grouped Price** on (Sales > Promotions), the rule discounts the company's quantity-1
  ERP price instead. Aim campaigns at groups the ERP does not price, unless that competition
  is what the demo shows (`.rptc/plans/several-erps/pricing-strategy.md`).

Live calls happen once per owning ERP, at checkout, for the decisions that must be current:
credit (can this company carry this order, AB-20) and availability (can this ERP promise this
quantity, AB-19). Neither is built yet. Each will have a time limit and a fallback: an ERP
that is slow or down accepts the order, holds its part, and sends it when it is back.

Not done, on purpose: a live price on the product page (it would put the ERP in front of
every product view, and a price that arrives by another route can disagree with what
Commerce charges), the ERP behind the API Mesh (the mesh composes customer-facing services,
and reaching the ERP from it needs a credential the ERP should not have), and custom
storefront drop-ins (Adobe's guidance is to extend a drop-in with a component using the
storefront's own tools; a drop-in from another release blank-pages the site).

## Updating the pair

Opening the integrations screen checks, in the background, whether either app has newer
code: a `git fetch` of its branch in its folder, which moves nothing the SC can see, plus a
comparison of the folder's app version with the one installed in Commerce. A card with an
update reads **Update needed**, and **Update** leads its kebab — also on a card whose last
deploy failed, since Update redeploys too. The pair updates as a unit from **either** card:
the ERP first when it has newer code, then the integration when it does; a failed ERP update
stops there. Each folder is fast-forwarded (never re-cloned), its dependencies installed, and
the app redeployed. The integration's redeploy
upgrades it in Commerce. Update refuses, naming the files, when a folder holds the SC's own
edits; **Redeploy** still deploys a folder as it is.

When Commerce will not upgrade the integration in place, the screen opens a confirmation
offering **Reinstall in Commerce**: uninstall, then install the version already deployed.
The kebab keeps offering it until it has been done, and nowhere else.

## Several ERPs

The integration serves a list of ERPs (design v1, `.rptc/plans/several-erps/design.md`),
kept in its App Builder State and read and replaced through its `erp/erps` action. Each
entry is `{ id, name, adapter: "demo-erp", connection: { baseUrl }, settings? }`. With no
list stored (an install without Demo Builder, the pair-in-a-box tests), the integration
serves one ERP, id `erp`, from its deploy settings.

**Adding one.** The integration's card offers **Add another ERP** once the integration is
deployed (the catalog's `addOnce` on the integration, `listedAs` on the ERP). It asks for a
name that no ERP in the project has, compared without case — made to end in "ERP" first, so
"Brand B" is added as "Brand B ERP" — and which products belong to it
(below), then (`erpAddHandler.ts`):

1. adds a demo-erp system `demo-erp-2` (then `-3`, …) in an Adobe workspace of its own, named
   for it, and deploys it with `ERP_DISPLAY_NAME` = the name and `ERP_ID` = its id;
2. links it to the integration (`systems` / `usedBy`) and sends the integration the whole
   list (`PUT erp/erps`, `erpListSync.ts`), keeping the settings each ERP already has there;
3. saves each ERP's ownership rule onto its entry (`PATCH erp/erps`, `erpOwnershipSync.ts`):
   the new ERP's, and an existing ERP's when it still owned everything;
4. fills it from Commerce with that ERP's own settings (`GET erp/settings?…&erp=<id>`), and
   merges its key map rows, each carrying `erpId`, into the map the integration holds.

A list that cannot be sent, or a rule that cannot be saved, fails the add with the ERP left
deployed; adding again with the same name finishes it (no second deploy). A fill that does not
finish is said, and Load demo data on the ERP's card runs it again.

**Which products it owns** (AB-64). The dialog asks one question, "Which products belong to
this ERP?", with three answers, each showing how many products it would give (counted in the
dialog from one products read, by the fill's own predicate, `erpOwnership.ts` →
`ownershipFilter`):

| Choice | Saved on the ERP's entry | Owns |
|---|---|---|
| Sold on these websites | `structure_owns: websites`, `structure_owns_websites: <codes>` | a product sold on one of the websites (`extension_attributes.website_ids`, mapped to codes through `store/websites`) |
| Carrying this attribute | `structure_owns: attribute`, `structure_owns_attribute: erp_owner=<its list id>` | a product whose attribute holds the value |
| Stocked in these inventory sources | `structure_owns: sources`, `structure_owns_sources: <codes>` | a product with stock in one of the sources |

The hint above the choices is the question that decides: should one order ever be split
between ERPs? No → websites. Yes → attribute or sources. The default (`defaultOwnsRule`): with
more than one website and at least one not yet named by another ERP's rule, "Sold on these
websites" with the first such website ticked; otherwise the attribute. Once there are two ERPs
each owns only what its rule says, so an existing ERP whose rule is still "all" is shown the
rule it is given (`existingRulesToChange`: the websites left over when the new ERP is split by
website, else its own attribute) and both are saved together. The existing ERP is not refilled
by the add; its products change at its next Reset ERPs or Load demo data, which the dialog and
the answer say. `add_erp` takes the same choice as `owns` and applies the same default without
it.

**Its look.** The ERP picks its starting theme from a hash of its list id (demo-erp
`lib/appearance.js` `themeForErpId`) and cannot see the other ERPs, so two can start alike
(`justrite` and `accuform` both hash to Foundry). Once the new ERP is deployed and linked,
before the list is sent, the add reads every ERP's look (`GET health`) and, when the new
one's colour is another ERP's, gives it the first theme no other ERP shows, in the ERP's own
order Harbour, Meridian, Granite, Foundry (`erpTheme.ts`, `erpAddTheme.ts`; written through
the same handler as `set_erp_appearance`). Colour is the comparison because every theme has
its own and it is what makes two screens look alike. With all four in use it is left as it
is. Only an ERP this add deployed is touched, so a retried add never replaces a look someone
set. The answer's `theme` says the theme given; a look that could not be read or written is
the add's warning, and the add stands.

**Its credential.** Each added ERP lives in its own Adobe workspace and accepts machine
calls only from that workspace's own technical account, so the integration cannot reach it
with its own credential (401 "Technical account mismatch"). Every time Demo Builder sends the
list on an add, each added ERP's entry carries its workspace's server-to-server credential as
`connection.auth` (`erpCredential.ts`, `erpListSync.ts`); the first ERP, which shares the
integration's workspace, never does. The credential is never stored in the project or any
file, never logged, and never returned to a webview or an agent; the integration never
answers it back. If it cannot be read, the list still goes without it and the add says so.
Adding again with the same name re-sends the list with it, which is how an ERP added before
this existed gets its credential.

**Its events.** The other direction has the same mismatch. The integration's ingestion web
action is `require-adobe-auth` in the INTEGRATION's workspace, and an added ERP would
otherwise post to the ingestion address in its own namespace, where nothing listens. So every
deploy of an added ERP (add, redeploy, update) is given `EVENTS_WEBHOOK_URL`, the
integration's deployed `…/ingestion/webhook` URL, and a publishing credential read from the
integration's workspace: `EVENTS_AUTH_CLIENT_ID`, `EVENTS_AUTH_CLIENT_SECRET`,
`EVENTS_AUTH_ORG_ID`, `EVENTS_AUTH_SCOPES` (`erpEventsDelivery.ts`). They travel as the
screen key does, in the deploy's process env only; the ERP signs its event posts with them
(demo-erp `lib/events.js`). The first ERP gets none of them. An integration with no ingestion
address yet, or a credential that cannot be read, deploys the ERP as before and says so; its
events wait in its outbox until it is redeployed.

**Its id.** An ERP's id in the list is its name, slugged — `Northwind ERP` → `northwind`,
numbered when another ERP here has it — derived when it is added, recorded on its component
(`listId`) the first time it deploys, and never rewritten: it is on every product it owns,
every key-map row and every event, so a rename moves the label only (`erpListId.ts`, AB-51).
It is sent as `ERP_ID` on every deploy, and a product goes to an ERP when its `erp_owner`
attribute holds it. Until 2026-09-30 the integration's own ERP was the literal `erp` and an
added one its component id — two kinds of id, neither naming the ERP. The ERP its
integration brings is still told apart from one added from the card (`broughtByItsIntegration`:
it shares the integration's workspace and answers its credential), by the pairing, not the id.

**Filling and resetting.** Load demo data and Reset records on the integration, and their
agent tools without `erp`, cover every ERP: the reset undoes the integration's Commerce
writes once, then wipes and fills each ERP. Load demo data and Open on one ERP's card reach
that ERP only.

**An undo that takes longer than a minute** (AB-61). The undo is the integration's
`erp/detach`, a web action: its answer is cut off at 60 seconds with a 504 while the action
itself runs on, up to 300 seconds. So Demo Builder sends every `POST erp/detach` with a `run`
id of its own. When the answer is cut off and `erp/status` says `detachRuns: true`, it shows
"Still undoing the ERP's changes in Commerce" and reads `GET erp/detach?run=<id>` every five
seconds until the run is `done` (its `result` is the report the POST would have answered) or
`failed` (its `error` is the reason). After 330 seconds it stops and says the integration is
still undoing and to try again in a few minutes; nothing has been wiped at that point. An
integration that does not answer `detachRuns` is never read this way, because one deployed
before it would run a second detach on the GET; there the 504 is reported as it is. Removing
the integration follows its undo the same way (`erpDetachRun.ts`).

**Removing one.** Remove on an added ERP's card takes it off the integration's list first
(the list without it), then wipes its records, undeploys it and deletes its workspace. If the
list cannot be sent, nothing is removed, and Remove anyway goes on without it. The
integration's own ERP still goes only with the integration.

**Before several ERPs can be shown**, the integration's setup checklist asks for the
`erp_owner` (a Text Field) and `brand` product attributes, the "Partially Held" order status
(`partially_held`, on Processing and Pending) and Payment on Account for the website. Demo
Builder checks all of them: the statuses through `GET /V1/order-statuses`, the payment setting
through `GET /V1/system/config` at the website (`setupConfigChecks.ts`). The same read checks
the storefront returns switch (`sales/magento_rma/enabled`).

**Before a price the ERP grants for one website can show on that website only** (AB-46), the
checklist asks for Commerce's Catalog Price Scope to be Website (Stores > Configuration >
Catalog > Catalog > Price). The ERP publishes a company's prices into its shared catalog per
website — each tier price carries a website — and at the default scope, Global, Commerce
ignores that website and every site shows the same prices. The SC sets it once in the Admin;
Demo Builder checks it by reading the setting through `GET /V1/system/config`.

**For a demo where the buyer pays by card**, the checklist has an optional step: switch on
Payment Services, Commerce's own card payments (powered by PayPal), for the project's website.
Demo Builder checks it by reading `payment/payment_services/active` at the website. Payment
Services needs its own sandbox onboarding (Sales > Payment Services > Sandbox onboarding, with a
PayPal sandbox business account) before it can be switched on. An optional step is still listed,
checked and marked like any other, but while it is open it is not counted as left to do: the
card's "Demo setup" line, the flyout's Next step and the guide's opening step all pass over it.

## Filling the ERP

Demo Builder fills the ERP itself (AB-26y, 2026-09-27): it reads the project's Commerce
(websites, companies, customers, products, and each product's stock at every source), asks
the integration for its resolved settings per website (`GET erp/settings?websites=`), and
sends the records to the ERP's `POST admin/import` in batches of 25 products
(`erpFill.ts`, wired for a project by `erpFillForProject.ts`). It runs in three places, all
the same call: after the add, inside **Reset records** (undo the ERP's writes in Commerce,
then the ERP's `admin/wipe`, then the fill), and as `load_erp_demo_data`. After the records
are in, the fill pre-fills the integration's mapping (AB-26y, `erpFillMapping.ts`, wired by
`erpMappingAfterFill.ts`): it reads the ERP's own sales organizations (`GET settings/setup`
on the ERP, each naming the website it serves) and saves each website's sales organization
and its name onto that ERP's entry in the integration's list (`PATCH erp/erps` with
`website`), **only where none is set** for that ERP, at the website or on the entry itself.
A value set on the Admin page is never replaced. The answer's `mapping` block says what
happened: `filled` and `kept` (rows of `{ erp, website, salesOrg }`; a kept row adds
`erpSalesOrg` when the ERP names a different one), `skipped` (the ERP names a website
Commerce does not have) and `failed` (a save the integration refused, also said in
`warning`; the fill still stands). An integration deployed before `erp/erps` is skipped
with a progress step and no block. Every fill then ends by
asking the integration to publish that ERP's prices into the companies' shared catalogs
(`POST erp/prices` with the ERP's list id); the answer carries the counts (`prices`:
written, removed, unchanged, skipped). A publish that fails does not fail the fill: the
answer's `warning` says so in plain words, and Load demo data again retries it. An
integration deployed before it had `erp/prices` is filled without it, silently. Because it runs in
the extension, it has no one-minute web-request limit. Last, it hands the integration its key map
(`PUT erp/keymap`: which Commerce company is which ERP customer), the way a key map is loaded
at a go-live; an integration deployed before it had `erp/keymap` is filled without one, and
the progress says so. The ERP itself holds no Commerce id (its contract version 3): the customers
the fill sends carry no Commerce company id, customer group, email domain or website, and
orders and prices name the customer only by the ERP number the integration finds in the
key map. Measured on Bodea: 4 customers and
182 products in 2m15s, the same records the integration's mirror produced.

The integration's own copy (`erp/mirror`, its worker `erp/mirror-job`, and the **Sync
records** buttons on the ERP's Settings page and the Commerce Admin page) still exists and
is removed next; after that, a change reaches the ERP only through Commerce's events.

## Why the ERP's screen is served by an action

Both apps deploy into the same Runtime namespace, and a namespace has one static site.
`aio app deploy` empties that site before uploading (`aio-lib-web` `deploy-web.js`), so two
apps with web pages delete each other's. The integration keeps the static site, because
Commerce Admin loads its page from there. The ERP serves its page, script and stylesheet
from its `screen` web action instead, one file per response (Runtime returns at most 1 MB
per result).

That action has no Adobe sign-in. Its data calls need a key that Demo Builder generates on
the ERP's first deploy (catalog `screen.keyEnvVar`, `ERP_SCREEN_KEY`), keeps in VS Code's
secret storage, passes in the ERP's deploy env, and deletes when the pair is removed. **Open
ERP** adds the key to the link in the extension (`systemScreen.ts`), so it never reaches a
webview, a log, the project file or an agent. An ERP deployed before the screen existed
answers "Redeploy it to add one."

**One typed name names the pair** (`pairNames.ts`). The SC types a brand when the pair is
added; a trailing "ERP" or "Integration" is dropped, and the rest names both: "Justrite" (or
"Justrite ERP Integration") gives the integration **Justrite Integration** and its ERP
**Justrite ERP**, and nothing typed gives **Acme Integration** and **Acme ERP**. The add screen
previews both. The dashboard add, `add_integration` and the wizard all record the two names
the same way, as the integration's inputs `INTEGRATION_DISPLAY_NAME` and `ERP_DISPLAY_NAME`.

The ERP's name is an input of the ERP integration ("ERP name"). The ERP reads the
integration's value, so the name is set in one place; it names the ERP's row and the ERP
calls itself that. It is fixed once the pair is added: a different name means removing the
pair and adding it again (Settings refuse it).

The integration has a name of its own (`INTEGRATION_DISPLAY_NAME`, "Integration name";
AB-16o), never its ERP's: its card, and Commerce Admin's menu entry, page
title and App Management app name. Commerce's order column reads "ERP order" and the product
action "Move stock between ERP warehouses", since both are about every ERP. The name changes
by a **rename** (the pencil beside it, or `rename_integration`), which sets the input as well
as the card. Commerce's labels are fixed when the app is deployed, so a new name reaches
Commerce on the integration's next update or redeploy; the rename says so and runs neither. A
project made before this has no value for the input: its integration keeps the name its card
already shows ("Northwind ERP Integration"), and its next deploy sends that name to Commerce.
The ERP cards' **Used by** row follows the integration's name. Configure Project holds project
settings only (AB-21).

## For agents

`get_erp_status` reads the ERP's health as the integration sees it plus both rows.
`get_erp_record` reads one product (by SKU) or one company (by Commerce id) as both
systems hold it, field by field, and `get_erp_order_trace` reads one Commerce order's whole
life across Commerce, the integration and the ERP (the Admin page's lookup card and Follow
an order, 2026-09-24). They exist because an agent validating the pair could read Commerce
products through GraphQL but had no way to see a B2B company, its credit, or an order.
`run_erp_rest` reads any of the ERP's own routes (partners, products, pricing, orders,
shipments, invoices, settings, health, search) and `write_erp_rest` (confirm-gated, with a
consent dialog naming the method and route) takes the actions its screens take — confirm,
ship, invoice, hold, a price or credit change — so the ERP → Commerce half runs without the
screen. `list_runtime_activations` and `read_runtime_activation` read what RAN in the pair's
Runtime namespace and one activation's log. One thing they cannot show, per Adobe's Runtime
logging guide: a successful blocking web-action call leaves no activation record unless it was
sent with `X-OW-EXTRA-LOGGING: on`; failures and timer runs always do. A missing row is "no
failure recorded", never "did not run" — which is what `invoke_runtime_action` is for: it runs
one deployed action with a payload (an event handler's `{data:{value}}`, a webhook's cart) and
answers the whole record, result and log lines, of the run it started. The list takes
`failedOnly`, `since` and `skip`, and hides the timer firings unless asked. Beside them, `run_commerce_rest` and `write_commerce_rest` reach the
Commerce REST API for the same instance (AB-29).
`get_integration_settings` reads the integration's settings, and `set_integration_settings`
changes a text setting and redeploys; a secret setting is entered on the
tile, never passed to a tool.
`open_erp_screen` (confirm-gated, like `open_url`) opens the ERP's screen; it answers the
address and never the key.
`reset_erp_records` (confirm-gated, with a consent dialog) runs the reset for every ERP, and
`load_erp_demo_data` fills every ERP (or the one named by `erp`); both end by publishing each
ERP's prices into the companies' shared catalogs. There is no tool of its own for prices: they
are published by the fill and by the ERP's own change events.
`add_erp` (confirm-gated) adds another ERP by name, with `owns` saying which products it owns
(the dialog's choice; omitted, the same default); `remove_integration` on its id removes it
alone. The tools that act on one ERP take `erp`, its component id. The existing
`add_integration`, `deploy_integration`, `redeploy_integration` and `remove_integration`
cover the pair by id; `add_integration`'s `name` names the first ERP, the same field the add
dialog's name fills, so an agent asks for it before the add (AB-67); `remove_integration` on either one removes the integration and every ERP, and stops with the
error code `COMPONENT_REMOVAL_STOPPED` when a clean-up fails (`force: true` goes ahead).
`check_integration_updates` records which apps have newer code, `update_integration`
updates the pair (the ERP first), and `reinstall_integration` (confirm-gated) is refused
unless Commerce refused an upgrade.

## The demo script (acceptance, step 06 of the plan)

Add the tile to a project on a Commerce instance; the ERP screen lists the instance's
products and companies. Place an order; it shows the ERP number. Ship it in the ERP; the
Commerce order follows. Change a price and a stock figure in the ERP; the product follows.
Give a company a price list in the ERP; that company's shared catalog carries the price, so
its buyer sees it on the listing, the product page and the cart. Block a company in
the ERP; the Commerce company stays active, its open orders go On Hold and its next order waits
there; open the company again and they are released. Reset; the ERP is filled again.
Remove the integration; both apps are gone and Commerce is clean.

## What live testing taught (2026-09-24 and 25)

The pair was run against a real Commerce as a Cloud Service instance through this extension's
agent tools only. The lessons, each with the test that pins it and the document a person reads,
live in the integration's own ledger: commerce-erp-integration, docs/live-validation-learnings.md.
A test there fails when a cited test disappears from its suite. The short list, for a reader
of this document:

- Commerce on the sandbox dispatches only priority event subscriptions; every event the pair
  subscribes is priority. When events "do not arrive", read the registration's debug tracing
  in the Developer Console, not the Event Browser.
- Runtime does not record a successful blocking activation unless the request asks for it, so
  a missing row in list_runtime_activations is "no failure recorded", never "did not run".
- An order placed through the REST cart arrives with Commerce's new-order flag false; the
  handler decides by whether the ERP already has the order.
- A customer group cannot name a company (every company sits in General unless a shared
  catalog assigns a group); the order carries the buyer's company id, and the demo setup guide
  requires one group per demo company.
- The Commerce client library's request timeout defaults to ten seconds; the pair waits thirty.
- An order-status comment sets only a status of the order's current state, and Pending leaves
  only by invoice or shipment, so "confirmed in the ERP" is a note plus an optional custom
  status the SC assigns to Pending. The setting that promised Processing was replaced.
- Ship, invoice, cancel, hold and release match Adobe's REST tutorials; a full shipment plus
  an invoice completes the order.

Proven live in both directions: product save, order placement with write-back, credit limit
and block, confirmation note, credit rejection (cancels the order), shipment, invoice, and
Commerce's own shipment event matched on the ERP order. Not yet: a storefront order, a real
over-limit credit hold round trip, remove_integration reverting the ledgered writes, and a
fresh add's first sync.

## Not in the first cut

Individual shoppers as ERP contacts (that is a CRM), a Commerce event for companies (the
integration refreshes partners every minute instead), product deletes reaching the ERP (a
reset clears them), and the ERP order number as a column in the Commerce Admin's order grid.
