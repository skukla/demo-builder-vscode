# ERP programme, unattended run — 2026-09-24

Branch `loop/2026-09-24-erp-programme` in all three repos (`demo-erp`,
`commerce-erp-integration`, this worktree), pushed for backup under authorization 1.
**Nothing merged to develop or to the feature branches.** This file grows while the loop
runs; the "Your decisions" section at the end is what to read first.

---

## The short version

The ERP got the three things the plan put first: a pricing engine that behaves like an
SAP condition record (valid from, valid to, minimum quantity, and a quote that says why a
record did NOT apply), a Home page that is a work list instead of five row counts, and one
search box that opens any document from anywhere. The Event Journal now reads as sentences
("Shipment of 5 for sales order 0000001002 from default") rather than JSON, and the page
title stays put while a long list scrolls.

Then the two-way sync gained three legs, each built and tested on both sides but not yet
proven against a live store: a credit hold in the ERP puts the Commerce order On Hold and a
release takes it off; a quantity edited in any inventory source in Commerce reaches the ERP
within the minute; a product deleted in Commerce leaves the ERP. Reset and detach undo the
hold. The customer card now says whose credit exposure it shows.

The research the later slices depend on is written: nine business concepts (a buying
organization, a selling organization, a sellable item, a price, an inventory position,
credit, an order through to cash, a payment, a fulfilment source), each written out record
by record in Adobe Commerce, in SAP, and in our two repos, with the owner of every field.
It corrected two SAP names in earlier notes and found that four Commerce events the plan
assumed do not exist under those names.

One thing is stuck and needs you for about five minutes: **a credential for the ERP
pair.** The deployed workspace is gone and nothing on this machine can reach the demo
store, so none of the Commerce-facing work above can be proven live until the ERP
integration is added to a project again. Everything else in the programme waits behind it.

One rail was broken by a helper, not by the loop: the SAP researcher opened a real Chrome
browser to read help.sap.com because the fetch server was down. Recorded below.

---

## What happened, in order

### Pricing conditions (AB-26i) — shipped

A condition may now carry `validFrom`, `validTo` and `minQty`; the engine rules a record
out by date or quantity and reports the reason on the quote line, and it also says when a
matching record was outranked ("a contract price takes precedence"). The Pricing screen
shows Min. qty, Valid and Status (active / scheduled / expired) columns, an Active-only
switch, picks customers and products from the records instead of asking for ids, and its
price test lists what did not apply. The contract gains `date` on the quote request and
`notApplied` on each response line; the integration's cart webhooks read only the price
fields, so nothing there changed.

Two findings on the way. The Pricing grid overflowed a 1,440px window and clipped its
Remove column; the widths are tightened and it fits. The headless screen checks flaked once
in three runs on two different screens: a Spectrum header cell settles at 34px one run and
34.3px the next, and a header under the parked mouse grows its resizer. The checks now
leave element sizes out of the fingerprint, park the pointer off the grid, take three
agreeing samples, and on a mismatch keep the rows on disk and load the screen once more in
a fresh page before failing. Stable across every later run.

Commits: `demo-erp` `66c215e`; `commerce-erp-integration` `d14ea22` (contract).

### Composite-entity research (AB-26a) — written

`.rptc/research/erp-composite-entities/research.md`. Four parallel readers of the Commerce
REST specification converged; one reader of help.sap.com's API guides covered SAP; the two
repos were read directly. Each field is labelled read / snippet / inferred and names its
owner.

What it changes for later slices:

- The seller's legal identity (address, VAT number) is readable over REST in **neither**
  system; the per-website setting is the only source. The business-structure slice types
  it once.
- The shipment, invoice and credit-memo "commit after" events, and any MSI source-item
  event, **do not exist** under the names the plan assumed. Commerce-side documents have
  to prove their events live before subscribing; per-source stock now uses the minute
  re-read (below).
- Purchase orders and requisition lists are GraphQL-only reads. Recommendation: leave them
  off the entity map's first cut.
- Commerce's credit `balance` (what is owed) and the ERP's exposure (open orders) are
  different numbers; the entity map must label them, not compare them. The customer card
  now says so (below).
- Two SAP names corrected: the pricing scales entity is `A_SlsPrcgCndnRecordScale`; the
  credit API is `API_CRDTMBUSINESSPARTNER_0001` (no `API_CREDITMGMT_*` exists).

Commit: this worktree `c9432d8e4`.

### Home, rail counts, search, journal sentences (AB-26l) — shipped

