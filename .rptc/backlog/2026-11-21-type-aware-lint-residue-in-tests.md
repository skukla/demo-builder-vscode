---
id: PL-113
kind: chore
area: platform
parent: PL-34
needs: []
value: low
status: built
---

# Test code has no unneeded type assertions or object-to-string conversions

Filed 2026-11-21 from the backlog reconciliation. PL-34 measured these and left them untouched, and
no item carried them.

Re-run on 2026-11-21 (`npx eslint -c eslint.casts.mjs tests/`): 232 `no-unnecessary-type-assertion`,
83 `no-base-to-string`, 7 `only-throw-error`, 3 `await-thenable`. PL-34 had measured 170 and 40, so
both grew.

Done when those four rules read zero over `tests/`, and the type-aware config runs somewhere that
fails on a new one (the gate or the sweep).

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built. The four rules read 0 over tests/ (npm run lint:types: clean, 2929 files). 231 assertions auto-removed; casts that fed a generic's type (requireMock/requireActual, Testing Library getBy*, Object.values, querySelectorAll) rewritten as explicit generics instead of removed; 83 object-to-string fixed through tests/helpers/toText.ts; 3 needless awaits removed; 5 files that throw a non-Error on purpose exempted from only-throw-error. New periodic sweep check npm run lint:types (scripts/check-type-aware-lint.mjs, verdict in scripts/lib/typeAwareLintVerdict.mjs, tested): fails on any finding, an unreadable file, a short run, or one of the four rules switched off. Done scans: no src/ change, so dead-code, cycle and duplication scans not triggered.
