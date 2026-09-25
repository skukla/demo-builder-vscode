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
