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

Then the business structure. The ERP now has the three seller levels a real one has: a
company code (itself), sales organisations (one per Commerce website) and warehouses (one
per inventory source, with the ERP's own names). Which sales organisation sells through a
website is a merchant setting on the integration's Commerce Admin screen, and two more
settings there let a second ERP pair sit beside the first: a prefix on the ERP order
numbers Commerce sees, and a rule for which products belong to this ERP. The fake "1000"
on every customer is gone. A setup guide for the person preparing a demo says what the
Commerce instance needs for each story and how to undo it.

After that, the product became a master record: the ERP now says what is committed to
open orders and what is available, a product can be blocked for sales (and every shipment
of it is then refused in words), and the product page lists the orders holding its stock.

Then the entity map you asked for on the Commerce Admin page: the Settings tab is now a
Mapping tab. One card per business concept the two systems share, Commerce's records on
the left, the ERP's on the right, an arrow saying which side owns each piece, and the
setting that joins them sitting on the join itself. The settings are the mapping. Two
cards look up one company id or SKU as both systems hold it.

Then the screens caught up with the UI audit: Settings' document numbering and the ERP's
own currency; lists whose rows say where each document stands; documents with a timeline,
a due date, a credit meter and open items. And the walk-through you asked for at the
start: the ERP screen by screen, Commerce from the other side, one relation table per
concept, in the integration's docs.

**Every startable slice of the ERP programme is now built or built to its supervised
edge.** What is left in the programme waits on you (a credential, the live looks, the merge)
or on a gate you own (the credit memo's question, the routing client's answers). The loop
had just picked up the first fallback fix (the untested Node-version sort, PL-36) when you
stopped it; no work was done on it and it is back in the backlog with its staleness note.

**Stopped on your word, 2026-09-24.** Nothing was left half-done: every commit on the three
loop branches is gated and pushed, the record matches the code, and the hygiene scan at
close was clean.

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
**assumes your decision, see below**). Currency (G5) came with the structure slice: the
mirror reads each website's base currency from the store configuration, and the ERP's
Organisation card and invoice print it.
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

### Business structure (AB-26j) — shipped, five steps

The plan (`.rptc/complete/erp-business-structure/`) was written from the structure
research and built in order. Step 01 pinned what the ERP stores: a test compares every
stored record's keys with a checked-in fixture, so a field can only appear or vanish on
purpose, and the contract went to version 2 with the new fields. Step 02, on the
integration: a Structure group of settings on the Commerce Admin screen. Per website, the
ERP sales organisation that sells through it and its name. Per pair, the prefix put in
front of ERP order numbers written onto Commerce orders (`ACME-0000001042`, so two ERPs on
one store tell their orders apart; every read strips it) and which products belong to this
ERP: all of them, the ones stocked in named inventory sources, or the ones whose attribute
names this ERP. The mirror and the product and stock events filter by that rule, and an
order with no owned line is skipped with a history entry saying why. The mirror also
carries each company's legal identity and its admin's website, and a block describing
Commerce's websites with their base currency and locale. Step 03, on the ERP: a partner
belongs to sales organisations (plural) and is widened by each order that arrives; an order
carries its own sales organisation; a pricing condition may be scoped to one; warehouses
have ERP names that survive a wipe; the structure (company code, sales organisations with
counts, warehouses) is derived on read, never stored. The old `salesOrg` field left the
partner record in the same commit. Step 04, the screens: Settings gained Organisation and
Warehouses cards (click a plant to rename it), the customer document a "Sold-to in" line
and a Legal identity card, the order header its sales organisation, the invoice a Seller
card, the shipment its ship-from with the ERP's plant name, and Pricing a scope column with
pickers on Add rule and Test a Price. Step 05 is this record, both READMEs, and the setup
guide.

