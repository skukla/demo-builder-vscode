---
id: PL-33
kind: chore
area: platform
needs: []
value: high
status: backlog
---

# Every convention is enforced, or it stops being a convention

Owner directive, 2026-08-31: *"We shouldn't have 16 that are not enforced. If it
cannot be enforced, it probably shouldn't be a convention."*

The principle is right and this repo has already paid for the counter-example. The
`src/core/` import rule was stated as absolute law in a CLAUDE.md — with a "❌",
which reads as a guarantee — while appearing in no ADR, backed by no check, and
violated seven times. A prohibition nothing checks is a wish.

## But the 16 are not one problem, and treating them as one gets it wrong

Reading all 16 splits them cleanly. **Five are code conventions with a buildable
check that nobody built. Eleven are not conventions about the CODE at all** — they
are rules about how the WORK is done, and they are in the same list only because
the handbook has one word for both.

That mixing is why "16 unenforced" looks like 16 units of debt. Only five of it is.

### Lane A — buildable, nobody built it (5)

These describe the tree. A check can read the tree. Build them.

| # | Convention | The check |
|---|---|---|
| 1 | Commands `camelCase`, components `PascalCase`, constants `UPPER_SNAKE_CASE`, file named for its export | `@typescript-eslint/naming-convention` (verified present in the installed plugin) plus a filename-vs-default-export test |
| 4 | Vendor CSS sits in the lowest cascade layer | Parse the stylesheets, assert `@layer` order. The entry says "not yet" itself |
| 6 | A tool needing credentials pre-flights and returns a structured `needsAuth` handoff | A descriptor-level test. The repo already pins tool lists by name in `inExtensionMcpServer.test.ts` |
| 10 | A fake a SECOND feature directory needs lives in `tests/helpers/` | Count distinct feature dirs defining or importing a builder name; ≥2 outside `helpers/` fails. `builder-uniqueness.test.ts` already does the adjacent half ("one definition"), not this one |
| 3 | A value passed into a hook is stable across renders | The entry correctly says `exhaustive-deps` cannot see across the prop boundary. A targeted AST check can: flag an inline array/object/arrow JSX prop whose receiving component forwards it into a hook dependency array. Hardest of the five; possibly partial |

Its own entry argues against #1 — "nobody has broken it, and a linter would be
policing something that has never gone wrong." That reasoning should not survive
this item. A rule nobody breaks is the CHEAPEST one to enforce, and enforcing it
costs one config line; the argument only justifies not spending effort, and there
is no effort to spend.

### Lane B — working discipline, not code conventions (11)

Entries 2, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16. Each is a rule about how to
investigate, what to verify before claiming something, or which judgement to
apply — "a named field in a response is a LEAD, read the source before it becomes
a finding"; "before naming a cause, name the command that would prove you wrong";
"a control proves the tool works, not that you aimed it right."

No test can check these, because there is no state in the tree to check. That is
not a gap in the tooling; it is what they are.

**But "no test" is not "no enforcement", and this repo already proves it.** There
are 12 PreToolUse hook rules in `.claude/hooks/rules/`, and two of them —
`12-unquoted-glob` and `13-piped-exit-code` — enforce exactly this kind of
verification discipline, at the moment of the action rather than against the tree.
So some of the eleven are hookable and simply have no hook.

The work in Lane B is therefore a triage, not a build:

- **Hookable** → write the rule. A hook that fires when the mistake is being made
  is stronger than a sentence in a document nobody re-reads.
- **Not hookable** → it is still true and still worth stating, but it must stop
  being counted as an unenforced CONVENTION. Move it to a named "working
  discipline" section of the handbook that does not claim to be enforced, so the
  convention count means one thing.

### Lane C — the honest possibility

Some of the eleven may be neither hookable nor worth keeping. The owner's test
applies: if it cannot be enforced AND nobody can point at a defect it prevented,
delete it. Do not preserve a rule because it reads well. Entry 14 is the one to
look at first — `tests/sop/doc-module-refs.test.ts` already covers the path half,
so what remains unenforced is a narrower claim than the entry makes.

## Done when

Every entry in the handbook's convention list is either enforced by a named check,
enforced by a named hook, or is not in the convention list. The generated index
computes "N conventions, N enforced" with the two numbers equal, and
`tests/sop/tooling-registry.test.ts` pins it.

## What to be careful of

**Do not close the gap by weakening the rules.** The cheap way to make 16 → 0 is
to delete the eleven and declare victory; the honest way is to build five checks,
write the hooks that are writable, and reclassify what is genuinely discipline.

**Every new check gets control-tested in both directions before it is believed.**
Two checks in this repo have already been caught anchored to a violation that was
later fixed, so the check passed on an empty corpus. `type-erasing-casts.test.ts`
is the current reference for the four-control pattern.

## Provenance

- Owner directive, 2026-08-31, after [[PL-32]] added the 64th enforced convention
  and the count of unenforced ones stayed at 16.
- The 16 were read individually on 2026-08-31 to produce the lane split above;
  `naming-convention`'s availability and `builder-uniqueness`'s actual scope were
  both verified rather than assumed.
