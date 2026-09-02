---
id: PL-31
kind: chore
area: platform
needs: []
value: med
status: built
parent: PL-30
---

# Retire the 43 re-export index files, module by module

The rule is ratified, documented and enforced as of 2026-08-31. **This item is now
the conversion**: work the `reExportIndex` ledger down to zero, methodically, in
loop-sized batches.

## What was decided, and why it is not the obvious reason

A module is imported by the path that DEFINES the symbol. No re-export-only
`index.ts`, in core or in a feature. The convention is in
[the handbook](../../docs/development/handbook.md) §2; the decision and its sources
are in [ADR-022](../../docs/architecture/adr/022-barrel-files.md)'s 2026-08-31
amendment.

It is adopted for ONE reason: **a symbol reachable by two paths is a symbol whose
home nobody can name.** The published case against barrels is mostly performance
and it was checked and rejected as a justification here — Atlassian's -75% build
minutes came from affected-test selection across 90,000 files, and this repo runs
its full suite in one go over a 3.95s typecheck. Anyone reviving that argument to
justify hurrying this work should re-measure first.

The cost is accepted knowingly: refactoring gets more fragile, because moving a
file changes every importer rather than one barrel line.

## The state, frozen 2026-08-31

`reExportIndex` in `tests/sop/architecture-rules.exemptions.json` — **43 rows**,
shrink-only and bidirectional. Every row carries its kind and its importer count.

| Kind | Count | What conversion means |
|---|---|---|
| **PURE** — re-export only | 20 | Repoint its importers to the declaring modules, delete the file |
| **MIXED** — also declares its own code | 23 | Move the declarations to a named module FIRST, then treat as PURE |

**THAT SPLIT WAS WRONG, corrected 2026-08-31.** The classifier that seeded it
counted `export type { X } from './Y'` as an own declaration — it is a re-export
like any other. Re-measured against a corrected detector, of the 23 rows
remaining at that point **22 are PURE and exactly ONE is genuinely MIXED**:
`src/features/project-creation/helpers/index.ts`, which declares
`export function validateField`. `core/shell` was the clearest case: filed as
"12 re-export lines, 3 own declarations", it is twelve re-export lines and
nothing else.

This matters because it inverted the plan. MIXED was described as "the harder and
more interesting half" needing a two-commit treatment each; there is one of them,
and everything else is the mechanical case the codemod already handles. The ledger
notes were rewritten in place from the corrected detector.

The largest by importers, which is the order NOT to do them in:

    172  src/types/index.ts          MIXED-adjacent, 11 re-export lines
    103  src/core/shell/index.ts     MIXED — 12 re-exports, 3 own declarations
     89  src/core/logging/index.ts   MIXED — 5 re-exports, 2 own declarations
     85  src/core/di/index.ts        PURE — 1 re-export line
     58  src/core/state/index.ts     MIXED — 12 re-exports, 4 own declarations

## How to work it — smallest first, and why

**Start at the bottom of the importer list, not the top.** The early conversions
are where the codemod gets debugged, and a mistake in a 3-importer barrel is
recoverable in a way that a mistake in `@/types`' 172 is not. `@/core/di` is the
useful early exception: 85 importers but ONE re-export line, so it is a wide,
shallow conversion — good for proving the mechanical approach at scale before
anything subtle.

**Do MIXED files in two commits**, never one: move the declarations out, gate,
then remove the re-exports. Collapsing them makes the diff unreviewable and hides
which half broke something.

**Build the codemod as a lint rule, not a script.** Atlassian's approach was an
ESLint rule that functioned as both linter and transformer across ~90,000 files.
Ours is ~785 importers; the same shape converts them AND prevents regression,
which is what "enforced" means here.

**Delete the ledger row in the same commit as the fix.** The check fails on a
stale row, so this is not optional — it is how the ratchet stays honest.

## Done when

`reExportIndex` is empty, the eight webview bundle entries are the only
`index.tsx` files left in `src/`, and the handbook's "43 that predate the rule"
sentence has been updated to say the ledger is closed.

## DONE — 2026-08-31

All three conditions met, and each was verified rather than assumed:

- `reExportIndex` holds **0 rows**. Control-tested both ways: planting a new
  re-export index fails the build and names the file; removing it passes.
- **Seven** `index.tsx` files remain in `src/`, all webview bundle entries. The
  eighth entry is `main.tsx` — and the comment explaining why was STALE, because
  the `index.ts` barrel it was avoiding is one of the 43 now gone. Corrected in
  `esbuild.config.js` and in the handbook, which also said "eight".
- The handbook now states the ledger is closed.

One `index.ts` survives in `src/`: `core/errors/index.ts`. It is not a barrel —
it DECLARES fourteen error classes and helpers, so `@/core/errors` already is the
path that defines the symbol. The rule bans re-export-only indexes, not the
filename.

## Shipped so far

- 2026-08-31  Rule ratified by the owner, documented in the handbook and ADR-022,
  and enforced by the `reExportIndex` ledger seeded at 43 with per-file conversion
  cost. Both directions control-tested; webview bundle entries excluded by reading
  `WEBVIEW_ENTRIES` from esbuild.config.js rather than by a hand-list (`cd13b1e09`)
- 2026-08-31  docs(backlog): PL-31 becomes the conversion phase, ordered smallest-first (`5610ea01a`)
- 2026-08-31  docs(backlog): PL-31 — core barrels are not curated, and ADR-022 says they are (`35447098e`)
- 2026-08-31  refactor(barrels): seven more barrels retired, and the mocks that pointed at them (`79c4d568e`)
- 2026-08-31  refactor(barrels): the three barrels nobody imported through are gone — 43 to 40 (`8611f209f`)
- 2026-08-31  refactor(barrels): export-star, namespace and dynamic imports — 33 to 30 (`2976547ee`)
- 2026-08-31  refactor(barrels): core/base and the last of the small PURE rows — 30 to 26 (`606dc86e5`)
- 2026-08-31  refactor(barrels): core/di retired across 89 importers, and it proved the rule (`49f13f1dd`)
- 2026-08-31  refactor(barrels): core/validation and its nested validators index — 25 to 23 (`7c88295eb`)
- 2026-08-31  refactor(barrels): eight UI/service barrels, and the classification was wrong — 23 to 15 (`3fc45e929`)
- 2026-08-31  refactor(barrels): five more retired, and the fifth barrel-shaped test — 15 to 10 (`22ad6ed56`)
- 2026-08-31  refactor(barrels): the UI hooks and integrations barrels go — 10 to 7 (`350c6f900`)
- 2026-08-31  refactor(barrels): core/utils and its nested progressUnifier index — 7 to 5 (`23ae25fb6`)
- 2026-08-31  refactor(barrels): core/logging retired, and the landmine it was carrying — 5 to 4 (`a7f5e6605`)
- 2026-08-31  refactor(barrels): core/state, and a doc that stated the old rule — 4 to 3 (`f3bd0fe2b`)
- 2026-08-31  refactor(barrels): core/shell across 95 importers — 3 to 2 (`4cf21e74a`)
- 2026-08-31  refactor(barrels): retire the helpers index (PL-31 step 2 of 2) — 2 to 1 (`a56b42a30`)
- 2026-08-31  refactor(helpers): move validateField out of the re-export index (PL-31 step 1 of 2) (`814268b57`)
- 2026-08-31  refactor(barrels): src/types retired — the reExportIndex ledger is CLOSED (`b0910f79f`)
- 2026-08-31  Loop 2026-08-31: all 43 re-export indexes retired; ledger closed
