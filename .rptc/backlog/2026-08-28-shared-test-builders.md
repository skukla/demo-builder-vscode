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

## Deliberately left — the standing list

Every item here was a decision, not an omission. Recorded because a deferral that
lives only in a commit message is a deferral nobody finds again.

**Items 1, 2 and 3 are now CLOSED (2026-08-31).** Their entries are kept rather
than deleted, because in all three cases the recorded reason for deferring turned
out to be wrong, and how it was wrong is the useful part. What remains open is
items 4-6, and 4 is a measured decision to build nothing.

### 1. Logger literals inside `jest.mock` factories — CLOSED 2026-08-31

Filed as "twenty-six, load-bearing, expect them to collapse when [[PL-31]] retires
the logging barrel". The count was 23 across 21 files, and waiting for PL-31 turned
out to be unnecessary — but the reason they survived is the part worth keeping.

**Nothing was measuring them.** Both ratchets in `canonical-fakes.test.ts` walk
object literals in ordinary test code; neither looks inside a `jest.mock` factory.
So this group sat in a blind spot and outlived every other one — not because it was
hard, but because it was invisible. A check now covers it, control-tested by
planting a violation and confirming it is named.

The stated blocker was also only half true. A factory is hoisted above the imports
and cannot reference an imported builder — but the factory BODY runs lazily, so a
`require()` inside it reaches the builder fine. That idiom had been proven on a real
suite in August and then reverted "to keep the batch one shape", which is how a
solved problem stayed filed as a blocked one for three days.

What it actually split into, once probed rather than reasoned about:

| | |
|---|---|
| Deleted — the global setup mock now covers them | 14 |
| Converted to the builder via lazy `require` | 8 |
| Deleted — dead, its suites pass without it | 1 |

**Thirteen of the fourteen deletions came from one source line.**
`prerequisitesCacheManager.ts` is the only file in `src/` that imports
`@/core/logging/debugLogger` rather than the barrel, and the shared node setup
mocked the barrel ALONE — so its whole suite family could not use the shared mock
and each file re-implemented it. Covering the deep path in `tests/setup/node.ts`
deleted all thirteen at once. That change also had to happen for PL-31 regardless:
the old single-path mock would have stopped intercepting anything the moment the
barrel was retired.

Two mistakes, both caught by the suite:

- The removal pattern `'@/core/logging[^']*'` also matched
  `@/core/logging/errorLogger`, which stubs a CLASS rather than the accessor.
  Restored.
- A converted factory read its captured `mockDebug` at factory-run time instead of
  on the first `getLogger()` call. The factory is hoisted above
  `const mockDebug = jest.fn()`, so two suites failed to LOAD with "cannot access
  before initialization" — and because they never ran, the summary read
  "0 tests failed". Fixed by memoising inside `getLogger`.

### 2 and 3. The `{ execute }` fakes — CLOSED 2026-08-31 (`10d77eb3b`)

These were filed as two separate deferrals, "eleven cast `as never`" and "fifteen
ambiguous". **Both descriptions were wrong, and reading the declared types is what
showed it.**

There were **42**, not 26. The counts came from a line-based scan that missed every
multi-line literal.

And none of them were ambiguous. Every consumer — `ServiceLocator.setCommandExecutor`,
every `commandManager:` field, every constructor argument — declares `CommandExecutor`,
and one `grep` of the signatures said so. "Not clearly a CommandExecutor" was a
guess presented as a finding; the falsifying command took one call and was
available before the deferral was written.

The resolution, once the types were read:

| | |
|---|---|
| A builder call with a redundant cast bolted on — the builder already returns the right type | 11 |
| A bare `{ execute }` literal, which cannot satisfy a CLASS with private fields | 30 |
| A pair of `as any` on a helper whose own interface declares what the builders return | 1 |

All 42 gone, adopters 32 → 67, `as never` across tests 880 → 803. The general rule
this exposed — that `as any` and `as never` are banned outright in tests — is now a
convention with its own ratchet, tracked as [[PL-32]].

### 4. Four one-method shapes NEED NO BUILDER — measured, not skipped
`{ dispose }` (78), `{ getAccessToken }` (65), `{ report }` (41),
`{ executeCommand }` (38). Each stands in for a ONE-METHOD interface —
`vscode.Disposable`, `TokenProvider`, `vscode.Progress`, and the vscode commands
bridge. A literal `{ dispose: jest.fn() }` is a COMPLETE fake of `Disposable`;
there is nothing for a builder to supply and nothing to drift.

