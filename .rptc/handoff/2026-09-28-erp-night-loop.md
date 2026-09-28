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
