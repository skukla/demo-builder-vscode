---
id: 2026-08-13-test-files-are-not-typechecked
title: Nothing typechecks test files — fixtures can invent shapes and the suite agrees
status: backlog
created: 2026-08-13
priority: high
---

# Nothing in this repo typechecks test files

## Provenance

Raised 2026-08-13 by the Data Installer session (`feature/data-installer`) and routed here to
be filed. **Every claim below was re-verified in this checkout before filing**, and the error
count — the number that decides the shape of the work — was measured here rather than
inherited.

## The gap

Two mechanisms, both read from source:

| Mechanism | What it does with tests |
|---|---|
| `tsconfig.json` | `"include": ["src/**/*"]`, and the `exclude` block lists `**/*.test.ts`, `**/*.test.tsx`, `tests/**/*`. `tsc --noEmit` never opens a test file. |
| `jest.config.js` | Transform is `@swc/jest` on both projects. swc strips types and checks nothing. There is no `ts-jest` diagnostics pass to fall back on. |

So a test fixture can declare a field that does not exist on the interface it claims to
implement, and both the typechecker and the suite pass.

## Why it matters — it has already shipped a total failure

The reporting session hit this twice in one feature on one day:

1. **`prepareImport` read `project.stack?.backend`.** A persisted `Project` has no `stack`
   field — that shape exists only in wizard state, and the backend lives at
   `componentSelections.backend`, which six other readers in this repo use. So **every import
   and every dry run on every real project** resolved to `''` and reported "this project has
   no Adobe Commerce backend". The write path could not work, for anyone, ever. The fixtures
   carried the same invented shape, so the suite agreed with the bug instead of catching it.
   A human pressing the button found it. Fixed in `3d074706` (verified present).
2. Same class, earlier: fixtures inventing `commerce_username` / `commerce_password` where the
   service documents `admin_username` / `admin_password`.

This is the failure mode this repo's CLAUDE.md already names in another costume — a check that
passes because it never ran. The suite is not confirming the code; it is confirming a copy of
the code's mistakes.

## Measured cost — this is a project, not an afternoon

Measured 2026-08-13 in this checkout: a throwaway `tsconfig` extending the real one with
`"include": ["src/**/*", "tests/**/*"]`, then `tsc --noEmit`.

| Metric | Value |
|---|---|
| Total errors | **802** |
| In `tests/` | 802 |
| In `src/` | **0** |
| Files affected | 248 |

Top codes: `TS2345` (116, argument type), `TS2741` (114, missing property), `TS2352` (77,
unsafe cast), `TS2322` (75, assignment), `TS2686` (60, UMD global), `TS2305` (51, no exported
member), `TS2353` (47, unknown object literal key), `TS2739` (42, missing properties).

**Two honest caveats on that 802.**

- **It is an upper bound, not a work estimate.** The measurement used a naive `extends` with no
  test-specific `types` / `lib` / `jsx` settings. `TS2686` (60) and `TS2305` (51) are the shapes
  that typically come from exactly that — a proper `tsconfig.test.json` would likely delete
  whole classes without touching a single test. **Re-measure with a real config before
  planning.** Do not quote 802 as the amount of work; quote it as the reason to measure again.
- **`src/: 0` does NOT mean `src` is proven clean.** It means *zero errors that survive `src`'s
  own casts.* A cast asserts a shape instead of checking it, so it blinds `src` selectively in
  the same way `@swc/jest` blinds tests wholly. The reporting session's handler carried
  `project as { stack?: { backend?: string } }` and **typechecked cleanly for its entire life
  while reading a field that does not exist on `Project`** — removing the cast is what made the
  error appear. Read the zero as "no errors get past the casts", and size the casts before
  quoting it. (Correction contributed by the reporting session after this item was first
  filed; the original wording said the blast radius was "entirely inside `tests/`", which
  overclaimed.)

## Goal / scope

Make test files typecheck, without blocking everyone while 248 files get fixed.