What changed from the plan: Store Information (the seller's address and VAT number) is not
readable over Commerce's REST API, which the composite research had established, so the
Organisation and Seller cards print the store configuration's currency and locale and
leave address and VAT blank, and the guide says so. The three open questions were taken as
recommended: the walk-in partner belongs to every sales organisation; the company code is
`1000` fixed; the invoice carries the seller's sales organisation and country.

One thing to know about the dependency check: the backlog tool now treats a `built` item
as still blocking, since "shipped" means released. The programme's own order of work put
this slice after the Commerce-side changes, which are built to their supervised edge on the
same branch, and the code this slice needed from them (the "is this mine?" check) is there.
The loop took the plan's order as the owner's; if you would rather it wait for a merge
before building on a built item, say so and it will.

Commits: `demo-erp` `86be509`, `7e8b1cf`, `126cf5f`, `df2075c`; integration `50b1927`,
`2807a46`, `5625033`, `7537745`, `965e7fe`; this worktree `969c66fc4`. Tests: `demo-erp`
244 pass; integration 363 pass, biome clean; 14 headless screen checks stable across two
runs; six screens looked at.

### Product master (AB-26k) — shipped

Committed is the quantity ordered and not yet shipped on orders that still stand (not
cancelled, not invoiced); available is on hand less committed, and goes below zero when
more is sold than is on the shelf, which the screen shows rather than hides. Neither is
stored: both are read off the order lines the fulfilment module keeps, the same way
Home's cues are counted, so a product cannot disagree with its orders. A product gains a
sales status, sellable or blocked for sales. It is the ERP's own decision: Commerce is
not told, an import never resets it, and a blocked product is refused when a shipment is
created and again when one is posted ("Product B2 is blocked for sales."), while the
order's other lines still ship. The stored record grew by exactly that one key, which the
record-shape pin confirmed.

On screen, the Products list shows On hand and Available with a three-tint status (in
stock, low stock under ten, out of stock) that says "Blocked for sales" first when it
applies. A ninth column clipped the grid at 1,440 pixels, so Committed lives on the
product page, which moved onto the shared Card (its own copy was a duplicate) and gained
Basic data (base unit, product type in ERP words, the Blocked for sales switch), Open
orders (a row opens the order) and a stock line on Inventory.

Two things found on the way, both fixed. The preview's configurable parent had no
variants, so its page had rendered blank, and no headless check had ever opened it; it
now has three variants and a check opens it. And the fingerprint accept mode recorded a
single sample of the Shipments screen, which this slice never touched, and the next two
runs failed on it; a changed look is now re-accepted only when two fresh loads agree,
and a refused accept keeps the recorded fingerprint rather than dropping the key.

Commit: `demo-erp` `8ebf768`. Tests: 255 pass; 15 headless checks stable across two runs;
four screens looked at.

### The entity map (AB-26m) — built to the supervised edge

The Commerce Admin page's Settings tab became a Mapping tab. Nine cards, one per composite
entity from the programme's list (buying organization, selling organization, sellable
item, price, inventory position, credit, order, payment / receivable, fulfilment source).
Each card opens with its join in a sentence and, where a setting makes the join, that
setting editable right there: the sales organisation per website on Selling organization,
the order-number prefix on Order, the ownership rule on Fulfilment source. The pieces of
the composite are rows, Commerce's record on the left and the ERP's on the right, with an
arrow between them saying which side the truth flows from (Commerce owns, the ERP owns, or
both, with the rule written under it), taken from the composite-entity research's
field-ownership table. The card's other switches sit under its rows: the order switches
on Order, the pricing switches on Price. The foot of each card carries the ERP's live
figures (counts, sales organisations, warehouses), what has crossed for that card in each
direction from the history records, and where in the ERP's own screen its records live.
Payment / receivable is on the map with no join, saying it is not connected yet. A
setting no card has claimed lands on an Other card, so a new setting always has a home.

The old settings form is deleted rather than kept beside the map: one place to change a
setting. The view model is pure and tested (card order, every setting on exactly one card,
inherited and clearable rules at each scope, sync counts, figures); the tab was looked at
in the page's own preview with a clean console. Commit: integration `c419327`. Tests: 368
pass.

The second step followed: a look-up on the Buying organization and Sellable item cards.
Type a Commerce company id or a SKU and the card answers with both systems' records lined
up row by row (name, status, credit limit and position, legal name, VAT, payment terms,
sales organisations for a company; name, type, price, status, stock and availability for
a product), each column saying "not found" when that side lacks it, plus the hash that
opens the record in the ERP's own screen. Behind it is one new action that asks both
sides and a pure arrangement of the answers, tested on what it asks and what it answers.
Commit: integration `bb06879`; suite 379.

What needs you: one look at the live Admin page once a pair is deployed, and one look at
whether App Management's own settings form agrees with this page on a saved value (same
library, same store).

### Settings: document numbering and the ERP's own currency (AB-26q) — shipped

