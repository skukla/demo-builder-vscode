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
- Found: the fill gave every ERP the whole Commerce catalog. Routing's rule (a product belongs
  to the ERP its `erp_owner` names) and the fill's ("every product" when an ERP has no rule of
  its own) disagreed. Fixed in the integration (`18b6881`, 656 tests): with several ERPs an
  ERP's resolved settings carry routing's rule, so the fill agrees. Proven by tests; Contoso
  still holds the whole catalog from tonight's fill until its data is loaded again.
- Fixed and proven live: the Admin page and `get_erp_status` showed an ERP that refuses the
  integration as healthy (the ERP client never throws on an HTTP error). Both now say "not
  reachable" with Adobe's reason, and `get_erp_status` takes an optional `erp`, so an agent
  can read Contoso's health, not only Northwind's (integration `45daaca`, `a098aad`; Demo
  Builder `5434c0f`). Live: Contoso reads not reachable, 401, "Technical account mismatch".
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
3. **Merge** the three branches when you are happy (Demo Builder `feature/erp-integration`,
   the two ERP repos' loop branches; the ERP repos' `main` already carry tonight's work).

## Left on Bodea from tonight
- Contoso ERP (`demo-erp-2`) in its own workspace, listed with the integration. Removing it
  deletes that workspace, which the loop may not do; it stays for your decision.
- Test orders 3000000018 (Northwind part sent; Contoso part refused under the old code) and
  3000000019 (Northwind only), guest, check/money order. Northwind has their sales orders
  0000001008 and 0000001009 (checked); Reset records clears them.
- `erp_owner` values, the `east` stock rows and the Partially Held status: all listed in
  `fresh-start.md`.

## Design documents written tonight (for review, nothing built)
- `.rptc/plans/several-erps/returns-design.md`: returns across several ERPs. Recommends:
  the buyer asks for one return in Commerce; staff authorise it there; the integration splits
  it by the order's parts and each ERP credits its own lines; Commerce gets one credit memo per
  ERP; a refusing ERP's piece stays open with Re-send. Seven slices, R0 (live tests) to R6.
  Its author reports two things to check: Commerce's REST reference lists return endpoints
  (`/V1/returns`), which the locked design says do not exist (listed, not tried live); and a
  credit memo cannot be deleted, so a demo reset cannot undo one (a reversibility finding).
- `.rptc/plans/several-erps/c1-screen-listing.md`: all 50 surfaces an SC or merchant uses
  (Demo Builder, the Admin page in Commerce, the mock ERP screen, agent tools): 28 ready for
  several ERPs, 8 partly, 13 not. The Admin page is the weak spot (Overview, Lookup, History,
  Order trace, ERP-number column, Move stock assume one ERP). Also: Reset records wipes every
  ERP while its dialog names one; no agent tool can read or set an ERP's own settings; a second
  mock ERP starts with the first one's look and company code.

## Midday loop, 2026-09-28 (owner away about an hour)

**Summary.** Contract prices now flow from an ERP's price list into each company's shared catalog
in Commerce, proven live for both ERPs. Contoso, the second ERP, now answers the integration, and
a mixed order was split correctly across both. The failing Bodea carts are fixed.

- **AB-26z built and proven live.** A Northwind price list for Kukla Studios put 150 (and 140
  from 10 units) into its shared catalog; the catalog service showed 150 to that company's buyers
  about five minutes later; deactivating the list removed both within two minutes; another
  company's hand-set price was untouched. The old cart webhooks were removed by a normal app
  upgrade (the integration README said a reinstall was needed; corrected, with the measurement).
- **AB-16b closed.** With the cart webhooks gone, carts and orders work (5 of 5 carts; order
  3000000020).
- **AB-16a built and proven live.** Each ERP is signed in with its own credential. Contoso's
  health reads reachable (it answered 401 before). Order 3000000021: Northwind got only the
  access point (0000001011), Contoso only the server (0000001000). A Contoso price list reached
  Kukla Studios' catalog and was removed again.
- **Found and filed, not blocking:** AB-16g (Northwind's customer pairings were lost; a data load
  restored them; cause not found), AB-16h (integration paths that still reach only the first
  ERP), AB-16i (an added ERP's own events never reach the integration). AB-16h and AB-16i are
  being built now.
- **Also:** three integration actions were logging the integration's own secret at debug level;
  fixed.

**Your decisions:** none needed. When you are back: whether to merge `feature/erp-integration`
into `develop` again (it has AB-26z's and AB-16a's Demo Builder parts).
- **Later in the same hour.** AB-16h built and proven live: cancelling a split order in Commerce
  cancelled both ERPs' sales orders within 10 seconds. AB-16i built and proven live: Contoso's
  own events now reach the integration (a price list change reached the catalog in 12 seconds,
  both ways). A live bug found on the way and fixed: since the ERPs began naming themselves on
  their events, their stock events arrived in a shape the integration rejected, so ERP stock
  changes were not reaching Commerce; every ERP on Bodea now has the fix.
- **Still open under AB-16:** AB-16c (screens and tools that assume one ERP, plus showing
  scheduled runs), AB-16d (the remaining live proofs: Partially Held and Re-send, the journeys),
  AB-16e (returns, awaiting your review), AB-16f (fresh start), AB-16g (lost key-map pairs, cause
  unknown). Also AB-38 (schedules a business user edits) and AB-26m (Mapping view, parked).

## Afternoon loop (owner away)

Nothing was deployed and nothing on Bodea changed in this stretch. Everything is on branches.

- **Reset one ERP (AB-16c).** An ERP card's "Reset records" named one ERP but wiped every ERP.
  Now it resets only that ERP, and the agent's `reset_erp_records` takes the same optional
  `erp`. Needs the integration from `loop/ab-16c-per-erp-detach` (pushed, not merged). Until
  that is deployed, a one-ERP reset is refused before it touches anything.
  One limit: Contoso's 182 old products were written before ERPs were recorded per write, so
  only a full reset clears them.
- **A second ERP looks different from the first** (demo-erp `loop/erp-theme-per-erp`): a new
  ERP starts with the next of the four themes. Existing ERPs keep their look.
- **Prices change at the ERP's own midnight** (demo-erp `loop/erp-local-date`): a time zone
  setting, default UTC. No screen field yet.
- **Wording:** the ERP's product page said "contract prices" for its pricing rules; the load and
  reset tool descriptions said "the ERP" while acting on every ERP. Both fixed.
- **Lost key-map pairs (AB-16g):** one way it could happen found and closed (an added ERP that
  could not be identified was filled as the first ERP). Whether that is what happened cannot be
  read back.
- **Question filed, not blocking (AB-16d):** the Partially Held live proof needs a connection
  broken on purpose (the demo ERP never refuses an order). Recommended: break Contoso's address
  in the ERP list, place a mixed order, restore it, press Re-send, all in one sitting.