Likely shape — **`tsconfig.test.json` + its own npm script**, not a widening of the main
`include`. That lets it land red and go green incrementally, and keeps `npm run lint` /
`tsc --noEmit` / CI green throughout. Wire it into CI only once it is clean.

## The cheaper partial — record as an alternative, not as step one

**Stop casting in `src`.** The reporting session's handler did
`project as { stack?: ... }`, which threw away the real type and made `src` exactly as blind as
the tests. Removing the cast restored the check — verified by a control: the same class of bug
in `src/` DOES fail (`Property 'stack' does not exist on type 'Project'`) once the code stops
casting the value away.

This does not fix fixtures inventing shapes. It does catch the **consuming** code, which is
where both real bugs actually bit, and it costs nothing.

### Sized 2026-08-13

| Measure | Count |
|---|---|
| `as {` occurrences in `src/` | **127** |
| Files carrying them | **77** |
| `as unknown as {` (double-cast, loudest smell) | 4 |
| Directly on `JSON.parse(...)` (legitimate narrowing) | 6 |
| `project as {` | **0** — the reporting session's five are gone (`3d074706`) |

**Do not read 127 as a defect count.** The dangerous cast is one applied to a value that
*already has a real type* — that is the kind that silently disables checking. A cast that
narrows a genuinely untyped value (`JSON.parse` output, an `unknown` from a boundary) is
correct and should stay. Only 6 are provably the benign kind by pattern, which leaves **~121
that need reading, not grepping.** No grep separates the two; the distinction is what the
value's declared type was before the cast.

Triage cheaply by asking one question per site: *did this value already have a type?* If yes,
delete the cast and see what tsc says. That is a per-site 30-second check, and the four
`as unknown as {` sites are the place to start — three of them are `unref?.()` shims on timer
objects, which is the legitimate pattern, so expect a low hit rate and do not be discouraged
by it.

## The judgement call this item records rather than resolves

Widening typechecking to tests may be the wrong trade if large numbers of **deliberate**
test-only shapes (partial mocks, `as never` stubs, `Partial<T>` fixtures) would each need
annotating. That is a real cost and it buys nothing where the partial shape is intentional.
Nobody knows the split yet. **The re-measured error count, bucketed by "real bug" vs
"deliberate partial", is what decides it** — and that bucketing is step 1, before any fix.

If the answer comes back "mostly deliberate partials", the correct outcome may be to ship the
cheap partial above, add a fixture-factory convention (typed builders returning real `Project`
values), and close the big item as not worth it. That is a legitimate result, not a failure.

## Execution plan

1. Write a real `tsconfig.test.json` (test-appropriate `types`, `lib`, `jsx`). Re-measure.
   **Report the new number and the delta from 802.**
2. Bucket a sample (~40 files) into: real shape bugs · deliberate partials · config artifacts.
   Decide go/no-go on the full sweep from that ratio, and say so explicitly.
3. Ship the `src`-side cast removal regardless (independent, cheap, catches the consuming side).
4. If go: fix by directory, one commit per area, script red→green, wire into CI last.
5. Add a fixture-factory convention so new tests cannot reintroduce invented shapes.

## Constraints

- **Do not widen `tsconfig.json`'s `include`.** CI runs `tsc --noEmit` against it; 802 errors
  would block every PR on day one.
- Whatever lands must keep `npm run lint`, `tsc --noEmit` and the full suite green at every
  commit.
- Do not "fix" a real shape bug by loosening the fixture's type to `any` — that reproduces the
  gap inside the fix.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-test-files-are-not-typechecked.md`. Test files are excluded
> from `tsconfig.json` and `@swc/jest` strips types, so fixtures can invent fields that do not
> exist and the suite passes. Start with step 1: write a real `tsconfig.test.json` and
> re-measure the error count (a naive measurement gave 802 across 248 files, all in `tests/`,
> 0 in `src/` — treat that as an upper bound). Report the new number before proposing any fix.