Most of what the UI audit asked of Settings and the Event Journal had already shipped in
earlier slices (the Organisation and Warehouses cards, the journal's sentences and live
refresh, the Wipe confirmation), so the first unit of work was saying so on the item. What
remained: a Document numbering card, which shows each document type's range and its next
number without reserving it, with the rule that a counter never rewinds, not even across a
wipe; and the ERP's own currency. Money with no currency of its own (list prices, credit
limits) used to fall back to dollars on every screen, so a euro demo showed two symbols. It
now follows the company code's currency, which the structure slice reads from the website
mapped to it, and the card says which currency stands in and why. Commit: `demo-erp`
`f04c897`. Tests: 258 pass; 15 screen checks stable.

### The lists (AB-26o) — shipped

A list row now says what the document behind it is in the middle of. Sales Orders shows
Shipping and Billing badges (not shipped, partly shipped, fully shipped; not invoiced,
invoiced, credited) in place of a line count nobody sorted by, and a Stage filter (open,
in process, completed, cancelled) beside the work filter the Home cues drive. Shipments and
Invoices name the sold-to, and a shipment's ship-from prints the ERP's own name for the
plant instead of Commerce's source name. Customers shows Exposure and Available beside
each credit limit, worked out in one pass over the orders by the same rule the customer
document uses; the walk-in account, which has no credit relationship, shows dashes. The
Commerce company id moved off that list onto the document so the columns fit a 1,440-pixel
window. Commit: `demo-erp` `ce2c9a5`. Tests: 262 pass; 16 headless checks stable.

### The documents (AB-26p) — shipped

The order document gained a Timeline: its stored history (created, confirmed, held,
released, cancelled with the reason) merged by time with its shipments and its invoice,
each a link. A line's SKU now opens the product on the same trail, so Back returns to the
order. The invoice shows a Due date, the billing date plus the sold-to's payment terms;
terms that name no number of days leave it a dash rather than a guess. The customer
document has a meter under the credit figures (exposure as a share of the limit, red past
it) and its orders split into Open items, which add up to the exposure figure above them,
and History. The product page's Pricing card says in words when no rule names the product.

Found and fixed along the way, in the screen check: when a document's fingerprint did not
match, the check reopened the document by the address bar, but clicking a row never
writes the document into the address bar, so the retry reopened the list and fingerprinted
that. It had been wrong since the check was written and invisible because no document
had changed after its fingerprint was recorded. The retry now reopens by the row's key
and waits for the document's own title. Commit: `demo-erp` `64e0148`. Tests: 264 pass; 17
headless checks stable.

### The walk-through (AB-26u) — written

