# ERP night loop — 2026-09-28 (owner asleep)

Running report, updated at every step. Plain English. Newest at the bottom of "Progress".

## The plan
1. Event check: does the order event carry the per-line nominated warehouse? Then clean up Bodea.
2. B6 — "Add another ERP" in Demo Builder (+ agent tool, + setup checklist steps).
3. B7 — the integration's Admin page: each order's parts per ERP, Re-send, several-ERP header.
4. B8 — live on Bodea: merge to main, deploy, add a second ERP, brands and owning ERPs on a few products, the vignettes with test orders, clean up.
5. Live check journeys for every entity.
6. If time: credit memo + repeat order (AB-26r); returns across ERPs as a design only; Phase C1 screen listing (no visual changes).

## Rules
Full tests before every commit. Bodea only; never signs in; never deletes a workspace or project. A deploy or live test that fails twice stops that item.

## Progress
- Loop started. Event-check deploy running; B6 being built.
- B7 (the Admin page) started in parallel: it lives in the integration, B6 in Demo Builder.
- Owner added (while awake): after all this work, delete Bodea, clean Commerce, rebuild from
  the setup guide as an SC would, then walk the journeys. Drafted tonight:
  `.rptc/plans/several-erps/fresh-start.md` (what removal undoes, what it does not, the
  clean-up list, the rehearsal steps) and `.rptc/plans/several-erps/journeys.md` (nine
  walk-through journeys from the vignettes, each with what to show and what to say).
- Event check: Bodea's integration updated to the logging version (main `2434ad2`). The first
  test cart failed ("ERP discounts are unavailable") right after the deploy: the cart checks
  were still starting. A retry placed order 3000000017. Recorded as a setup note (warm up after
  a deploy).
- The shell permission checker stopped answering (a temporary outage on its side) while
  reading the event log; file work continued. The event result follows once it is back.
- Event check answered: **no**. The order event cannot say which warehouse was chosen for each
  line. The integration's subscription asks for five line fields only (item id, SKU, quantity,
  price, parent), and an event carries only what its subscription asks for; Commerce's event
  field list has no warehouse field for the order. Same as the REST finding. Routing by the
  `erp_owner` product attribute stands. (Successful handler runs do not show in the Runtime
  run list, so the logged line itself could not be read; the two failures that do show are the
  known write-back echo.) The diagnostic log on the integration's main can go at the B8 merge.
- Bodea clean-up: Kukla Studios' $120 test charge reimbursed (balance 0). Recorded in
  `fresh-start.md`.
- B8 started. The integration's work branch took main's three commits (all already superseded
  there: the cancel fix in its per-ERP form, two diagnostic logs dropped), passed 644 tests and
  lint, and both repos' main now equal their work branches (integration `f149a6f`, ERP
  `1e65217`, 264 tests). Deploying to Bodea: the ERP first, since the new integration expects
  the ERP's contract version 5.
