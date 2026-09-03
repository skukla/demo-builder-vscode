---
id: PL-39
kind: chore
area: platform
needs: []
value: med
status: backlog
---

# An item can be marked done while its own body says what is left

Found 2026-09-02 by a sweep for follow-up work across every source at once
(register: `.rptc/handoff/2026-09-02-follow-up-register.md`).

**18 items are at `shipped` or `built` and still name remaining work inside
them.** Nobody re-opens a finished item, so that work is invisible: it does not
appear in `backlog.mjs next`, it is not `stale`, and no check reads it.

That is the only category the sweep found that was genuinely LOST rather than
parked. The rest of the record is healthy — of 143 deferral statements across
865 commits, only 12 had no live item behind them, and 10 of those were design
decisions that were correct to make.

## Why the existing checks miss it

| check | what it asks |
|---|---|
| `backlog.mjs stale` | a WIP item with **nothing** recorded — the opposite problem |
| `backlog.mjs unlogged` | a commit that names an item but never reached it |
| `--check` | frontmatter validity and reference resolution |

None of them reads a FINISHED item's prose.

## The proposed check

Flag any item at `shipped` or `built` whose body contains a forward-looking
remainder — "remaining", "remainder", "next step", "follow-on", "not yet done",
"left for" — and which has neither a child item nor `superseded-by`.

Today that fires 18 times. The register lists all 18 with what each one actually
leaves behind; the largest are PL-1 (the legacy manifest read path is still
load-bearing), PL-13 (10 construction-boundary exemptions), PL-31 (23 barrels)
and PL-38 (57 hand-written module walls).

**A control is required and easy:** the same detector must NOT fire on an item
whose remainder sentence is historical ("the remaining work WAS finished in…").
`rptc-hygiene-scan` already separates present-tense from historically-framed
claims for doc drift; the same split applies.

## What NOT to do

Do not ban the sentences. They are the most useful prose in these items — they
say what the author knew and could not finish. The problem is that nothing looks
at them, not that they exist. A check that pushed people to delete them would
trade a visible gap for an invisible one.

## Related

- [[PL-33]] — every convention is enforced, or it stops being a convention. Same
  argument, applied to the record instead of the code.

## Shipped so far

- 2026-09-02  docs: every leftover in one place, and the reason one class of them was invisible (PL-39) (`687dcd4a9`)