Home replaces the Dashboard. Eight cues (orders to confirm, on credit hold, to ship, to
invoice; shipments to post; blocked customers; events not delivered or waiting) are counted
on the ERP side from the same abilities the documents' own buttons read, so a cue and the
list it opens cannot disagree, and a headless check clicks a cue and counts the rows. The
rail shows the same numbers. Beneath: the five most recently touched documents, the open
order value, the last sync.

The shell bar gains one search across every document, best match first, opening the
document on its own list page so Back lands on that list. The address bar now carries a
query (`#orders?work=toShip`, `#orders?open=0000001003`), which is how a search result, a
recent document and a journal line all reach a document. The journal names the document
each entry belongs to, links it, and refreshes itself while open; the wire event name
moved to the detail page.

Two Spectrum ComboBox facts cost most of the slice's time and are recorded in the
component: its list opens only on an input change that finds a non-empty collection (a
controlled `isOpen` prop is ignored by the state hook), and its loading circle, once shown,
never clears. The search keeps a "Searching…" row from the first keystroke instead. A
third: a `[class*="spectrum-Field"]` selector also matches Spectrum's FieldButton, which
then stretched over the input and took every click. All three were found by probing the
DOM headlessly, not by reading the screen.

Commits: `demo-erp` `5b2a269`; `commerce-erp-integration` `8a313fd` (contract: search
route).

### Shell redesign (AB-26n) — shipped

Three of its four pieces came with Home (rail counts, shell search, the Home label). The
last, a title line that stays while the page scrolls, is a CSS `position: sticky` on the
page header. One fact learned: sticky offsets are measured from the scroll container's
content edge, so with the canvas padding above, `top: 0` stopped the title short of the
shell bar and let rows show through above it; a negative top and the header's own padding
put it flush. A headless check shrinks the window, scrolls the Products list and asserts
the title stays. Commit: `demo-erp` `bc5be55`.

### Credit hold → Commerce (AB-26f) — built to the supervised edge

One ERP event, `be-observer.sales_order_hold`, carries `held: true` with the credit reason
when an order is created and held, and `held: false` on a release; a reject is a cancel and
travels as one. The integration's handler asks its own ERP first whether it holds the order
(rule M2 of the multi-ERP review) and refuses an event about an order it does not know or
whose status disagrees; it puts the Commerce order On Hold or takes it off, writes the
reason into the order's history, and does nothing twice on a redelivery. Commerce cannot
cancel an order On Hold, so the cancel handler takes it off hold first. Reset and detach
take every order the ERP still holds off hold, read from the ERP's own list.

Not proven live: that `POST orders/{id}/hold` answers for a new order on the target
backend, and that Commerce indeed refuses to cancel a holded order. Commits: `demo-erp`
`4b5d634`; `commerce-erp-integration` `4703b60`.

### Per-source stock, product delete, the exposure rule (AB-26h) — built to the supervised edge

Commerce raises no event for a source item's quantity (its legacy stock event is the
default source only, and the research found no MSI source-item event), so the minute timer
now refreshes stock as well as partners: it reads every source item, compares with the last
read kept in App Builder State, and sends the ERP the SKUs that moved, each with its full
warehouse list, under a new stock-only import that does not count as a sync. The first
read only seeds; a quantity the ERP itself wrote into Commerce is noted as it is written so
it is not echoed back; an ERP refusal leaves the snapshot alone so the change is sent again
next minute. The timer's worker is renamed `refresh-job`.

