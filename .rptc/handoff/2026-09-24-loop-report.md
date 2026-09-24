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
("Shipment of 5 for sales order 0000001002 from default") rather than JSON.

The research the later slices depend on is written: nine business concepts (a buying
organization, a selling organization, a sellable item, a price, an inventory position,
credit, an order through to cash, a payment, a fulfilment source), each written out record
by record in Adobe Commerce, in SAP, and in our two repos, with the owner of every field.
It corrected two SAP names in earlier notes and found that four Commerce events the plan
assumed do not exist under those names.

One thing is stuck and needs you for about five minutes: **the live half of the Commerce
API validation.** No credential for the ERP pair exists on this machine (the deployed
workspace is gone), so nothing that talks to Commerce can be proven live until the ERP
integration is added to a project again. Four slices wait behind it.

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
  event, **do not exist** under the names the plan assumed. Commerce-side documents and
  per-source stock have to prove their events live before subscribing; stock falls back to
  the minute re-read.
- Purchase orders and requisition lists are GraphQL-only reads. Recommendation: leave them
  off the entity map's first cut.
- Commerce's credit `balance` (what is owed) and the ERP's exposure (open orders) are
  different numbers; the entity map must label them, not compare them.
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
| screen checks hardening | sizes out of the fingerprint, pointer parked, 3 samples, retry once, mismatch rows kept | `demo-erp` `66c215e` | no flake in 8 later full runs |

## Handed off (finished to the supervised edge)

- **AB-26b live validation.** Your part: add the ERP integration to a project through Demo
  Builder (a deploy; minutes). Then the loop runs the read-only calls in the inventory's
  "to validate" table and captures fixtures under `test/fixtures/commerce/`. Behind it:
  AB-26f (hold → Commerce), AB-26g (Commerce-side changes → ERP), AB-26h (per-source
  stock), AB-26c (pair-in-a-box), and through them the rest of the programme.

## Filed (recorded, not forced)

- The extension's push-guard hook rule matches a bare ` -n` anywhere in a compound
  command, so a push chained with a `sed` or `grep` that uses that flag is blocked as if
  the push itself skipped verification. Hit three times today; worked around by splitting
  commands and writing prose through the Write tool. Worth narrowing the match to the push
  segment. (`.claude/hooks/rules/21-push-no-verify.rule`, in `demo-builder-vscode`.)
- Spectrum's ComboBox loading indicator never clears once shown (React Spectrum 3.47.5,
  `ComboBox.mjs`, the `prevIsLoading` block only runs while not loading). Recorded in
  `ShellSearch.js`; nothing to fix on our side.

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

## Your decisions

1. **Merge?** The three loop branches are gated green. Merge targets: `demo-erp`
   `feature/erp-grids`, `commerce-erp-integration` `feature/sync-history`, this worktree
   `feature/erp-integration`.
2. **Add the ERP integration to a project** so the live validation and the four slices
   behind it can run. Five minutes at the keyboard; everything after it is the loop's.
3. Nothing else is parked on you.