This sharpens the convention rather than dodging it: the smell was never
"hand-rolled", it is **incomplete relative to the real type**, and a one-method
interface cannot be incomplete. The 222 literals in this group are correct as they
stand. Do not build these four builders.

### 5. The flaky socket test
`inExtensionMcpServer.test.ts` → "reports the build label when one is supplied"
timed out once under full-suite load, passed 3/3 alone, and passed with unrelated
changes stashed. A binding race the suite's own comment says it makes visible
rather than fixes. Not this item's, but nobody else has it.

### 6. Component mutation coverage
Needs a react-only Stryker config; blocked on the `@jest-environment` pragma vs
sandbox interaction and on `user-event`'s clipboard teardown. Raised 2026-08-30 and
never filed anywhere until now.

## Shipped so far

- 2026-08-28  refactor(tests): type the builders that stand for real interfaces (`969e91786`)
- 2026-08-28  refactor(tests): type the mesh-result builders — and make them USE the canonical (`7b324e19d`)
- 2026-08-28  docs: correct the "47 wrong fixtures" claim — 186 more exist and none are defects (`abd4217fa`)
- 2026-08-28  refactor(tests): canonical Project fixture — the consolidation queue is DONE (`6ad910167`)
- 2026-08-28  refactor(tests): context builders get honest, suite-specific names (`16e38b901`)
- 2026-08-28  refactor(tests): handler contexts delegate to the canonical — and one must not (`cc3d77168`)
- 2026-08-28  refactor(tests): canonical ExtensionContext fake; the ratchet caught me twice (`2a0415207`)
- 2026-08-28  refactor(tests): canonical command-executor fake — nine definitions become one (`ea5d2b9ee`)
- 2026-08-31  docs(tests): record what the wall conversion actually found, and unify four copies (`724e85136`)
- 2026-08-31  refactor(tests): the last four walls — and none of them needed the pipeline narrowed (`b60c4d53e`)
- 2026-08-31  refactor(tests): 17 more mocks that were silencing nothing (`630eb56b7`)
- 2026-08-31  refactor(tests): the Configure command's Helix seam — and a count I got wrong (`d20187b26`)
- 2026-08-31  refactor(tests): five of the walls were silencing nothing — and a correction (`6d97da93b`)
- 2026-08-31  fix(tests): the deletion suite was not testing the CDN unpublish at all (`25f111120`)
- 2026-08-31  refactor(tests): a handler takes a seam as a third optional parameter (`92af36cd4`)
- 2026-08-31  refactor(tests): edsContentSetup, and the helpers it hands its Helix to (`69313cd41`)
- 2026-08-31  refactor(tests): configSync stops reaching into the module registry mid-test (`e03f827c1`)
- 2026-08-31  refactor(tests): a factory seam keeps a construction assertion after the wall goes (`0b9d12f56`)
- 2026-08-31  refactor(tests): narrow two service parameters to what the migration calls (`464d116e6`)
- 2026-08-31  refactor(tests): two more walls, and a third that should not come down (`9a7eaf7bf`)
- 2026-08-31  docs(handoff): queue PL-22 into the loop, and record the merge (`4f3331631`)
- 2026-08-31  Merge track-3 convergence: 8 of 28 mock walls down (`15121258d`)
- 2026-08-31  docs(handoff): loop state and report for the overnight track-3 run (`84e78bffb`)
- 2026-08-31  refactor(tests): catalogPrewarmPhase — the witness converts without losing a thing (`459811c79`)
- 2026-08-31  refactor(tests): edsResetUI — a seam where a dynamic import had left none (`3ab746c7e`)
- 2026-08-31  refactor(tests): three more walls down — republish, and both contentAuthoring specs (`d6e234b8c`)
- 2026-08-31  refactor(eds): seams for storefrontSetupPhases and edsResetConfigStep (`7eb7002ce`)
- 2026-08-31  refactor(tests): refreshBlockLibraryHeadless takes Helix through its deps (`32e955959`)
- 2026-08-30  refactor(tests): publishKeyRegistrar takes Helix through the front door (`fe15fc6db`)
- 2026-08-31  Rule 1 (one home per builder) verified done — zero duplicate builder names, enforcer green. Added tests/sop/canonical-fakes.test.ts: a shrink-only ledger that stops NEW hand-rolled logger fakes (420 grandfathered). Converted the 22 files this session touched; ledger 420 -> 408.
- 2026-08-31  test: convert the suites this session touched to the shared logger builder (`8a80f4777`)
- 2026-08-31  test(sop): stop the hand-rolled-fake bleeding, rather than draining the pool (`24827cd9a`)
- 2026-08-31  docs(loop): the wall conversion, written for someone who was not here (`c17385ed7`)
- 2026-08-31  Slice done overnight 2026-08-31: rule 1 (one home per builder) verified already complete; canonical-fakes ratchet added and honestly re-measured (301 real, after excluding 107 jest.mock-factory literals the runtime forbids converting); logger ledger now 296. Remaining: the other fixture kinds PL-16 names (state manager, project, token provider), still convert-on-touch.
- 2026-08-31  test(helpers): 121 logger fakes become calls to the builder that already existed (`9942fb1c6`)
- 2026-08-31  test: 138 logging mocks were dead — probed as a set, then module by module (`5439928d1`)
- 2026-08-31  test(setup): every suite gets a working getLogger, so none has to mock one to survive (`42e643835`)
- 2026-08-31  test: 68 `as never` casts deleted outright, 10 more now name what they pretend to be (`b8c3d9a95`)
- 2026-08-31  docs(backlog): capture what was deliberately left, and rule that four shapes need no builder (`4466bafaa`)
- 2026-08-31  test(helpers): 29 command-executor fakes adopt the builder, and the typing found four invented shapes (`25a0a84b7`)
- 2026-08-31  test(helpers): the canonical Project fixture was copied from the wrong artifact (`db07d4eb9`)
- 2026-08-31  docs(tests): the global logger mock is aimed at a barrel we have scheduled for deletion (`f704df787`)
- 2026-08-31  test(shell): three logging mocks my probe never looked at, and they were dead (`7bd437597`)
- 2026-08-31  test: the 243 deferred loggers were 217 convertible and 26 real — 466 down to 30 (`d29a94838`)
- 2026-08-31  feat(tests): the cast is the smell — nine ratcheting ceilings, target zero (`1b214a9ad`)
- 2026-08-31  test(helpers): the StateManager fake covers the interface, and the typing caught four defects (`76190bd73`)
- 2026-08-31  test(logging): the factory-logger group closes — 23 to zero, and the blind spot with it (`9371cc9be`)
- 2026-09-01  fix(sop): the cast bans are narrower than they read, and the compiler named the next builders (`e7769713a`)

