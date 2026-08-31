---
id: PL-31
kind: chore
area: platform
needs: []
value: med
status: backlog
---

# ADR-022 says core barrels are a curated surface. They are not.

Filed 2026-08-31 on the owner's challenge — "but should core barrels be real?" —
asked while five FEATURE barrels were being retired under
[ADR-022](../../docs/architecture/adr/022-barrel-files.md) and a test-setup change
had just pointed every logging mock AT a core barrel.

The two are not in conflict, and the reason matters: **ADR-022 bans feature
barrels, not core ones.** `src/CLAUDE.md` states it directly — "`@/core/*` and
`@/types` are imported through their barrels; features are imported directly and
get no barrel". Production agrees: **53 source files import `@/core/logging` and
exactly ONE imports `@/core/logging/debugLogger`.** A barrel that 53 files import
is the real module, whatever anyone thinks of barrels.

## What is wrong is the JUSTIFICATION

ADR-022 defends core barrels as "a shared surface worth curating". Measured, they
are not curated — they are accumulating exactly the way the feature barrels did.

**103 of 165 named exports are never imported through their barrel — 62%.**

| Barrel | Named exports | Used | Unused |
|---|---|---|---|
| `@/types` | 43 | 7 | 36 |
| `@/core/validation` | 31 | 14 | 17 |
| `@/core/utils` | 28 | 12 | 16 |
| `@/core/shell` | 22 | 5 | 17 |
| `@/core/state` | 13 | 3 | 10 |
| `@/core/logging` | 9 | 7 | 2 |
| `@/core/handlers` | 7 | 3 | 4 |
| `@/core/cache` | 5 | 4 | 1 |
| `@/core/base`, `communication`, `di`, `vscode` | 7 | 7 | 0 |

For scale: the `eds` FEATURE barrel was retired the same day for having 41 export
lines with 5 in use. `@/core/shell` is 22 with 5, and `@/types` is 43 named with 7.
Same shape, opposite verdict, and the only thing separating them is which ADR
covers them.

**Caveat on the numbers, stated so nobody over-reads them.** The count is named
`export { … }` entries matched against `import { … } from '<exact alias>'`. Seven
`export *` lines in `@/types` (and one in `@/core/utils`) are not counted, so both
its surface and its usage are understated. The 62% is the direction, not a
precise figure — re-measure before acting.

## What to do, and what NOT to do

**Do not delete the core barrels.** They are what production imports, and the
churn would be hundreds of import lines for no behavioural gain. It would also
break the rule the test setup now depends on: mock `@/core/logging`, because that
is what the code takes.

Two things worth doing:

1. **Correct ADR-022's reasoning.** It currently justifies the split on
   curation, and curation is not what is happening. The honest justification is
   about DIRECTION: core is the shared floor everything is built on, so a stable
   named surface for it is worth having; features are meant to stay replaceable,
   and a feature barrel mostly makes cross-feature imports easy, which is the
   thing to discourage. That argument survives the measurement. The curation one
   does not.

2. **Trim the dead surface.** 103 unused re-export entries cost nothing at
   runtime and do cost a reader: a barrel that exports 22 names when 5 are used
   overstates what the module offers. `dead-code-scan` already reports unused
   exports; the barrels are where its findings are least obvious, because the
   symbol IS exported and IS re-exported — just never imported by that path.

## Why this is its own item

It surfaced during [[PL-16]] and belongs to neither that item nor [[PL-13]]. It is
a documentation correction plus a cleanup, gated on nothing, and it should not
ride along inside a test-fixture consolidation where nobody would find it later.
