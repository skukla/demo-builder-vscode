---
id: PL-44
kind: fix
area: platform
needs: []
value: med
status: backlog
parent: PL-41
---

# A lint probe planted inside tests/ races every suite that walks tests/

`eslint-type-aware.test.ts` writes a real file under `tests/tmp-probe/` and deletes it,
because a snippet linted from memory proves nothing and eslint must see a file on disk.
Suites run in parallel workers, so any other suite enumerating the tests tree can meet
that file between listing a directory and reading it, and fail with a missing-file error
that has nothing to do with the change under test.

## It has already been fixed four times, one victim at a time

`mirror-placement`, `canonical-fakes`, and (2026-09-04) `no-credential-shaped-fixtures`
and `no-logger-wording-assertions` each grew their own guard. `redundant-automocks` hit
it again at 20:18 on 2026-09-04 and cost the batch a retry.

Measured on 2026-09-04: **21 suites enumerate the tests tree and then read what they
found; 10 carry no guard.** Guarding them one at a time is a losing race — the count
grows with every new enforcer, and each new one is written by somebody who has never
heard of the probe.

## Why the obvious fixes do not work

- **Move it to a system temp directory.** Already tried and recorded in the root
  CLAUDE.md: eslint skipped the file, exited 0, and the control proved nothing.
- **Move it elsewhere under `tests/`.** That is the current state. It was moved out of
  `tests/sop/` for exactly this reason and landed somewhere every walker still reaches.

The constraint is that `eslint.config.mjs` applies its rules to three trees only:
`src/**`, `webview-ui/**`, `tests/**`. A file outside all three matches no `files`
pattern, gets no rules, and the probe silently stops proving anything.

## The fix

Give the probe a directory of its own outside `tests/` — `.eslint-probe/` at the repo
root — and add that path to the SAME config object that already covers `tests/**`, so it
inherits identical rules rather than a hand-copied set. Gitignore it. Then no walker of
the tests tree can ever see it, and the ten unguarded suites stop being a latent hazard.

**Verify by planting the failure, not by the absence of one.** Confirm the probe still
reports the type-aware findings it is asserting on, because a probe that silently lints
nothing passes this test just as happily as one that works. The existing suite's
assertions on specific rule ids at specific lines are the control.

## Why it was not done on 2026-09-04

It edits a file every gate reads, while an unattended loop was committing every few
minutes. Getting it wrong fails every gate and stalls the run, against a fault that today
costs one retry and heals itself. Do it at a quiet moment, not under a running loop.

## Shipped so far

- 2026-09-04  docs(backlog): PL-44 — the lint probe races every suite that walks tests/ (`575d9ff68`)