## Reopened by the compiler, 2026-09-01 — and it named the next builders itself

`HandlerContext` casts were converted to `createMockHandlerContext(...)` on the AST.
51 of 74 files then failed `typecheck:tests`, and the failures are the useful part:
the literals hold PARTIAL FAKES OF COLLABORATORS. `as unknown as HandlerContext`
erased that; handing the same literal to a typed builder does not.

So the compiler produced a build order, ranked by how many conversions each unblocks
— which beats guessing, and is the first time this item has had a priority that was
measured rather than argued:

| Blocking type | Failures | Builder? |
|---|---|---|
| `SecretStorage` | 21 | **none** |
| `AuthenticationService` | 16 | **none** |
| `globalState` (Memento) | 12 | yes — `createStatefulGlobalState`, added 2026-09-01 |
| `StateManager` | 12 | yes |
| `ExtensionContext` | 9 | yes |
| `WebviewPanel` | 5 | **none** |
| `Project` | 5 | yes |
| `Logger` | 3 | yes |
| `TokenManager` | 2 | **none** |

**41 failures are for types that ALREADY have a builder.** Those files do not need
new fakes — they need the codemod to replace the member with its builder too, not
just the outer context. That is a codemod change, not a design question.

**44 need a builder that does not exist**, and two types are most of it:
`SecretStorage` (21) and `AuthenticationService` (16). Writing those two unblocks
roughly 37 of the 44.

Order to work in: extend the codemod to use existing builders for members (41), then
`SecretStorage`, then `AuthenticationService`, then re-run. `WebviewPanel` and
`TokenManager` are small enough to leave.

Method and tooling: `docs/development/toolchain.md`, harness at
`scripts/codemod/project.mjs`.
