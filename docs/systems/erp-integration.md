# The ERP integration

The first pre-built integration in the catalog (2026-09-14). One tile in the Integrations
gallery, "ERP integration", gives a project two things it can show on stage: an ERP
modelled on SAP, with its own screen, and an Adobe Commerce integration to it built on
Adobe's Commerce integration starter kit. The design record is
`.rptc/plans/erp-integration/overview.md` (decisions 1 to 22).

## What the SC gets

- **An ERP that appears to be the master.** Products, business partners (Commerce
  companies), contract prices and sales orders, on the ERP's own React Spectrum screen.
  Demo Builder opens it in a private browser window. Every record is transient: reset wipes them and mirrors
  the Commerce instance again. Commerce is the master the SC prepares in; the ERP adapts.
- **Data flowing both ways.** An order placed on the storefront gets an ERP order number;
  marking it shipped, invoiced or cancelled in the ERP reaches the Commerce order. A price
  or stock change in the ERP lands on the Commerce product. A company's credit limit or
  block set in the ERP lands on the Commerce company. A contract price for a company
  applies in that company's cart, with a discount ceiling.
- **A screen inside the Commerce Admin** (Admin UI SDK), showing the integration's health
  and its sync log.

## The two components

| | `demo-erp` (the ERP) | `erp-integration` |
|---|---|---|
| Catalog kind | `system`, bound to `erp-integration` | `integration`, extension layout, App Management lifecycle |
| Repository | `skukla/demo-erp` | `skukla/commerce-erp-integration` |
| Provides / consumes | provides `ERP_BASE_URL` | consumes `ERP_BASE_URL`; both take `ERP_DISPLAY_NAME` (default "Acme ERP") |
| Commerce install | none | yes, the starter kit's, after the deploy |
| Screen | its own, served by its `screen` action, opened with a key | the Commerce Admin page, on the workspace's static site |

They are a **unit**. Adding the integration adds and deploys the ERP first, then the
integration, into the project's one App Builder workspace. Removing the integration first
calls its `erp/detach`, which undoes the company credit limits, company blocks and ERP order
numbers it wrote into Commerce (Commerce keeps the order notes; it cannot delete them); then
it uninstalls the integration from Commerce and deletes the ERP's records (the ERP's
`POST admin/wipe`, declared as `wipe` in the catalog; its order-number counters and settings
stay). Only then does it undeploy the integration and the ERP. Removing the ERP does the
same: it removes the integration, which takes the ERP with it. The ERP is never offered on
its own.

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

The ERP's kebab offers **Open** (its screen), **Reset records** (confirmed: it wipes the
ERP, mirrors Commerce again, and undoes the credit limits, blocks and ERP order numbers the
ERP wrote into Commerce; offered only while both cards are deployed), **Redeploy** and
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

Live calls happen at DECISIONS, through Commerce webhooks. Cart pricing is the one built:
the totals collector calls two of this integration's actions for contract prices and the
discount ceiling. Both are optional (`required: false`), so an ERP that does not answer
leaves Commerce's own prices in place and the shopper sees no error. Two more are designed
and not built — availability and a credit check at order placement — and both are
`required: true`, because an over-limit order let through is not survivable the way a
missing discount is.

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
update reads **Update needed**, and **Update** leads its kebab. Update updates the ERP
first when the ERP has one, then the integration: each folder is fast-forwarded (never
re-cloned), its dependencies installed, and the app redeployed. The integration's redeploy
upgrades it in Commerce. Update refuses, naming the files, when a folder holds the SC's own
edits; **Redeploy** still deploys a folder as it is.

When Commerce will not upgrade the integration in place, the screen opens a confirmation
offering **Reinstall in Commerce**: uninstall, then install the version already deployed.
The kebab keeps offering it until it has been done, and nowhere else.

## Filling the ERP

**Sync records** copies Commerce's products and companies into the ERP. It is on the
ERP's own Settings page (kept off the Dashboard a prospect sees) and on the integration's
Commerce Admin page, beside Reset. Both call the integration's
`erp/mirror?background=true`, which starts the non-web worker `erp/mirror-job` and answers
202 at once, because a web request is cut off after one minute. The pages then watch the
ERP's last-import time, which only a full import moves (the integration's every-minute
partner refresh does not). **Reset ERP records** still mirrors inline after its wipe.

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

The ERP's name is an input on the tile ("ERP name", default Acme ERP), editable in Configure
Project; it names the ERP's row and the ERP calls itself that.

## For agents

`get_erp_status` reads the ERP's health as the integration sees it plus both rows.
`open_erp_screen` (confirm-gated, like `open_url`) opens the ERP's screen; it answers the
address and never the key.
`reset_erp_records` (confirm-gated, with a consent dialog) runs the reset. The existing
`add_integration`, `deploy_integration`, `redeploy_integration` and `remove_integration`
cover the pair by id; `remove_integration` on either one removes both, and stops with the
error code `COMPONENT_REMOVAL_STOPPED` when a clean-up fails (`force: true` goes ahead).
`check_integration_updates` records which apps have newer code, `update_integration`
updates the pair (the ERP first), and `reinstall_integration` (confirm-gated) is refused
unless Commerce refused an upgrade.

## The demo script (acceptance, step 06 of the plan)

Add the tile to a project on a Commerce instance; the ERP screen lists the instance's
products and companies. Place an order; it shows the ERP number. Ship it in the ERP; the
Commerce order follows. Change a price and a stock figure in the ERP; the product follows.
Add a contract price for a company; that company's cart prices from it. Block a company;
the Commerce company is blocked. Reset; the block is undone and the ERP is mirrored again.
Remove the integration; both apps are gone and Commerce is clean.

## Not in the first cut

Individual shoppers as ERP contacts (that is a CRM), a Commerce event for companies (the
integration refreshes partners every minute instead), product deletes reaching the ERP (a
reset clears them), and the ERP order number as a column in the Commerce Admin's order grid.