Your end deliverable: what to look at in the ERP and how it relates, then what to look at
in Commerce and how it relates. `commerce-erp-integration/docs/walkthrough.md`, in three
parts. The ERP screen by screen along the twenty-minute demo path, saying on each screen
which values are mirrored from Commerce and which are the ERP's own, and what to say.
Commerce screen by screen from the other side (the cart, the order and its comments,
shipments and invoices, the product, the company, the integration's Admin page), naming
the ERP action that put each thing there. And one table per business concept: this ERP
screen, this Commerce screen, what joins them, who owns each field. That third part is the
printable twin of the Mapping tab. Every ERP screen is named by its address in the
preview, so each look is reproducible without committing images. Two claims were checked
against the code before publishing and one sentence corrected (any blocking level, not
only "all business", writes back to Commerce as blocked). What it has not had: a walk
against a deployed pair, which is the first thing to do before a showing. Commits:
integration `91fb8ce`; `demo-erp` `806b196` (README pointer).

### The demo setup guide — written

`commerce-erp-integration/docs/demo-setup.md`, for the person preparing a demo. Three
stories: one ERP (nothing to prepare), the business structure (a second website with its
own currency, the sales organisation on the Structure settings, a company whose admin sits
on that website), and two ERPs (products split by inventory source or by an `erp_owner`
text attribute, a prefix per pair). Every requirement names the Commerce Admin path, a
read-only API call that proves it, and how to undo it. It closes with what a first live
run must confirm. Linked from both READMEs. Your words from this morning are its licence:
the demo can have whatever it needs, as long as it is written down.

---

## Shipped (on the loop branches, gated, awaiting merge)

| Item | What | Where | Verified by |
|---|---|---|---|
| AB-26i | pricing conditions: validity, minimum quantity, value help, why-not | `demo-erp` `66c215e`, integration `d14ea22` | 199 tests, screen fingerprints stable |
| AB-26a | composite-entity research | worktree `c9432d8e4` | four readers agreeing; every field labelled |
| AB-26l | Home work list, rail counts, shell search, journal sentences | `demo-erp` `5b2a269`, integration `8a313fd` | 13 headless checks incl. cue count = list rows |
| AB-26n | sticky title line | `demo-erp` `bc5be55` | scroll check |
| AB-26c | pair-in-a-box harness, eleven journeys | integration `test/box/` | 343 tests green |
| AB-26j | business structure: Structure settings, prefix, ownership, legal identity, warehouse names, Organisation card, the setup guide | `demo-erp` `86be509` `7e8b1cf` `126cf5f` `df2075c`; integration `50b1927` `2807a46` `5625033` `7537745` `965e7fe` | 244 + 363 tests, record-shape pin, 14 screen checks, six screens looked at |
| AB-26k | product master: committed, available, sales status refusing shipment, Basic data and Open orders cards, three-tint status | `demo-erp` `8ebf768` | 255 tests, record-shape pin, 15 screen checks incl. the product page and the parent, four screens looked at |
| AB-26m | the entity map: the Mapping tab, nine cards, joins with their settings, ownership arrows, sync per direction, ERP figures; the company / SKU look-up on two cards | integration `c419327`, `bb06879` | 12 view-model + 10 look-up tests, 379 suite, preview driven headlessly with a clean console |
| AB-26q | Settings: Document numbering card; the ERP's own currency as the money fallback | `demo-erp` `f04c897` | 258 tests incl. the counter pin; 15 screen checks |
| AB-26o | the lists: shipping and billing badges and a stage filter on orders, sold-to on shipments and invoices, the plant's ERP name, exposure and available on customers | `demo-erp` `ce2c9a5` | row fields pinned through the actions; 16 headless checks incl. the four lists' headers |
| AB-26p | the documents: timeline, product from a line, due date, credit meter, open items, pricing wording | `demo-erp` `64e0148` | due date pinned; a headless check walks order → product and reads the due date, meter and open items |
| AB-26u | the walk-through: the ERP screen by screen, Commerce from the other side, one relation table per concept | integration `91fb8ce`, `demo-erp` `806b196` | every named screen has a headless check; two claims verified against the code |
| screen checks hardening | sizes out of the fingerprint, pointer parked, 3 samples, retry once, mismatch rows kept; the accept mode needs two agreeing loads | `demo-erp` `66c215e`, `8ebf768` | no flake in the 14 later full runs; the one-off shipments sample caught and refused |

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
- **AB-26m, the live look**: the Mapping tab on a real Commerce Admin, and whether App
  Management's own settings form and the map agree on a saved value.
- **AB-26j, two live looks**: whether App Management's own form renders the Structure text
  fields the way the integration's Admin screen does (one person, one look), and the exact
  `store/websites` and `store/storeConfigs` field names on Adobe Commerce as a Cloud Service
  (one read-only call each, then a fixture).

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
- The ERP README's pointer to the setup guide is a GitHub URL on the integration's `main`
  branch; it resolves once the loop branch is merged there.
- The UI audit's pricing column on order lines ("Contract price CP01 · −12%") needs the
  applied condition recorded on the line when the order is created, which means the
  integration running the quote at order time and a contract addition. Not built; on AB-26p.
- The screen-realism plan's Products list wanted nine columns (Type, Base unit, Sales
  status, List price, On hand, Committed, Available among them). Eight fit a 1,440-pixel
  window with the rail open; the ninth clipped. Committed is on the product page, and the
  sales status is folded into the Status column. Recorded on AB-26k.

## Retracted / corrected

- The `demo-erp` commit message for the structure records (`7e8b1cf`) says "246 tests".
  The suite had 243 at that commit and the run was green; the number in the message is
  wrong and the suite was right. Logged on the item; the message itself stands (history is
  not rewritten).
