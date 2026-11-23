---
id: PL-113
kind: chore
area: platform
parent: PL-34
needs: []
value: low
status: backlog
---

# Test code has no unneeded type assertions or object-to-string conversions

Filed 2026-11-21 from the backlog reconciliation. PL-34 measured these and left them untouched, and
no item carried them.

Re-run on 2026-11-21 (`npx eslint -c eslint.casts.mjs tests/`): 232 `no-unnecessary-type-assertion`,
83 `no-base-to-string`, 7 `only-throw-error`, 3 `await-thenable`. PL-34 had measured 170 and 40, so
both grew.

Done when those four rules read zero over `tests/`, and the type-aware config runs somewhere that
fails on a new one (the gate or the sweep).
