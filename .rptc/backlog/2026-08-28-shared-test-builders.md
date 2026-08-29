---
id: PL-16
kind: fix
area: platform
needs: []
value: high
status: active
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

## THE PLAN (added 2026-08-28, after the owner asked how to address it)

### The finding that determines the approach

The problem is not that nobody built shared fixtures. **98 builder functions
already exist in `tests/`.** The problem is that 14 of those NAMES are defined
in more than one file — 43 redundant definitions — because there is no canonical
home, so writing another is cheaper than finding the existing one.

| Copies | Name | Distinct return types |
|---|---|---|
| 10 | `createMockContext` | 6 |
| 9 | `createMockLogger` | 4 |
| 8 | `createMockProject` | 3 |
| 5 | `createMockHandlerContext` | 3 |
| 4 | `createMockCommandManager` | 1 (all untyped) |
| 3 | `createMockCommandExecutor` | 2 |

Note the return types. Ten `createMockContext` functions across six signatures
are not one thing people share — they are six incompatible things wearing one
name. An earlier version of this item cited `createMockHandlerContext` as proof
that sharing works when a builder exists. There are five of it. That claim was
wrong and is withdrawn.

So the unit of work is **43 duplicate functions**, not 2,532 literals. Fix the
builders and every future test has one obvious thing to import; fix the literals
first and they have nothing to converge on.

### Four rules, in the order they matter

**1. One home, one rule for what goes there.**
`tests/helpers/` holds any fake two different feature directories need — logger,
project, handler context, command executor, state manager, token provider,
progress reporter, the vscode bridges. A `*.testUtils.ts` beside a suite stays
for setup specific to that subject. The test is mechanical: *does a second
feature directory need it?* If yes, it moves.

**2. Typed to the real interface. No `as never`, no `any`.**
163 hand-rolled fakes are currently cast to `never`/`any`, which switches the
compiler off for exactly the thing most likely to drift. A builder typed
`(): Logger` fails to compile the day `Logger` gains a method — one failure, one
fix. A fake cast to `never` fails nothing and silently stops matching reality.
This is the repo's standing "a cast is a silenced type error" rule applied to
test code, where it has been ignored.

(The `meshDepsFake` written earlier today returned `as never`. Corrected —
it is the principle, and it was violated in the same commit that argued for it.)

**3. Derive the shape from what exists, never from memory.**
Method lists come from the real interface plus what callers actually use — read,
not recalled. Data fixtures (`Project` above all) are copied from a real
`~/.demo-builder/projects/*/.demo-builder.json`, per the standing rule that
already has one incident behind it.

**4. A ratchet, or it regresses.**
A check that a builder name may not be defined in two places, with the current
14 as a shrinking ledger. Without it, the 43 become 44 the next time somebody
cannot find something — which is precisely how they became 43.

### Sequence

1. The ratchet check first, with today's 14 names as the baseline. It cannot
   fail anything that exists; it stops the number growing while the rest
   proceeds.
2. Consolidate the duplicated builders, most-copied first: `createMockContext`
   (10), `createMockLogger` (9), `createMockProject` (8),
   `createMockHandlerContext` (5). Each collapse is behaviour-preserving and
   proves itself by leaving assertions untouched.
3. The 2,532 literals convert **on touch**, never as a sweep. A suite adopts the
   builder when it is open for another reason.
4. Each ADR-015 conversion batch ships its builder WITH it, so the program stops
   adding to the pile.

### What success looks like

`node .claude/skills/test-divergence-scan/scan.mjs tests` reports fewer distinct
shapes at each release cut, and the duplicate-builder count only falls. Those two
numbers are the whole measure; nothing here needs a subjective judgement.

## Guard


`node .claude/skills/test-divergence-scan/scan.mjs tests`, at release cuts. The
table above is the baseline a later run is compared against.

## Shipped so far

- 2026-08-28  refactor(tests): type the builders that stand for real interfaces (`969e91786`)
- 2026-08-28  refactor(tests): type the mesh-result builders — and make them USE the canonical (`7b324e19d`)
- 2026-08-28  docs: correct the "47 wrong fixtures" claim — 186 more exist and none are defects (`abd4217fa`)
- 2026-08-28  refactor(tests): canonical Project fixture — the consolidation queue is DONE (`6ad910167`)
- 2026-08-28  refactor(tests): context builders get honest, suite-specific names (`16e38b901`)
- 2026-08-28  refactor(tests): handler contexts delegate to the canonical — and one must not (`cc3d77168`)
- 2026-08-28  refactor(tests): canonical ExtensionContext fake; the ratchet caught me twice (`2a0415207`)
- 2026-08-28  refactor(tests): canonical command-executor fake — nine definitions become one (`ea5d2b9ee`)
