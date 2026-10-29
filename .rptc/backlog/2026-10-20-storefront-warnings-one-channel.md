---
id: EDS-55
kind: chore
area: eds
needs: []
value: med
status: built
---

# The storefront pipeline's warnings travel one route, not one each

Filed 2026-10-20 by the owner, after EDS-38: wiring "the block palette will be empty" to
the completion screen meant copying the missing-pages sentence's route through about a
dozen places, and the owner called the smell.

## What was there

Each sentence the content pipeline wants the SC to read had its own field, carried by hand:
`missingPages` (EDS-40) from the pipeline result to creation's `RepoInfo`, the setup
result, `otherCaveats`, the reset's content outcome, `withPageSentences`, `EdsResetResult`,
`successWarnings` and the agent's `caveatsOf`; `leftoverPages` (EDS-33) the same way for its
sentence, with the "may some remain" decision made downstream in the reset's notifications.
A fourth sentence would have been a fourth copy.

## The change

- The pipeline result carries `warnings: string[]`: every sentence a step has for the SC,
  added where the step knows it (missing pages, leftover pages that may remain, an empty
  block palette).
- Creation, reset, the reset dialog and the agent's reset answer read that one list.
- `leftoverPages` keeps its structured result for agents (removed, some left, not listed);
  only its sentence moves.
- Not moved, because they are different jobs: `pdpCaveats` (it changes the completion
  headline: product pages will not load) and `demoCaveats` (an added demo's lines, which
  carry the storefront report's offer of fixes). Both are made outside the pipeline.

A new pipeline warning is then one line in its step.

## Shipped so far

- 2026-10-20  refactor(eds): the storefront pipeline's warnings travel one route (`3d8461a9c`)
- 2026-10-20  style(tests): prettier on the pipeline and reset suites EDS-55 is about to change (`a5f45826e`)
- 2026-10-20  refactor(eds): MissingPagesResult is no longer named outside its file (`6aae05e17`)
