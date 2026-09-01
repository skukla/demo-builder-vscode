---
id: PL-34
kind: chore
area: platform
needs: []
value: high
status: active
---

# Every open finding from the 2026-09-01 toolchain day, in one list

One work log, so nothing from that session survives only in a commit message. Each
row states what is true, what it costs, and how it is verified. Ordered by ratio of
value to risk, which is the order to work them in.

The method for all of it is [toolchain.md](../../docs/development/toolchain.md) and
the `ask-the-tool` skill: survey on the syntax tree, transform on the syntax tree,
let `tsc` say which sites were load-bearing, let the suite say which survived
behaviourally, read only the residue. Harness: `scripts/codemod/project.mjs`.

## A — mechanical, unblocked, do first

**A1. Teach the codemod to use a builder for MEMBERS, not just the outer object.**
41 of the 85 HandlerContext conversion failures are members whose type ALREADY has a
canonical fake: `globalState` 12, `StateManager` 12, `ExtensionContext` 9, `Project`
5, `Logger` 3. The codemod hands the raw literal to `createMockHandlerContext`, whose
overrides are typed, so a partial member is rejected. Replacing the member with its
builder first should clear all 41. No new fake needed; this is a codemod change.

**A2. Two unnecessary type assertions in `tests/sop/canonical-fakes.test.ts`**, lines
394 and 405, found by the type-aware config. Real, small, and in an enforcer — worth
fixing precisely because that file is a backstop.

**A3. Run the type-aware config over the whole test tree.** It found 36 unnecessary
assertions in ONE feature directory. The repo-wide number is unknown. NOT with a
blanket `--fix`: on `requireMock('vscode') as {...}` the rule is technically right
and its fix is a regression, because the assertion is the only type information in
the expression. Review the diff.

## B — needs a new builder, ranked by what it unblocks

The compiler produced this ordering; it was not argued for.

| Builder | Failures it unblocks | Notes |
|---|---|---|
| `SecretStorage` | 21 | the largest single blocker |
| `AuthenticationService` | 16 | second |
| `WebviewPanel` | 5 | small |
| `TokenManager` | 2 | smallest |

Writing the first two clears roughly 37 of the 44 that need something new. Each
belongs in `tests/helpers/`, typed to the real interface so it stops compiling when
that interface grows — the rule the existing builders already follow.

## C — the cast families, with honest numbers

Two different measurements, and conflating them is what produced an overstated
report once already:

| Family | brace-anchored (the ceiling) | every `as T` (AST) |
|---|---|---|
| `Project` | 150 | — |
| `HandlerContext` | 38 | 100 |
| `Partial<Project>` | 38 | — |
| `vscode.ExtensionContext` | 6 | 0 above the ceiling |
| `Logger` | 0 (banned) | **98** |
| `StateManager` | 0 (banned) | **63** |
| `CommandExecutor` | 0 (banned) | **9** |

**C1. `Project` at 150 is BLOCKED on judgement, not tooling.** The builder supplies
rich defaults and several suites assert on ABSENCE; substituting would silently
change what they check. No tool resolves that. Do not batch it.

**C2. The 6 remaining `vscode.ExtensionContext`** are residue both oracles rejected —
their literals carry a stateful `globalState` or a path an assertion reads back. Six
is a reading job, not a codemod.

**C3. The 12 HandlerContext casts the codemod skipped** cast an identifier or a call
result, not an object literal. Nothing to hand a builder; each needs reading.

**C4. `as any` 1,065 and `as never` 533.** The big number. `as never` came down from
748 by a text-based pass that also corrupted a detector's control fixtures — do not
repeat that method. Survey by POSITION first: an ARGUMENT cast is a silenced type
error (four production defects here hid behind exactly that) and gets read; a
DECLARATION cast is usually a fake and is batchable.

## Done when

Section A is empty, section B has the two large builders, and section C carries only
the rows that genuinely need a person — each of those stating why. The ceilings and
`astTotals` in `canonical-fakes.ledger.json` are re-pinned in the same commit as any
conversion, which the enforcer requires anyway.

## What to be careful of

- **Re-pin from the ENFORCER's count, never your own.** A recount by regex said the
  HandlerContext ceiling should RISE to 74; the enforcer said 38. The regex was
  matching the type name inside longer type names.
- **Never run a converter over `tests/helpers/` or `tests/sop/`.** The harness
  refuses, and the reason is that a converter in the builders' home rewrites a
  builder into a call to itself — twice here, a hundred suites down each time.
- **Restore along the import graph.** A stripped shared helper reports errors in its
  CONSUMERS, so restoring only the files named in the errors never converges.
- **Save the compiler's raw output.** A script that computes a verdict and discards
  the evidence cannot be debugged; one reported 1 broken file when 115 were.

## Provenance

- 2026-09-01 session. Corrections already applied and needing no further work: the
  cast bans were reported as broader than they are (renamed and both numbers now
  recorded); eight unguarded corpus reads raced against a probe file (all fixed);
  `--stdin` linting is a dead end (eslint ignores the piped content — recorded in
  `tests/sop/eslint-type-aware.test.ts`).
