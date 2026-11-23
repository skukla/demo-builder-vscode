# The ERP is filled by Demo Builder, and runs as if it were the source (AB-26y, steps 1c to 5)

Written 2026-09-25 from the decided model on AB-26y. Steps 1a (the ERP's words) and 1e (the
fixed name) are built: demo-erp be9879b, 1554681; this repo b8219846e.

## Where the copying lives today (read 2026-09-25)

| Piece | Where | What it does |
|---|---|---|
| `lib/mirror.js`, `lib/mirror-run.js` | integration | reads Commerce (companies, products, variants, sources, stock, websites, store config) and imports it into the ERP through `admin/import`, reporting progress to the ERP's sync record |
| `erp/mirror`, `erp/mirror-job` | integration | run the mirror inline or in the background; Demo Builder's "sync" calls `mirror?background=true` (catalog `sync`) |
| `erp/refresh-job` + an alarm every minute | integration | companies, credit and stock from Commerce into the ERP (`lib/stock-refresh.js`) |
| `erp/refresh-partners` | integration | the partner half on demand |
| `erp/reset` | integration | detach (below), wipe the ERP, mirror again |
| `lib/detach.js`, `erp/detach` | integration | undo every write the integration made on Commerce, from its ledger: credit limits, blocks, names, prices, stock, ERP numbers on orders, holds |
| Settings → Records: Sync records, progress, Wipe | ERP | ask the integration to mirror; show its progress (`admin/sync`, `lib/sync-status.js`); wipe |
| `structureMirror`, `registerWarehouses`, `describeStructure` | ERP | the company code, sales organisations and plants derived from Commerce on every read |

## Target

- **Filling** is Demo Builder's: a "Load demo data" action on the ERP pair's tile, an agent tool,
  and the same step inside reset. Demo Builder reads Commerce with the credential and client it
  already has, writes the ERP through its ordinary import, seeds the ERP's own structure in ERP
  terms, and hands the integration the key map (which Commerce record is which ERP record).
- **Running** has no copying and no polling: changes cross only as events. The integration keeps
  what a real integration has (event handlers, cart webhooks, the Admin page, its history), and
  loses mirror, mirror-job, refresh-job and its timer, refresh-partners, and reset's mirror half.
- **The ERP** loses Sync records, the sync record and `admin/sync`, `structureMirror` and the
  Commerce-derived structure; it gains its own seeded company code, sales organisations and
  plants, editable on Settings like a consultant would.

## Steps (each gated, each its own commit set)

1. **Demo Builder fills the ERP.** A service in `src/features/app-builder/services/` (next to the
   deploy runner) built from the mirror's pure half, ported, not re-invented: the same readers
   over Demo Builder's Commerce REST client, the same import body. Plus the key-map hand-over to
   a new integration route that stores it (a go-live key-map load: honest integration work).
   Verification: unit over fixtures captured from the live mirror; the box harness; live on Bodea
   with the owner.
2. **The integration stops copying.** Delete mirror, mirror-job, refresh-job and the alarm,
   refresh-partners, the sync reporting, the Admin page's Sync records; reset becomes Demo
   Builder's (see question 2). Catalog `sync` removed; the tile's action points at step 1.
3. **The ERP stops being told.** Delete Settings → Records' Sync button and progress,
   `admin/sync`, `lib/sync-status.js`, the sync record; Wipe moves per question 1.
4. **The ERP owns its structure** (audit F1): seeded settings, `describeStructure` reads them,
   Settings edits them; the Mapping tab is pre-filled by step 1 (see question 3); the invoice's
   seller comes from the company code.
5. **The key map leaves the ERP** (F2): the customer loses `commerceCompanyId` and the rest; the
   integration sends the ERP customer number on each order from its key map.
6. **The ERP's own event language** (F3) and **deletes** (F5), as AB-26y describes.

## Questions for the owner (recommendation first)

