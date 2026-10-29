# ERP epic — loop report, 2026-09-27 (owner away)

## In short

Demo Builder now fills the ERP from Commerce in all three places: after the add, inside Reset
records, and from a new "Load demo data" item on the ERP's card. The integration and the ERP no
longer copy anything between the two systems, and the every-minute refresh is gone. From here,
changes cross only as events. Nothing was deployed. Bodea still runs the integration from
`main` (088154b) and the ERP from `main` (6d2c504).

## Shipped (built and tested, on work branches)

| Where | Commit | What |
|---|---|---|
| Demo Builder | `bef6b4fff` | The add and Reset records fill the ERP through Demo Builder. Reset is: undo the ERP's writes in Commerce, wipe the ERP, fill it again. |
| Demo Builder | `6670494a9` | "Load demo data" on the ERP card. No confirm, because it removes nothing. |
| Integration | `4eaf6ac` | Removed the copy (mirror, reset, the minute refresh and its timer, partner refresh) and the Admin page's Sync, Refresh and Reset buttons. 418 tests pass. |
| Integration | `4649ef0` | Contract copy without Sync records. |
| ERP | `ef7727b` | Removed the Sync records button and the progress record only the old copy fed. 256 tests pass. |
| Demo Builder | `37fe91fb3` | Plan updated, with the key-map design (below). |

Demo Builder's full gate passed before each push: 1,732 suites and 30,683 tests.

## What this changes for a demo

- A company saved in Commerce reaches the ERP through Commerce's company event, which
  replaces the minute refresh. That event path is built but **not yet proven live**.
- Stock moved by Commerce's own Transfer, Import or a REST write raises no event, so it no
  longer reaches the ERP. Use Move stock instead. You agreed this trade earlier.

## Corrected

An earlier backlog line said Commerce has no company event. That was wrong. It has one, and the
integration subscribes to it. The backlog item now carries the correction.

## Next: the key map

A stored table of which Commerce record is which ERP record. Today the pairing is implied:
customer `C12` is Commerce company 12, and products match by SKU. The design is in
`.rptc/plans/erp-demo-filling/overview.md`, and nothing is built yet. It follows the model you
decided on 2026-09-25, so I can build it next unless you say otherwise.

## Your decisions

1. **Merge and deploy.** Merge the integration's loop branch into `main` and update Bodea. This
   also ships the Admin page redesign you haven't seen yet. Same for the ERP. Then run one live
   pass: add, reset, Load demo data, save a company, and place an order.
2. **Wipe on the ERP's own screen.** Remove it, since Demo Builder's Reset already wipes, or keep
   it as the ERP's own "delete all data" button. My recommendation is to remove it.
3. **Products paired by SKU**, with no product table. Recommended.
4. **Still pending from before:**
   - test the Move stock page by hand;
   - the queued "Update attributes" job on Bodea that never ran;
   - capture event payloads during the live run.

## Later the same day: the key map

The integration now keeps a table of which Commerce company is which ERP customer. It is not
deployed yet.

- **Who fills it.** Demo Builder loads it after every fill. An integration too old to have the
  table is filled without it, and the progress message says so, so Bodea keeps working.
- **Who reads it.**
  - Orders send the ERP customer number from it. A test proves this: it fails when the table
    is not used.
  - The ERP's credit-limit and block events find the Commerce company through it.
  - A company saved in Commerce updates its paired ERP customer, or adds a new pair.
  - The Admin page's company lookup reads through it.
- **Tests.** The integration's 441 tests and Demo Builder's full gate pass.

**Waiting on you: the cart price check.** Commerce's cart payload names only the customer
group, not the company. So the check still relies on the ERP matching the buyer by group and
email. Sending the ERP number would need one extra Commerce read on every cart update, in a
check that breaks the cart when it fails. My recommendation is to read it once per customer
and store it. Until this is settled, the ERP has to keep the Commerce ids it holds.
