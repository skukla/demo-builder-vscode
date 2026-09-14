# The ERP integration

The first pre-built integration in the catalog (2026-09-14). One tile in the Integrations
gallery, "ERP integration", gives a project two things it can show on stage: an ERP
modelled on SAP, with its own screen, and an Adobe Commerce integration to it built on
Adobe's Commerce integration starter kit. The design record is
`.rptc/plans/erp-integration/overview.md` (decisions 1 to 22).

## What the SC gets

- **An ERP that appears to be the master.** Products, business partners (Commerce
  companies), contract prices and sales orders, on a React Spectrum screen hosted in the
  project's App Builder workspace. Every record is transient: reset wipes them and mirrors
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

They are a **unit**. Adding the integration adds and deploys the ERP first, then the
integration, into the project's one App Builder workspace. Removing the integration
uninstalls it from Commerce, undeploys it, then undeploys the ERP. The ERP is never offered
or removed on its own; asking to remove it alone is refused in words. The ERP's records
outlive an undeploy in the workspace's database; a re-add starts with a reset.

## On the dashboard

The integration's card carries the ERP: the card's status is the worse of the two, and
its flyout has a second section under the ERP's name with its status, its screen and its
last deploy. The kebab offers, after the integration's own verbs, **Open ERP**, **Reset ERP
records** (confirmed: it wipes the ERP, mirrors Commerce again, and undoes the credit limits,
blocks and ERP order numbers the ERP wrote into Commerce) and **Redeploy ERP**. The
integration's **Open Commerce Admin** opens the Admin UI SDK screen. Remove on the card names
both.

The ERP's name is an input on the tile ("ERP name", default Acme ERP), editable in Configure
Project; it names the ERP's row and the ERP calls itself that.

## For agents

`get_erp_status` reads the ERP's health as the integration sees it plus both rows.
`reset_erp_records` (confirm-gated, with a consent dialog) runs the reset. The existing
`add_integration`, `deploy_integration`, `redeploy_integration` and `remove_integration`
cover the pair by id; `remove_integration` on the ERP alone is refused.

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
