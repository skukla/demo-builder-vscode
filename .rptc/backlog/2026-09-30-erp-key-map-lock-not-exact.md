---
id: AB-48
kind: fix
area: app-builder
parent: AB-16
needs: []
value: med
status: shipped
---

# The key-map State lock is not exact, and its commit message says more than it does

Filed 2026-09-30 from the review of the other agent's work. The reviewer's finding on
`commerce-erp-integration/src/lib/state-lock.js` (lines ~42-57): two takers that both
read "no holder" before either writes can both put and each read its own token back
(A puts, A reads A; B puts, B reads B). The file already admits Adobe State has no
compare-and-set; the test drives an in-memory client that never opens this window. The
AB-16g commit message — "a fill cannot drop pairs" — claims more than the mechanism
guarantees.

## What the lock is for

AB-16g: two fills (or a fill and an event handler) writing the key map at once lost pairs.
The lock makes the common case safe; the residual window is a same-millisecond race.

## Fix taken

Say so where it is read: the header states the residual race plainly, what would close it
(a compare-and-set State does not offer, or a single writer), and that the lock is
best-effort. No mechanism change — none is available in State; a false claim of exactness
is the defect.

## Verification

The header names the window and its size; the existing lock tests unchanged.

## Shipped so far

- 2026-09-30  2026-09-30 FIXED AS DOCUMENTATION (integration 3b328b9, feature/live-checks-at-checkout). state-lock.js header now states the lock is best-effort, names the get→put→get race (two takers each read back their own token), sizes it, says State has no compare-and-set so nothing here closes it, and that the tests prove the protocol not the race. No mechanism change — none is available.
- 2026-10-03  Shipped 2026-10-03 by the owner's finish line for work that lives only in the ERP and integration repositories: on their main branch and deployed (they carry no release tags). Any live proof this item still names is a check, not a reason to hold it open.
