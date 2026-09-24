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

Then the two-way sync was completed in code on both sides, each leg built and tested but
not yet proven against a live store: a credit hold in the ERP puts the Commerce order On
Hold and a release takes it off; a quantity edited in any inventory source in Commerce
reaches the ERP within the minute; a product deleted in Commerce leaves the ERP; and a
shipment, invoice, cancellation or hold made in Commerce Admin reaches the ERP and is not
echoed back. Reset and detach undo the hold. The customer card says whose credit exposure
it shows.

All of that is exercised end to end by a new harness: the ERP runs inside the integration's
test process behind a fake Commerce that records every write, and eleven journeys walk the
entity matrix both ways, asking each time whether the change arrived and whether nothing
came back twice. This is the test-without-the-owner instrument the plan asked for.

The research the later slices depend on is written: nine business concepts, each written
out record by record in Adobe Commerce, in SAP, and in our two repos, with the owner of
every field. It corrected two SAP names in earlier notes and found that four Commerce events
the plan assumed do not exist under those names.

One thing is stuck and needs you for about five minutes: **a credential for the ERP
pair.** The deployed workspace is gone and nothing on this machine can reach the demo
store, so none of the Commerce-facing work above can be proven live until the ERP
integration is added to a project again.

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
`notApplied` on each response line.

Two findings on the way. The Pricing grid overflowed a 1,440px window and clipped its
Remove column; fixed. The headless screen checks flaked once in three runs: a Spectrum
header cell settles at 34px one run and 34.3px the next, and a header under the parked
mouse grows its resizer. The checks now leave element sizes out of the fingerprint, park
the pointer, take three agreeing samples, and retry a fresh load once with the first
mismatch kept on disk. Stable across every later run.

Commits: `demo-erp` `66c215e`; `commerce-erp-integration` `d14ea22` (contract).

### Composite-entity research (AB-26a) — written

`.rptc/research/erp-composite-entities/research.md`. Four parallel readers of the Commerce
REST specification converged; one reader of help.sap.com's API guides covered SAP; the two
repos were read directly. Each field is labelled read / snippet / inferred and names its
owner. What it changes: the seller's legal identity is readable over REST in neither
system (the per-website setting is the only source); the shipment, invoice and credit-memo
"commit after" events and any MSI source-item event do not exist under the assumed names;
purchase orders and requisition lists are GraphQL-only reads; Commerce's credit balance
and the ERP's exposure are different numbers. Two SAP names corrected (scales entity
`A_SlsPrcgCndnRecordScale`; credit API `API_CRDTMBUSINESSPARTNER_0001`). Commit: this
worktree `c9432d8e4`.

### Home, rail counts, search, journal sentences (AB-26l) — shipped

Home replaces the Dashboard with eight work cues counted on the ERP side from the same
abilities the documents' own buttons read, so a cue and the list it opens cannot disagree
(a headless check clicks a cue and counts the rows). The rail shows the same numbers. The
shell bar gains one search across every document. The address bar carries a query
(`#orders?work=toShip`, `#orders?open=0000001003`), which is how a search result, a recent
document and a journal line reach a document. The journal names the document each entry
belongs to, links it, and refreshes itself while open. Two Spectrum ComboBox facts and one
CSS selector trap were found by probing the DOM headlessly and are recorded in the
component. Commits: `demo-erp` `5b2a269`; integration `8a313fd`.

### Shell redesign (AB-26n) — shipped

The last piece, a title line that stays while the page scrolls. Sticky offsets are
measured from the scroll container's content edge, so `top: 0` stopped short of the shell
bar; a negative top and the header's own padding put it flush. Commit: `demo-erp`
`bc5be55`.

### Credit hold → Commerce (AB-26f) — built to the supervised edge