- **B6 shipped** (Demo Builder, pushed with the full gate: 1,735 suites). "Add another ERP" on
  the integration card: a unique name, a new mock ERP in its own workspace, the integration told
  the full list, the new ERP filled. Adding the integration twice from the gallery is refused
  and points there instead. Remove on an added ERP removes only it. Three setup steps added:
  the two product attributes (checked), the Partially Held status and Payment on Account
  (ticked by hand; Commerce's API cannot show them). Agent tool: `add_erp`. Not yet run live.
- B6 found a gap in the integration, fixed tonight (`d6ef93c`, 649 tests): a first ERP deployed
  before events carried an ERP id sends none, and once a second ERP was listed its credit and
  block events were refused. They now count as the first ERP's. Bodea's ERP is exactly that case.
- ERP deployed to Bodea (the deploy call outlasted its 25-minute wait, but the extension now
  reports no pending ERP update). Integration deploy running.
- Commerce set up for the two-ERP test, following the setup guide: `erp_owner` created (Text
  Field, Default set; `accesspoint`, `switchlite8`, `switchenterprise8` = `erp`), and the
  Partially Held status created and assigned to Processing and Pending (Admin, since REST cannot
  create statuses). Found: Bodea already had a `brand` attribute from its sample catalog; the
  guide now says to reuse one, and the clean-up list says not to delete it.
- Integration deployed to Bodea (again past the 40-minute wait; the extension reports no update
  pending for either).
- **B8 live: the second ERP.** Demo Builder rebuilt and reloaded with B6. `add_erp` "Contoso ERP"
  deployed Contoso in its own workspace in about a minute, then stuck: the add republished the
  storefront, the DA.live session had expired, and it waited on a sign-in prompt in the window.
  Two Demo Builder fixes, gated and pushed:
  - `9577fd3` only a component that feeds the storefront republishes it (the check read the
    whole project, so on any project with a mesh every add and redeploy republished; this is
    also why tonight's deploys seemed to take 25–40 minutes);
  - `bf2a89c` adding an ERP again finishes one that stopped between its deploy and its link
    (before, the retry was refused as a duplicate name).
  Added again: the integration now lists both ERPs (`erp`, `demo-erp-2`) and Contoso is filled.
- **Mixed order 3000000018** (an access point and a server): Northwind got only the access
  point (sales order 0000001008). Routing by `erp_owner` works live.
- **Contoso refuses the integration (401).** Adobe's check on Contoso's actions says "Technical
  account mismatch": an ERP accepts machine calls only from its own workspace's credential, and
  the integration has only Northwind's workspace credential. So with each ERP in its own
  workspace (the owner's choice), the integration needs each ERP's credential. **Your
  decision** (see the walkthrough queue). Cart pricing for Contoso's products is refused the
  same way (the cart still went through).
- That refusal exposed two integration defects, fixed (`a926063`, 655 tests), deploying now:
  - a part its ERP refused was dropped: the order stayed Pending, no Partially Held, no
    Re-send, and the event counted as done. It is now failed and open: Partially Held, and
    Re-send works on it;
  - the order event carries no order id (its subscription names none), so the router never
    recorded a company's orders or wrote any status at order time; only the tests' made-up
    orders had one. The router now looks the id up.
- Also found, not fixed: the fill copies the whole Commerce catalog into every ERP, not only
  the products it owns; `get_erp_status` reports live figures for the first ERP only.
- Router fix deployed to Bodea (`d6ef93c` → `a926063`); the deploy returned normally in
  minutes, with no republish hang. The live check of it stopped: carts holding Contoso's
  products fail (3 tries), because Contoso refuses the cart price check too and Commerce runs
  every cart webhook as required. A Northwind-only order went through (3000000019). The fix is
  proven by its tests (655), not yet live; it needs Contoso to accept the integration first.
- Stopped B8 here, by the loop's rule (a live test failing twice stops the item).

## Walkthrough queue (your decisions, in order)

1. **How the integration signs in to an ERP in another workspace.** Each ERP accepts machine
   calls only from its own workspace's credential. Options:
   - **Recommended: each ERP entry carries its own credential.** Demo Builder hands the
     integration the new ERP workspace's server-to-server credential when it adds the ERP; the
     adapter signs each call with that ERP's credential. This is what a client's integration
     does (one API credential per ERP), and it keeps one workspace per ERP. Cost: a secret per
     ERP stored by the integration (App Builder State), and removal must delete it.
   - Deploy added ERPs into the integration's workspace. Works at once, but reverses your
     one-workspace-per-ERP decision (own screen, own look stay; own workspace goes).
2. **What a buyer sees while one brand's ERP is down.** As built, a down or refusing ERP stops
   checkout for its products (the cart price check is required), so vignette 6 ("the buyer
   places one order as usual") cannot happen. Either the price check lets the cart through at
   list price when that ERP is down (and the order goes Partially Held), or the vignette
   changes to "that brand's products cannot be bought until its ERP is back".
3. **The fill copies the whole catalog into every ERP.** Should an added ERP hold only the
   products it owns (`erp_owner`)? The design says each ERP receives only its own.
4. **Merge** the three branches when you are happy (Demo Builder `feature/erp-integration`,
   the two ERP repos' loop branches; the ERP repos' `main` already carry tonight's work).

## Left on Bodea from tonight
- Contoso ERP (`demo-erp-2`) in its own workspace, listed with the integration. Removing it
  deletes that workspace, which the loop may not do; it stays for your decision.
- Test orders 3000000018 (Northwind part sent; Contoso part refused under the old code) and
  3000000019 (Northwind only), guest, check/money order. Northwind has their sales orders
  0000001008 and 0000001009 (checked); Reset records clears them.
- `erp_owner` values, the `east` stock rows and the Partially Held status: all listed in
  `fresh-start.md`.