1. **Wipe moves to Demo Builder** with Load demo data, so the demo controls live in one place,
   and the ERP's Settings loses its Records card entirely. Or it stays on the ERP as the ERP's
   own "delete all data" (real ERPs have client copy and deletion tools, but not on a business
   user's screen).
2. **Undoing the integration's writes on reset** (`detach`) is demo reversibility, not something a
   real integration does. Recommended: the integration keeps its write log (an audit trail of
   what it changed in Commerce, which real integrations do keep), and Demo Builder reads it
   through the integration's history API and does the undo with its own Commerce client. The
   hand-off code then carries an audit trail, not an "undo everything" button.
3. **Pre-filling the Mapping tab from Demo Builder**: its settings live in App Management's
   business configuration. Whether anything outside the app can write them is unverified. If not,
   the integration's defaults do the job (sales organisation 1000 per website), and Demo Builder
   only writes when a demo needs something else.

Also noted: without the minute refresh, a company created in Commerce during a demo reaches the
ERP only if the integration subscribes to a company event; whether it does today is to check in
step 2 (if not, it arrives at the next reset).

## Progress (2026-09-27)

Steps 1 to 3 are built on the loop branches, not deployed: Demo Builder fills the ERP at add,
at Reset records and from Load demo data (this repo `bef6b4fff`, `6670494a9`); the integration's
copy is gone (commerce-erp-integration `4eaf6ac`, contract `4649ef0`); the ERP's Sync records
and sync record are gone (demo-erp `ef7727b`). Question 2 was answered by building it: reset is
Demo Builder's (detach, then the ERP's wipe, then the fill). Questions 1 and 3 are still open.
Still missing from step 1: the key map below.

## Design: the key map (step 1's second half; step 5 depends on it)

**Read 2026-09-27.** The pairing is implicit today. The ERP stores Commerce's ids on its own
customer (`commerceCompanyId`, `customerGroupId`, `emailDomain`, demo-erp `lib/partners.js`),
and `findPartner` matches an order by those, in that order. The integration sends
`commerceCompanyId` on each order (`lib/order-sync.js` `erpOrderFrom`) and the group and email
on a cart price request (`lib/webhook.js` `partnerHints`). The ERP's own credit and block events
carry `companyId: current.commerceCompanyId`, so the ERP speaks Commerce's ids outward too.
Products pair by SKU on both sides.

**What it is.** A record the integration keeps: one row per paired record,
`{ kind: 'customer', commerce: '12', erp: 'C000102' }`. Not a setting (nobody types it) and not
ERP data (the ERP must not know Commerce's ids). It lives in the integration's App Builder
database, beside the write ledger it already keeps, and is shown read-only on the Admin page.

**Who writes it.**
- Demo Builder, at the end of every fill: a new integration web action `erp/keymap`
  (`PUT` replaces the whole map, `GET` reads it). This is a go-live key-map load, which is real
  integration work, so it belongs in the hand-off code.
- The integration itself, when the company event creates a customer the map lacks: it creates
  the ERP customer and records the number the ERP answers.

**Who reads it.** The order sender and the cart price webhook look up the ERP customer number
and send only that. The ERP's credit and block events then carry the ERP number, and the
integration maps it back to the Commerce company. After that, step 5 can drop Commerce's ids
from the ERP customer.

**Rejected.** Keeping the id derivable (`C` + company id) needs no map, but it is Commerce's id
in disguise, and it breaks when the ERP numbers customers itself. Storing the map in the ERP is
the ERP knowing Commerce, which the model rules out.

**Products stay paired by SKU** (recommended): the SKU is the ERP's material number in this
demo, as it often is at a real go-live, and a product map would add a table with nothing to
say. Worth one line from the owner.

**Order of work.** (a) the integration's map store, `erp/keymap` and its tests; (b) Demo
Builder writes it after the fill, and the fill reads back the ERP's customer numbers from the
import answer; (c) the order sender and price webhook send the ERP number; (d) the ERP's events
carry its own number; (e) step 5 removes Commerce's ids from the ERP. Each is its own commit set;
(c) and (d) change the contract, so they bump its version together.