One ERP event carries `held: true` with the reason when an order is created and held, and
`held: false` on a release; a reject is a cancel. The handler asks its own ERP first whether
it holds the order (rule M2), puts the Commerce order On Hold or takes it off, writes the
reason into the history, and does nothing twice on a redelivery. Commerce cannot cancel an
order On Hold, so the cancel handler takes it off hold first. Reset and detach take every
ERP-held order off hold. Commits: `demo-erp` `4b5d634`; integration `4703b60`.

### Per-source stock, product delete, the exposure rule (AB-26h) — built to the supervised edge

The minute timer now refreshes stock as well as partners: it reads every source item,
compares with the last read kept in App Builder State, and sends the ERP the SKUs that
moved under a new stock-only import that does not count as a sync; the ERP's own writes are
noted so they are not echoed back. A product deleted in Commerce leaves the ERP (new
subscription; the payload's `sku` is assumed until proved live); a deleted parent's
variants stay as products of their own. The customer card states the exposure rule (G3;
**assumes your decision, see below**). Currency (G5) waits for the structure slice.
Commits: `demo-erp` `88b6679`, `52b1acd`; integration `6488c0d`, `0ccb226`.

### Changes made in Commerce Admin → ERP (AB-26g) — built to the supervised edge

Three new handlers on Commerce's own events. A shipment saved in Commerce is recorded on
the ERP order by Commerce item id and source; an invoice saved in Commerce invoices the ERP
order; the order save event's non-new saves carry a cancellation or a hold made in Commerce
to the ERP, and an order taken off hold in Commerce releases only a hold Commerce itself
made. Every move carries an origin marker, which is what keeps the ERP from raising its own
event for it. Each handler asks its own ERP for the order behind `ext_order_id` first (rule
M2). The ERP's own shipment, coming back as a Commerce shipment event, is matched by its
lines and takes the Commerce id rather than shipping twice, whichever order the two arrive
in. The shipment and invoice events fire before the commit (no commit-after variant
exists), so an unreadable record waits for redelivery; their payload fields are assumed
from the REST shapes until proved live. Commits: `demo-erp` `ce52126`, `d600650`;
integration `f42e6f2`.

### Pair in a box (AB-26c) — built; sync validation's unit half (AB-26e)

`commerce-erp-integration/test/box/`: the ERP runs in-process (the sibling checkout, by
path, against its own in-memory database) behind the integration's ERP client; a fake
Commerce records every write; App Builder State is a map. Eleven journeys walk the entity
matrix both ways and each asks: did the change arrive, and did nothing come back twice.
Nine passed on the harness's first run; the two that failed were assertions about the
fake, not defects in the code. The fake's shapes are typed from the REST read, not
captured live; the API inventory replaces them once a credential exists. Commit:
integration `96b0ad8`.

### Commerce API inventory (AB-26b) — document done, live half handed off

The inventory lists every Commerce call the programme needs. The live half needs a
credential: the aio CLI's project has only its Production workspace (the ERP's is gone);
the one Demo Builder project on this machine has a mesh and a storefront and no ERP; the
other repos' `.env` files hold Commerce admin passwords for a different host, which the
loop does not borrow. Handed off.

---

## Shipped (on the loop branches, gated, awaiting merge)

| Item | What | Where | Verified by |
|---|---|---|---|
| AB-26i | pricing conditions: validity, minimum quantity, value help, why-not | `demo-erp` `66c215e`, integration `d14ea22` | 199 tests, screen fingerprints stable |
| AB-26a | composite-entity research | worktree `c9432d8e4` | four readers agreeing; every field labelled |
| AB-26l | Home work list, rail counts, shell search, journal sentences | `demo-erp` `5b2a269`, integration `8a313fd` | 13 headless checks incl. cue count = list rows |
| AB-26n | sticky title line | `demo-erp` `bc5be55` | scroll check |
| AB-26c | pair-in-a-box harness, eleven journeys | integration `test/box/` | 343 tests green |
| screen checks hardening | sizes out of the fingerprint, pointer parked, 3 samples, retry once, mismatch rows kept | `demo-erp` `66c215e` | no flake in the 14 later full runs |

