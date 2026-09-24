---
id: AB-26q
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j]
value: med
status: built
---

# Screen redesign 4 — settings and journal

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

UI audit: Organisation, Warehouses, Currency and Document numbering cards; the journal's plain kinds in the list and wire names on the detail; live refresh; a Wipe confirmation that names what is lost and that counters survive.

## Verification block (checked by the loop's done gate — §6a of the plan)

Headless checks; `describeEvent` unit tests for every event kind.

## Shipped so far
- 2026-09-24  Picked up (lane 1, ERP only). Staleness check against the UI audit's Settings and Event Journal sections: the Organisation and Warehouses cards shipped with AB-26j; the journal's sentences, plain kinds in the list with the wire name on the detail page, and live refresh shipped with AB-26l; the Wipe button already confirms in a dialog naming what is lost and that the counter survives. What remains: a Currency the money fields fall back to (today USD wherever a record carries none) and a read-only Document numbering card (the three counters' next values). Dependency AB-26j is built on the same branch (loop report decision 7)
- 2026-09-24  BUILT — demo-erp f04c897: the Document numbering card (each range's start and next number, read without reserving; lib/counters STARTS in one place, peek; orders and fulfilment draw from it; a counter never rewinds across a wipe, pinned) and the ERP's own currency for money with no currency of its own (health answers currency = the company code's, from the mapped website; the shell hands it to money.js; the card says which currency stands in and why). The rest of the audit's Settings and Journal asks had shipped in AB-26j and AB-26l. Fingerprint re-accepted for Settings alone; 15/15 stable; suite 258. Done gate: no src/ in this repo; no new pathway (call-path-audit not triggered); no new component (component-extraction not triggered)
- 2026-09-24  docs(rptc): settings slice built — item, programme table, loop report (`a468f1021`)
