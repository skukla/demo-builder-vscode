---
name: ask-the-tool
description: Do a mechanical refactor across many files by letting tsc, jest and eslint decide which sites are real, instead of reading and judging each one. Use when removing a class of cast, swapping N hand-rolled fakes for a builder, repointing an import across a tree, or any change where the question "does this site actually need X?" repeats more than about ten times.
---

# Ask the tool that already knows

**A tool that has parsed the file knows things you are about to guess.** This skill
is the procedure for using that, and the measured reason to bother.

On 2026-09-01 a hand-rolled "is this import still used?" scan was wrong twice in
one session — it counted a mention inside a COMMENT as a use, and counted
`vscode.ExtensionContext` as a use of a bare `ExtensionContext` import. eslint had
already built a syntax tree and could not make either mistake. The same day, a
prior about which casts were redundant was wrong 29 times out of 36.

## The three oracles, in this order

Each answers a question the one before it cannot. Running them out of order wastes
the cheap answers.

| | Oracle | Answers | Cannot see |
|---|---|---|---|
| 1 | `npx tsc` / `npm run typecheck:tests` | is this site's type actually satisfied? | anything about behaviour |
| 2 | `npx jest --no-coverage` | did the change preserve behaviour? | whether the test still MEANS anything |
| 3 | your reading | is the residue right? | — |

**Never skip to 3.** The point is that 1 and 2 shrink the pile before you read it.

## The procedure

### Step 1 — make the change broadly and mechanically

Apply it to every candidate site at once. Do not pre-filter by judgement; that is
the thing being replaced. **Back up every file you touch first** — the whole method
depends on cheap restoration.

### Step 2 — ask the compiler, once

```bash
npm run typecheck:tests > "$SCRATCH/tc.txt" 2>&1
```

Files that now error are **load-bearing**: the thing you removed was doing real
work. Restore exactly those. Everything still green was **noise**.

This is one command for the whole tree, not one per site. That is the entire
economy of it.

### Step 3 — ask the suite

```bash
npx jest --no-coverage > "$SCRATCH/j.txt" 2>&1
```

Type-correct is not behaviour-preserving. On the ExtensionContext family, 28 of 29
files passed tsc and 4 of those then failed the suite — their literals carried a
stateful `globalState`, or an `extensionPath` an assertion reads back. Restore
those too.

### Step 4 — read only what is left

The residue is small and every item in it is there for a reason a tool stated. That
is a completely different job from reading 36 sites hoping to spot the three that
matter.

### Step 5 — the dead-import sweep, always

Every conversion of this kind strands type imports. It happened FOUR times in one
session before it was accepted as a fixed step rather than a surprise.

Drive it from eslint's own report, never a regex:

```bash
npx eslint "tests/**/*.ts" -f json > "$SCRATCH/lint.json" 2>/dev/null
```

Then act on `@typescript-eslint/no-unused-vars` messages. Handle all four import
shapes — the first cleaner knew only the first two and left real errors behind:

```
import type { X } from '...';            // whole line
import type { A, X, B } from '...';      // one member
import * as vscode from 'vscode';        // namespace
import type * as vscode from 'vscode';   // type namespace
```

## Safety rules that are not optional

**Skip `tests/helpers/` in every converter.** A converter loose in the builders'
own directory rewrites a builder's body into a call to itself. That has happened
twice here, and it takes out a hundred suites with a stack overflow that names none
of them.

**Walk braces and parens, do not regex them.** A literal contains
`jest.fn(() => ({...}))`, so a pattern that stops at the first `)` or `}` truncates
the call and produces code that still parses. Count depth.

**Process in reverse when inserting.** Match offsets computed on the original string
are invalidated by every earlier edit. One insertion landed in the middle of a tool
NAME this way.

**Re-pin the ratchet in the same commit.** A conversion that lowers a ledger count
must lower the pin; the enforcer demands exact equality and will fail otherwise.
That failure is the ratchet working, not a problem.

## When NOT to use this

- **Fewer than ~10 sites.** The backup-and-restore machinery costs more than reading
  them.
- **The change is not mechanical.** "Should these two things be one?" is a judgement
  no oracle holds — that is `code-duplication-scan` and
  `architecture-duplication-scan` territory, and both are deliberately guided
  reviews for exactly this reason.
- **The suite is the thing being changed.** If you are editing what the tests
  assert, oracle 2 is not independent of the change and proves nothing.

## The general form

> Before writing a check, ask whether a tool in this repo already performs it.

`tsc` knows types. `eslint` knows bindings and unused symbols. `jest` knows
behaviour. `madge` knows cycles. `ts-prune` knows unused exports. Re-deriving any
of those with a regex means writing a worse version of a thing you already have —
and the worse version fails silently, which is how a wrong all-clear gets believed.

## Related

- `decompose-god-file` — the other fix-shaped skill; same "let the compiler hold the
  API stable" instinct at a larger grain
- `dead-code-scan` — ts-prune as an oracle for unused exports
- `gate` — the thing you run when you think you are finished