## Handed off (finished to the supervised edge)

- **A credential for the ERP pair.** Your part: add the ERP integration to a project
  through Demo Builder (a deploy; minutes). Then the loop runs the read-only calls in the
  inventory's "to validate" table, captures fixtures, replaces the box's typed shapes with
  them, and proves live everything below.
- **AB-26f credit hold**: needs the scratch deploy to prove `orders/{id}/hold` and the
  unhold-before-cancel rule on the target backend.
- **AB-26h stock refresh, product delete**: the two behaviours that touch Commerce need the
  deploy; the delete event's `sku` is assumed from the events reference.
- **AB-26g Commerce-side changes**: the shipment and invoice subscriptions and the
  `state` field on the order event are assumed from the REST shapes and the events
  reference; proved live before the subscriptions ship.
- **AB-26e live baseline**: the box is the unit half; the live script and baseline run wait
  for the credential.

## Filed (recorded, not forced)

- The extension's push-guard hook rule matches a bare ` -n` anywhere in a compound
  command, so a push chained with a `sed` or `grep` that uses that flag is blocked as if
  the push itself skipped verification. Hit six times today; worked around by splitting
  commands and writing prose through the Write tool. Worth narrowing the match to the push
  segment. (`.claude/hooks/rules/21-push-no-verify.rule`, in `demo-builder-vscode`.)
- Spectrum's ComboBox loading indicator never clears once shown (React Spectrum 3.47.5).
  Recorded in `ShellSearch.js`; nothing to fix on our side.
- The manifest generator refuses an apostrophe in an event description. Reworded.
- The ERP → Commerce shipment path had an open echo: Commerce's shipment event for a
  shipment the integration itself made would have created a second ERP shipment. Found
  while designing the box's journeys; fixed the same hour (`demo-erp` `d600650`).

## Retracted / corrected

- Nothing retracted this run. Two earlier notes' SAP entity names were wrong and are
  corrected in the research.

## Environment facts

- The ERP pair's Adobe workspace (`NorthwindERP` in project Kukla Bodea) no longer exists;
  `aio app use -g` answers 404. No credential for the pair is on this machine.
- The `develop` push in `demo-builder-vscode` still needs you at the keyboard
  (`CSS_BASELINE_BYPASS`).
- **Rail breach by a subagent:** the SAP researcher drove a real Chrome browser
  (claude-in-chrome) to read help.sap.com after the fetch server failed. The loop's rails
  forbid opening browser tabs unattended. Its evidence is a direct read of the pages'
  property tables and is used as such; future research prompts must say "no browser
  tools" explicitly.
- A preview server the loop started (`scripts/preview.js`, port 8975) is still running for
  screenshots; harmless.
- The done-gate scans (dead code, cycles, duplication) target the extension's `src/`, which
  this run did not touch; not run. The duplication the run added on purpose is the
  preview's stand-in API mirroring the ERP's rules, documented in `preview/fakeApi.js` as
  the hand-mirrored shapes it has always carried; the box's fake Commerce is a second such
  stand-in, on the other side.

## Your decisions

1. **Merge?** The three loop branches are gated green. Merge targets: `demo-erp`
   `feature/erp-grids`, `commerce-erp-integration` `feature/sync-history`, this worktree
   `feature/erp-integration`.
2. **Add the ERP integration to a project** so the live validation and everything behind it
   can run. Five minutes at the keyboard; everything after it is the loop's.
3. **G3, confirm or reverse:** the customer card now states that the ERP's exposure is the
   demo's truth and Commerce's payment-on-account balance is a separate figure. If you
   would rather show Commerce's balance beside it, say so and the card gains a field.
4. **A hold made in Commerce Admin now holds the ERP order too**, with "Put on hold in
   Commerce" as the reason, and Confirm refuses in the ERP until it is released. That reads
   Commerce's generic hold as a credit-style hold. If you want Commerce's hold kept apart
   from the ERP's credit decision, say so; the change is small.
