---
id: AB-61
kind: fix
area: app-builder
needs: []
value: high
status: built
parent: AB-26
---

# Reset ERPs stops when the integration's undo takes longer than 60 seconds

Found 2026-10-02 on Justrite, three resets in a row: "The ERP reset did not finish: ERP detach
answered 504: Response not yet ready." Both ERPs kept their orders; nothing was wiped.

## What happens (measured)

- Reset's first step is the integration's `erp/detach` web action. A web action's answer is cut
  off at 60 seconds; the action itself runs on (its limit is 300 s), so the undo FINISHES in the
  background while Demo Builder has already stopped. Order 5000000010 carried the reset's note at
  14:34:20Z from the first "failed" reset.
- The slow part is `revertLedger` (commerce-erp-integration `src/lib/ledger.js`): one Commerce
  write per ledger entry, in a row. The ledger held 103 entries, almost all tier prices; the
  scheduled publish of the same prices took 52.6 s and 56.8 s (`erp/scheduled`, 11:35 and 11:45
  EDT), and the first order write of a reset came about 69 s after it started.
- It repeats: detach clears the scheduled-run records, so the next five-minute heartbeat
  republishes every price (ledger 0 at 11:44, 103 at 11:46), and the next reset has the same
  pile to undo.
- Not the cause: the order reads (0.7 to 0.9 s each, measured). Made parallel anyway (11e09d8).

## Fixed (2026-10-02)

- `revertLedger` undoes six Commerce records at a time, each record's own entries still in the
  order written (commerce-erp-integration befc567).
- A detach run can be followed: `POST detach` takes a caller's `run` id and records it running,
  done or failed; `GET detach?run=` answers the record and never detaches (only POST does now);
  `erp/status` says `detachRuns: true` (7ff2121).
- A reset no longer makes the scheduled jobs due: clearing a job's record keeps the moment it
  last ran for (7ff2121).
- Demo Builder sends a `run` with every detach and, on a 504 from an integration that records
  runs, follows the run to its end, then goes on with the wipe and fill (`erpDetachRun.ts`).

Proved live on Justrite: the reset went through in about two minutes (109 prices undone, 9
orders closed, both ERPs wiped and filled). Not yet seen live: the follow path itself, because
with six at a time the undo answered inside the 60 seconds.

## Left out, deliberately

Commerce's bulk tier-price routes (`products/tier-prices-delete` takes a list). One call per row
is what lets a refused row stay on the ledger alone; a bulk call answers refusals without saying
which entry each belongs to.
