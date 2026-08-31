# ADR-022: Barrel files — core and types export through them, features do not

**Status**: Accepted (2026-08-30; split from ADR-015 the same day)

**Date**: 2026-08-30

> **Split out of [ADR-015](015-dependency-architecture.md) on 2026-08-30.** ADR-015 had
> accumulated seven rule sections across roughly seven pages, against practice that an
> ADR records *"a single decision"* in *"one or two pages"* (Nygard 2011). This is one of
> the decisions that had been appended to it. ADR-015 keeps the dependency-flow decision;
> the reasoning below is unchanged, only rehoused.

---

## Context

`src/features/CLAUDE.md` asserted that every feature barrel had been deleted and that
adding one would be "dead on arrival". Measured 2026-08-30: **48 barrels existed and 40
had importers.** The guidance was wrong in both directions, in the file agents read as
ground truth.

## Barrel files (`index.ts`) — core and types export through them, features do not

`src/features/CLAUDE.md` said feature barrels "were deleted 2026-08-24 — the
structural baseline measured zero importers for every one of them — so do not add
an `index.ts`; it will be dead on arrival." Measured 2026-08-30: **48 barrels exist
and 40 have importers.** The claim was wrong in both directions, which is worse than
saying nothing, because it is the file agents read as ground truth.

What actually happened is narrower than the doc: commit `75b3b1ce5` deleted the
*dead* feature barrels. Live ones survived, and the top of the list is not a legacy
straggler — it is the documented way this codebase imports:

| Barrel | Importers |
|---|---|
| `@/types` | 168 |
| `@/core/shell` | 104 |
| `@/core/di` | 86 |
| `@/core/logging` | 78 |
| `@/core/state` | 58 |
| `@/core/validation` | 54 |

**THE CONVENTION:**

1. **`@/types` and `@/core/<area>` are imported THROUGH their barrel.** That is the
   public path, it is what `src/CLAUDE.md`'s examples show, and 500+ import sites
   depend on it. A deep import into `@/core/state/stateManager` is the exception,
   not the tidier choice.
2. **Features are imported DEEP** — `@/features/authentication/services/authenticationService`,
   never `@/features/authentication`. A feature has no public API surface to curate,
   because features are not supposed to import each other at all; a feature barrel
   mostly exists to make that easy, which is the wrong thing to make easy.
3. **A barrel re-exports and does nothing else.** No logic, no construction, no side
   effects at import time. A barrel that runs code turns every importer into a
   dependent of everything it re-exports.
4. **A barrel with zero importers is dead code and gets deleted**, under the repo's
   standing no-soft-deprecation rule.

**The five feature-level barrels that remain** (`ai`, `authentication`,
`data-installer`, `eds`, `sidebar` — 17 importers between them) are legacy under rule
2. Convert their importers to deep imports when you are already in the file; do not
sweep. `eds`'s two importers are both in `dashboard/`, so that barrel is currently
serving exactly the cross-feature import the architecture says should not exist —
which is the clearest possible argument for rule 2.

**Status: GUIDANCE.** Nothing enforces the core-versus-feature split today. The one
part that could be checked cheaply is rule 4, and it is deliberately not automated
yet: a first pass at counting importers on 2026-08-30 produced false matches by
treating any `from './hooks'` as a reference to one particular `hooks/` directory. A
dead-barrel check needs real module resolution, not a regex, or it will delete a
live file.


## Consequences

**Positive.** The rule matches what the codebase already does for `@/core/*` and
`@/types`, so it ratifies practice rather than fighting it, and it names the one shape
that is genuinely harmful: a feature barrel that makes cross-feature imports easy.

**Negative.** The five surviving feature barrels are legacy under this rule and will be
converted opportunistically, so the codebase stays inconsistent for a while.

**Neutral.** Not enforced. A dead-barrel check is possible but needs real module
resolution — a first attempt using a regex produced false matches by treating any
`from './hooks'` as a reference to one particular directory.

## Amendment 2026-08-31 — the reasoning was wrong, and the rule now covers core too

This ADR justified core barrels as "a shared surface worth curating" and banned
feature barrels. The ban was right. The justification was not, and the split it
implied does not describe this codebase.

**Measured on 2026-08-31.** 103 of 165 named exports across the core barrels are
never imported through their barrel — 62%. `@/core/shell` exports 22 names and 5
are used through it; the `eds` FEATURE barrel was retired the same day for
exporting 41 lines with 5 in use. Same shape, opposite verdict, and the only thing
separating them was which half of this ADR they fell under.

**Research changed the shape of the rule.** The accepted industry principle is
about PLACEMENT, not layer: a barrel is the public API of a unit, and files inside
that unit import each other directly rather than through it. Measured against that
rule, this codebase is not split between two conventions — it is already on the
far side of the line. **1,935 imports reach into a module from outside it against
162 from within.** The barrels are the minority report.

**So the rule is now one rule, and it covers core.** A module is imported by the
path that defines the symbol. No new re-export-only `index.ts` anywhere. The 43
that predate this are a shrink-only ledger (`reExportIndex`); `featureBarrels` is
empty and is now an outright ban.

**What was checked and deliberately NOT used as a reason.** The published case
against barrels is mostly performance, and it does not transfer here. Atlassian
measured -75% build minutes across ~90,000 files; Angular removed barrels from its
linker for a 500ms-1s compile saving; Next.js ships `optimizePackageImports` for
package barrels. Our whole typecheck is 3.95s across 2,202 files, and the suite
runs in FULL rather than selecting affected tests — so both mechanisms behind those
wins (dev-server graph resolution, affected-test selection) have nothing to bite
on here. Webpack's own guidance also makes the tree-shaking loss conditional on
side effects, not on barrels as such.

The rule is adopted for ONE reason: a symbol reachable by two paths is a symbol
whose home nobody can name. LedgerHQ, enforcing the same convention, called it
"dual import paths for the same symbol, hiding true providers".

**The cost is real and is accepted knowingly.** Refactoring gets more fragile:
move a file inside a module and every importer changes rather than one barrel
line. That is Atlassian's stated trade-off, and it is a cost this codebase has
already paid for 1,935 of its imports.

Sources: [Atlassian](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) ·
[Angular #61618](https://github.com/angular/angular/pull/61618) ·
[Next.js optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) ·
[LedgerHQ #20595](https://github.com/LedgerHQ/ledger-live/pull/20595) ·
[webpack tree-shaking guide](https://docs.webpack.js.org/guides/tree-shaking)
