---
id: PL-16
kind: fix
area: platform
needs: []
value: high
status: backlog
---

# Give StateManager and Project fixtures a shared builder, the way HandlerContext has one

Filed 2026-08-28 from the test-divergence audit the owner asked for after
noticing that suites "do things their own way".

## The measurement — WHOLE SUITE, corrected 2026-08-28

The first version of this item measured five collaborators and concluded
"medium value, adopt opportunistically". The owner pushed back that this sounded
like a large consolidation opportunity. Measuring the whole corpus rather than
five samples says they are right.

Every object literal in `tests/` whose values are `jest.fn()` — i.e. a
hand-rolled fake of something:

    1,289 test files
    2,532 hand-rolled fakes
      552 distinct shapes
      305 shapes (55%) used EXACTLY ONCE

The most-copied shapes are the consolidation targets, and they are not exotic:

| Copies | Shape | What it is |
|---|---|---|
| 331 | `{ debug, error, info, warn }` | a logger |
| 228 | `{ debug, error, info, trace, warn }` | the SAME logger, plus `trace` |
| 90 | `{ dispose }` | a disposable |
| 80 | `{ getAccessToken }` | a token provider |
| 79 | `{ execute }` | a command executor |
| 55 / 46 | `{ get, update }` / `{ get }` | config or memento |
| 44 | `{ report }` | a progress reporter |
| 44 | `{ executeCommand }` | the vscode command bridge |
| 43 / 29 | `{ getCurrentProject }` / `+ saveProject` | a state manager |

**559 logger fakes, split across two shapes that differ by one key.** Nobody
decided that; it accumulated.

## The part that raises the priority: the conversion program FEEDS this

ADR-015 removes module mocks by making services take their dependencies. Every
converted service then needs a fake — and with no shared builder, each suite
writes its own.

Measured on this session's own commits: roughly **20 new hand-rolled fakes added
in one day**, including `const meshDeps = { ... }` written out **ten times**,
identically, once per file, and `const executor = { execute: ... }` six times
across three different spellings.

So this is not a tidy-up to schedule after the architecture work. Without shared
builders, the architecture work makes it worse at a measurable rate. That is why
this is not "adopt opportunistically".

## What good looks like, already in the repo

`createMockHandlerContext`: 165 suites use it, 4 hand-roll their own. Not
discipline — a builder that exists, is findable, and covers the real need.
Divergence collapses on its own where that is true.

## The work, ordered by copies

1. **Logger** — 559 copies, two shapes. One `createMockLogger()` covering the
   full method set. Highest count, lowest risk: a wrong logger fake fails loudly.
2. **The deps bags this program is creating** — `meshDeps`, `executor`,
   `secretsFake` and friends. Build these AS each conversion batch lands, not
   after; that is what stops the bleeding.
3. **State manager** (72 copies across two shapes) and **Project fixture** (32
   shapes / 38 uses, 25 used once). Highest risk, because a wrong Project shape
   typechecks — copy from a real `.demo-builder.json` per the standing rule.
4. **Token provider** (80), **progress reporter** (44), **command bridge** (44).

Convert a suite when it is next touched; do not sweep. The scan's numbers are
the progress measure.

## Still true: nothing is currently WRONG

The audit checked specifically for the known-bad Project shape and found ZERO
genuine instances — nine files matched the pattern and all nine were read and
were legitimate. This is a maintenance and drift problem, not a field of live
defects. It has bitten once (a fixture written from memory; three tests failed
against the real accessors) and was caught.

## Guard

`node .claude/skills/test-divergence-scan/scan.mjs tests`, at release cuts. The
table above is the baseline a later run is compared against.