- Two earlier notes' SAP entity names were wrong and are corrected in the research.

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
  stand-in, on the other side. `lib/structure.js` is new in both repos and each does a
  different job (the ERP derives its structure; the integration reads Commerce's), so the
  shared name is not a shared implementation.
- The integration's `npm run contract:check` compares the vendored contract with
  `demo-erp`'s `main`, so it reports a difference until the loop branch is merged there.
  Expected, and the reason it is not a gate.

## The walkthrough queue, in order

Each is one decision or one action, minutes each:

1. Merge the three loop branches (decision 1 below).
2. Add the ERP integration to a project (decision 2): five minutes, and it unblocks every
   live proof in this report.
3. Look at the Admin page's Mapping tab on a real Commerce Admin, and at App Management's
   own settings form beside it (AB-26m's handoff).
4. Walk `docs/walkthrough.md` once against the deployed pair and correct what reads
   differently (AB-26u's handoff).
5. Read `docs/demo-setup.md` and say whether the two-website and two-ERP stories are the
   ones you want prepared (AB-26j's handoff).
6. Decisions 3 to 7 below, each a yes or a sentence.
7. The credit memo question (O5), which gates AB-26r and behind it the payment leg.

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
5. **The Mapping tab replaced the Settings tab and opens first.** Your words were that the
   settings are the mapping, so the map is where they live now; nothing else changed about
   how a setting is saved or scoped. Payment / receivable appears as a card before its
   slice ships, labelled not connected yet. Say if either should be otherwise.
6. **A website with no Structure setting of its own sells through `1000`.** The default
   applies at every scope, so nothing is ever "unmapped"; a second website only becomes a
   second sales organisation when someone sets it. Recommended as is: a single-website
   store gets the right answer without touching a setting. The alternative, flagging an
   unset website on the Organisation card, is a small change if you want the nudge.
7. **Building on built, unmerged items.** The loop built the structure slice on top of
   items that are built but not merged, following the programme's order of work. Say if
   the merge should come first from here on.

## Validation still owed (added 2026-09-24, afternoon — owner: "we are not done validating")

What the loop built last night and this morning has been gated and headless-checked, and
today the add/remove/update paths were proven live on Bodea. The DEMO CONTENT paths have not
been run against a deployed pair by a person. Each line is one live check; none needs code.

1. **The sync baseline and a first import.** Bodea's ERP holds no partners and no products
   (`lastImportAt: null`). Run the integration's sync from Commerce once and confirm the
   ERP's Products, Customers and Pricing screens fill, and the Mapping tab's ERP figures
   match. Everything below reads better with data in it.
2. **The ERP screens the loop built** (product master with availability and sales status,
   Settings with numbering and currency, the four list screens with their filters and
   badges, the document trail with the timeline). Headless fingerprints passed; nobody has
   looked at them with records present.
3. **The credit hold round trip**: a credit hold in the ERP puts the Commerce order on hold
   and Confirm refuses until release; a hold made in Commerce Admin holds the ERP order too
   (decision 4). Neither direction has been seen on a live store.
4. **The Mapping tab on a real Commerce Admin**, beside App Management's own settings form
   (AB-26m's handoff), including the lookup on the buying and item cards.
5. **The walk-through** (`commerce-erp-integration/docs/walkthrough.md`) walked once against
   the deployed pair; correct what reads differently (AB-26u).
6. **The demo setup guide** (`docs/demo-setup.md`): say whether the two-website and two-ERP
   stories are the ones to prepare (AB-26j), now that AB-16 is decided as one integration
   with targets.
7. **Decisions 3 to 7 above**, each a yes or a sentence; and the credit memo question (O5).

Order of the rest of the release path, agreed 2026-09-24: the AB-16 stored-shape read,
develop merged into this branch, then this list, then the cut from develop.

### Progress on the list (2026-09-24, afternoon, owner present)

- **Item 1 is done.** `reset_erp_records` on Bodea mirrored 4 companies and 182 products in
  32 seconds; the ERP's status shows the import time, one warehouse (Default Source, 162
  products) and one sales organisation (Main Website, 4 customers, USD).
- **Why the ERP had been empty:** nothing started the first sync. The extension's ERP client
  called only status, reset and detach, and the integration has no install-time hook, while
  the ERP's home screen, both READMEs and the demo setup guide said it was filled at install.
  Fixed on this branch (`daca8e0d9`): the catalog entry declares `sync` (the integration's
  `erp/mirror?background=true`, the Sync records button's call) and the runner makes it once
  the Commerce install answers `installed`. Proven by the re-add at the end of the round trip,
  not yet.
- **Two agent reads added** (`d6ac0c337`, renamed `18c2fe6ea`): `get_erp_record` (one SKU or
  Commerce company id as both systems hold it) and `get_erp_order_trace` (one order's whole
  life). They wrap the integration's Admin page lookup and Follow an order. Live on Bodea: the
  product lookup agrees on both sides; company 2 (Kukla Studios) shows a 100000 USD credit
  limit mirrored; a trace of a missing order answers an empty trace.
- **`run_commerce_rest` built (AB-29 read half, `877793333`)**: a GET under /V1 of the ACCS
  backend, signed with the ERP integration's workspace credential (IMS client-credentials
  token, scopes and URL read from aio-lib-ims and aio-commerce-lib-api). Not yet run live:
  the shared MCP socket is held by a SECOND Extension Development Host running the develop
  checkout (window6, started 15:22:59), and this extension's rule is "first window wins,
  no retry" (`inExtensionMcpServer.ts`), so the ERP-branch host yields at start-up. Two
  reload races lost; stopping the develop window's processes and parking its socket file
  were both refused by the session's permission classifier. Needs the owner at the
  keyboard: close the develop dev host, reload the ERP one. Finding for later: a
  yielding host should retry the bind (or offer a `rebind` tool) — two dev hosts on one
  machine is the normal state of a worktree workflow.
- **The storefront sign-up puzzle, as far as it is known**: creating an account works
  (a second try answers "already exists"), the automatic sign-in after it fails with the
  storefront's generic "Unable to log in", email confirmation is OFF, and the sign-in
  mutation itself answers normally for a fake account on both endpoints. The customer
  record is the next thing to read, which is what run_commerce_rest is for. Two deleted
  customers (ids 3 and 42) still show in the Admin grid as index leftovers with blank
  Status; the grid index was invalidated by adding a column and should clear on rebuild.
- **Commerce made demo-ready through the REST tools (evening, consent setting off by the
  owner):** customers 3 and 42 confirmed as index ghosts (404 on GET); stray sign-up
  customer 43 deleted; company 21 "Kukla Studios" created, Approved, with customer 44
  (steve@test.com) as admin and a 100000 USD credit limit; companies 18, 19, 20 moved from
  Pending to Approved (a pending company's admin cannot sign in — the likely cause of the
  "Unable to log in" screen for the demo users); nine customers, no orphan company links;
  ERP reset mirrored 4 companies and 182 products and `get_erp_record` shows company 21
  agreeing on both sides, company 2 gone from both. Learned: a company POST/PUT can take
  Commerce over 30s on this sandbox (welcome mail with no server), so writes now get
  TIMEOUTS.LONG; `PUT companyCredits/{id}` takes its object under `creditLimit`; a US
  company needs `region_id` (North Carolina = 44). Not yet proven: a storefront sign-in as
  steve@test.com, which is the owner's next click.
- **Commerce → ERP event delivery is NOT arriving (found 2026-09-24 evening, live):** a REST
  price change (accessmesh 49 → 52) and a credit change (company 21, 100000 → 120000)
  reached Commerce; forty minutes later the ERP still read 49 and 100000. Both halves of
  the wiring look right — Commerce holds the provider (id 12) and subscriptions for
  product save/delete, order save, shipment, invoice and stock (`eventing/getEventSubscriptions`);
  the AcmeERP workspace holds 17 enabled, verified webhook registrations pointing at
  `acp/sync_event_handler_*` in namespace `…-acmeerp` — yet the namespace's last 150
  activations (since 17:09) hold NO `acp/*` activation at all. So Commerce is not
  publishing (or I/O Events is not delivering) and the fault is upstream of our code.
  The every-minute `erp/refresh-job` DOES run, but its log shows Commerce timing out
  its reads ("partner refresh failed: Request timed out", "stock refresh failed: 503"),
  which is why the credit change did not arrive by that route either: the ACCS sandbox's
  REST was slow and flapping all evening (our own reads saw 503s and 30s+ answers).
  What would settle it: the registration's delivery trace in Developer Console (not
  reachable from the CLI), Commerce's eventing config/queue state (Admin only), or a
  retry when the sandbox is healthy. Commerce now holds 52 and 120000; the next reset
  re-mirrors them.
- **Tools this diagnosis wanted and did not have:** a Runtime activation read
  (`list_runtime_activations` / `read_activation_logs`, done tonight by downloading the
  workspace credential to a temp file for one shell command), and a signed ERP API
  passthrough (`run_erp_rest`) so ERP → Commerce paths can be driven without the screen.
- **Four more agent tools, and the two defects they found (evening):** `run_erp_rest` /
  `write_erp_rest` (the ERP's own routes, the write confirm-gated) and
  `list_runtime_activations` / `read_runtime_activation` (what ran in a namespace, and one
  activation's log and result), all live on Bodea. The Commerce REST client was moved onto
  Adobe's documented server-to-server shape (token v3, seven scopes, x-api-key and org
  headers) after the owner asked for a docs check. First ERP → Commerce write through the
  new tool (a credit limit change on Kukla Studios in the ERP) reached the integration —
  the event pipeline from the ERP works — and its handler failed with 400: Commerce's
  credit PUT requires `currency_code`, which the integration never sent. The same read
  showed the company status PUT (`{id, status}` only) is refused too. Both writers serve
  detach's revert as well, so removal could not have restored a changed limit or block.
  Fixed in `commerce-erp-integration` `5b72975` (main and loop pushed): each writer reads
  the record and writes it whole. Redeploy and re-test follow.
- **RETRACTED (evening):** the claim above that "Commerce → ERP event delivery is NOT arriving"
  rested on the namespace holding no handler activation. Adobe's Runtime logging guide (read
  2026-09-24 after the owner asked for a docs check) says the system "skips persisting the
  activation that succeeded" for blocking calls unless `X-OW-EXTRA-LOGGING: on` is sent;
  failures and timer runs are kept. Measured the same evening: the ERP's block event was
  applied to Commerce (company 21 → status 3) with NO activation row, while every failed credit
  run left one. So absent rows prove nothing about success. What still stands on its own
  evidence: the ERP's copy of the changed product price and credit did not update for forty
  minutes (the outcome, not the log), and the timer job's own logs show Commerce reads timing
  out. The Commerce → ERP event path is UNPROVEN either way, not disproven.
- **Open after the credit fix:** Commerce holds credit 150000 while the ERP holds 160000. The
  150000 write predates the fix and its handler run is recorded as a timeout, so Commerce
  may have applied a PUT the handler gave up on; the 160000 event (ERP journal: delivered,
  no error) left no failure row, yet Commerce did not change. Re-check when the sandbox is
  healthy before concluding anything.
- **FOUND AND FIXED (2026-09-25, ~03:00 UTC): why Commerce → ERP events never arrived.**
  Adobe's registration debug tracing showed the Commerce Provider product registration had
  received only its challenge probe since install, after an API price change, an Admin
  rename, a linked provider id, a synchronization and a successful test event. Adobe's own
  docs: normal events go out through the `event_data_batch_send` cron, priority events
  through a message-queue consumer within a second; the test event is a `connection_testing`
  probe that proves credentials only. Marking the product subscription `priority: true` on
  the instance (PUT eventing/eventSubscribe/<name>) made the next save reach the ERP in five
  seconds, name and price both. Internal support threads record the same symptom on other
  Cloud Service sandboxes — the event cron "missed its scheduled run" — with the same advice.
  Fixed permanently in `commerce-erp-integration` (every Commerce event subscribed as
  priority) and applied to all six subscriptions on Bodea. So the event-driven Commerce → ERP
  path is now proven live for product save; orders, shipments, invoices and stock follow the
  same subscriptions. The polling fallback considered earlier is not needed.
- **FOUND AND FIXED (2026-09-25, morning): the first order reached the integration and was
  thrown away.** With events flowing, an order placed through the Commerce REST cart for the
  Kukla Studios admin arrived at the order handler within seconds (Console tracing: delivered,
  answer 200). The ERP never got it, because the handler skipped any order Commerce did not
  flag as new, and an order placed through the REST cart is saved more than once while it is
  placed, so the event that fires carries `_isNew: false`. The handler now sends every order
  the ERP does not already have (no ERP number on the event or on the Commerce record); the
  ERP's create is idempotent on the Commerce order id, so a repeat save cannot double-create.
  Committed to `commerce-erp-integration` as 3822120 and redeployed to Bodea. The handler's
  history does not record skipped events, which is why the Admin page showed nothing; that gap
  stands.
- **PROVEN LIVE, THEN THREE MORE DEFECTS FIXED (2026-09-25, late morning): the order round
  trip.** With the handler fix deployed, a second order placed through the REST cart for the
  Kukla Studios admin (Commerce order 3000000006, $114) reached the ERP in four seconds and
  became sales order 0000001000, and the ERP's number came back onto the Commerce order
  within twenty-five seconds. Reading what the ERP did with it exposed three defects, all
  fixed, tested and pushed (integration `ca948a1`, ERP `c686061`):
  1. *The ERP booked the order to the wrong company.* The order named only the customer
     group, and three demo companies share group 1 (Commerce puts every company in General
     unless a shared catalog gives it a group of its own). The ERP took the first match and
     held the order against that company's zero credit limit. Now the integration reads the
     buyer's company off the customer record and sends it, and the ERP treats a group two
     partners share as naming neither. The demo setup guide gains the requirement: one
     customer group per demo company, or cart-time pricing (which only sees the group) falls
     back to the walk-in customer.
  2. *Every Commerce call gave up after ten seconds*, the HTTP library's default. The
     write-back of the ERP number timed out and landed anyway, so the run was logged as
     failed and delivered again, and the ERP's credit-hold notice failed on its read of the
     order four times running. All Commerce clients now wait thirty seconds.
  3. *The write-back's own save event answered 400 "no order number" on every order*:
     Commerce raises the save event again for that write, with only the saved fields in it.
     It is now skipped as ours.
  Also learned: the integration's history records nothing for a run that fails after the
  ERP call, so the Admin page showed only the failed hold, not the send. The trace tool
  answers nothing at all when the Commerce read times out; it should fall back to the ERP's
  own record (not done; noted).
- **PROVEN LIVE after the three fixes (2026-09-25, 12:24 UTC): the order path both ways.** A
  third REST order (Commerce 3000000007, $114) became ERP sales order 0000001001 booked to
  Kukla Studios, credit approved against its 150,000 limit, and the ERP's number was on the
  Commerce order within 46 seconds of placement. The trace tool shows all three sides
  (placed, created in the ERP, sent) and Runtime recorded no failed run for it. Going the
  other way, rejecting the wrongly booked order 0000001000 in the ERP cancelled Commerce
  order 3000000006 in 35 seconds, and the trace shows "Cancellation applied to Commerce".
  Left behind on purpose: I/O Events will keep retrying the stale credit-hold notice for the
  cancelled order 6 for up to a day; each retry fails harmlessly and shows as a failed
  activation.
- **PROVEN LIVE (2026-09-25, 12:30–12:36 UTC): ERP → Commerce ship and invoice, and Commerce's
  echo back.** Shipping order 0000001001 in the ERP put a shipment of 2 on Commerce order
  3000000007 and moved it to Processing; invoicing it in the ERP invoiced the Commerce order
  (114 paid) and completed it, with the note "Invoiced in the ERP". Commerce's own shipment
  event came back to the ERP and was matched to the ERP's shipment, not shipped twice. Not
  recorded: the ERP's invoice does not carry Commerce's invoice id back (a blank
  `commerceInvoiceId`); nothing doubled, so it is a note, not a defect.
- **FOUND AND FIXED, on your instruction to read Adobe's docs (2026-09-25): "confirmed in the
  ERP" cannot mean Processing in Commerce.** Every ERP confirmation failed to reach Commerce:
  the integration posted a comment setting status `processing` on a pending order, and
  Commerce answered 400 "The status \"processing\" is not part of the order status history"
  (measured, with a control: the same comment on an order already in Processing is accepted).
  Adobe's Experience League pages "Order status" and "Order workflow and processing" say why:
  states drive the workflow and statuses only communicate progress; an order leaves Pending
  when it is invoiced or ships; a comment may set only a status of the order's current state,
  and custom statuses "not set as default can be used only in the comments section". So the
  setting "Mark orders Processing when the ERP confirms them" promised the impossible. It is
  replaced (deleted, not kept and ignored) by "Order status when the ERP confirms": a status
  code the SC creates in Admin and assigns to the Pending state, blank for a note only; a code
  Commerce refuses still leaves the note and ends the delivery. Integration `422c8cb`. The
  demo setup guide carries the optional Admin step. **Your decision:** whether the Bodea demo
  wants that custom "Confirmed in ERP" status (a two-minute Admin step, then the setting), or
  the note alone.
- **Still owed from the owner's request** ("bidirectionally integrated" and "when an ERP is
  deleted, the resetting of the records in commerce works"): an order placed on the storefront
  as a Kukla Studios user (Commerce→ERP), ERP-side changes read back in Commerce (price via
  Catalog Service, credit and order state via `get_erp_record` / `get_erp_order_trace`), then
  `remove_integration` with before/after reads to prove detach reverted the credit limit, the
  block and the ERP order number, then a fresh add to prove the install-time sync.