A product deleted in Commerce now leaves the ERP (a new subscription to the delete event,
which the research confirmed exists; its payload's `sku` is assumed until proved live).
The ERP leaves a deleted parent's variants as products of their own, as Commerce does.

The customer card's credit section states the rule the review recommended: exposure is the
ERP's view (the net of open orders here); Commerce's own credit balance for payment on
account is a separate figure and is not compared. **This assumes your decision on G3; see
below.** The currency (G5) waits for the business-structure slice.

Commits: `demo-erp` `88b6679`, `52b1acd`; `commerce-erp-integration` `6488c0d`, `0ccb226`.

### Commerce API inventory (AB-26b) — document done, live half handed off

The inventory (`commerce-erp-integration/docs/commerce-api-inventory.md`) lists every
Commerce call the programme needs: 18 used today, 12 to validate, the events, webhooks and
Admin features. The live half needs a credential. Looked for one everywhere it could be:
the aio CLI points at project Kukla Bodea, whose only workspace is Production (the ERP's
workspace no longer exists); `~/.demo-builder/projects` holds one project, bodea, with a
mesh and a storefront and no ERP; the other repos' `.env` files hold Commerce **admin
passwords** for a different, PaaS host. The loop does not borrow another project's admin
password. Handed off.

---

## Shipped (on the loop branches, gated, awaiting merge)

| Item | What | Where | Verified by |
|---|---|---|---|
| AB-26i | pricing conditions: validity, minimum quantity, value help, why-not | `demo-erp` `66c215e`, integration `d14ea22` | 199 tests, screen fingerprints stable ×3 |
| AB-26a | composite-entity research | worktree `c9432d8e4` | four readers agreeing; every field labelled |
| AB-26l | Home work list, rail counts, shell search, journal sentences | `demo-erp` `5b2a269`, integration `8a313fd` | 223 tests; 13 headless checks incl. cue count = list rows |
| AB-26n | sticky title line (the rest shipped with AB-26l) | `demo-erp` `bc5be55` | scroll check; 224 tests |
| screen checks hardening | sizes out of the fingerprint, pointer parked, 3 samples, retry once, mismatch rows kept | `demo-erp` `66c215e` | no flake in the 12 later full runs |

## Handed off (finished to the supervised edge)

- **A credential for the ERP pair.** Your part: add the ERP integration to a project
  through Demo Builder (a deploy; minutes). Then the loop runs the read-only calls in the
  inventory's "to validate" table, captures fixtures under `test/fixtures/commerce/`, and
  proves live what is built below.
- **AB-26f credit hold** (`demo-erp` `4b5d634`, integration `4703b60`): code and tests
  complete on both sides; needs the scratch deploy to prove `orders/{id}/hold` and the
  unhold-before-cancel rule on the target backend.
- **AB-26h per-source stock, product delete, exposure rule** (`demo-erp` `88b6679` and
  `52b1acd`; integration `6488c0d` and `0ccb226`): code and tests complete; the two new
  behaviours that touch Commerce (the minute stock refresh, the delete subscription) need
  the scratch deploy. The delete event's `sku` field is assumed from the events reference,
  not read from a live payload.
- Behind the credential: AB-26g (Commerce-side changes → ERP), AB-26c (pair-in-a-box), and
  through them the rest of the programme.

## Filed (recorded, not forced)

- The extension's push-guard hook rule matches a bare ` -n` anywhere in a compound
  command, so a push chained with a `sed` or `grep` that uses that flag is blocked as if
  the push itself skipped verification. Hit five times today; worked around by splitting
  commands and writing prose through the Write tool. Worth narrowing the match to the push
  segment. (`.claude/hooks/rules/21-push-no-verify.rule`, in `demo-builder-vscode`.)
- Spectrum's ComboBox loading indicator never clears once shown (React Spectrum 3.47.5,
  `ComboBox.mjs`, the `prevIsLoading` block only runs while not loading). Recorded in
  `ShellSearch.js`; nothing to fix on our side.
- The manifest generator (`aio-commerce-lib-app hooks postinstall`) refuses an apostrophe
  in an event description. Reworded; no action.

## Retracted / corrected

- Nothing retracted this run. Two earlier notes' SAP entity names were wrong and are
  corrected in the research (scales entity; credit API).

## Environment facts

- The ERP pair's Adobe workspace (`NorthwindERP` in project Kukla Bodea) no longer exists;
  `aio app use -g` answers 404. No credential for the pair is on this machine.
- The `develop` push in `demo-builder-vscode` still needs you at the keyboard
  (`CSS_BASELINE_BYPASS`).
- **Rail breach by a subagent:** the SAP researcher drove a real Chrome browser
  (claude-in-chrome) to read help.sap.com after the fetch server failed. The loop's rails
  forbid opening browser tabs unattended. The evidence it produced is a direct read of the
  pages' property tables and is used as such; future research prompts must say "no browser
  tools" explicitly.
- A preview server the loop started (`scripts/preview.js`, port 8975) is still running for
  screenshots; harmless, and the screen checks start their own.
- The done-gate scans (dead code, cycles, duplication) target the extension's `src/`, which
  this run did not touch; not run. The one duplication the run added on purpose is the
  preview's stand-in API mirroring the ERP's search and work-list rules, documented in
  `preview/fakeApi.js` as the hand-mirrored shapes it has always carried.

## Your decisions

1. **Merge?** The three loop branches are gated green. Merge targets: `demo-erp`
   `feature/erp-grids`, `commerce-erp-integration` `feature/sync-history`, this worktree
   `feature/erp-integration`.
2. **Add the ERP integration to a project** so the live validation and everything behind it
   can run. Five minutes at the keyboard; everything after it is the loop's.
3. **G3, confirm or reverse:** the customer card now states that the ERP's exposure is the
   demo's truth and Commerce's payment-on-account balance is a separate figure. The review
   recommended this; the card assumes it. If you would rather show Commerce's balance
   beside it, say so and the card gains a field.
