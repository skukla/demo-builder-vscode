---
id: PL-30
kind: epic
area: platform
needs: []
value: high
status: active
---

# The four-track program — enforceable conventions, in sequence

The owner's goal, stated verbatim: *"Enforceable, measurable conventions that guide
the codebase and make it maintainable over time. That's my goal"* — because *"you
drift so much and are unreliable, we need to enforce our conventions."*

And the standard every track is measured against, also verbatim: *"Every piece of
documentation must earn its keep. It must be concisely communicated. It must be easy
for a human to read and understand. It must be useful. And it must be enforced."*

## Why this file exists at all

**It was written on 2026-08-30 because the owner asked "where are the four tracks?"
and the answer was nowhere.** Measured that day: `Track 1` appeared in zero tracked
files, `Track 4` in zero, `Track 3` only inside [[PL-29]] as the thing two documents
are waiting on. One of four had a record.

The program driving every commit for two days existed in a conversation transcript.
Track 1 was **finished** and nothing said so, what it covered, or that it had been
enforced — which is the worst of the four to lose, because a completed track leaves
no code to re-derive it from.

It is worth being blunt about the shape of that: a program whose entire subject is
documentation earning its keep and being enforced was itself undocumented and
unenforced. The failure this repo keeps finding is never carelessness — it is that
nothing was checking, and nobody had asked the question yet.

## The four tracks

The owner defined these as SEQUENTIAL, and corrected an attempt to collapse them
into one. Order is part of the design: a later track changes what an earlier one
should have said, which is why some documents are marked provisional rather than
finished (see [[PL-29]]'s second-pass table).

| # | Track | State | What is left |
|---|---|---|---|
| 1 | Claims from three t3.gg videos, applied where they fit | **Done**, enforced | — |
| 2 | Documentation synthesis — canonical, useful, enforced | **Phases A, B and C all DONE** — [[PL-29]] | Nothing this track owns. Two documents stay provisional until track 3 settles the strategy they describe |
| 3 | Test strategy — de-duplicate and clean up | **Substantially done.** ADR-016 ratified; the convergence plan SHIPPED and archived; 8 enforcer suites; ~24 completed test plans | 13 mock-wall suites, shared fixture builders ([[PL-16]]), the mutation follow-through ([[PL-22]]) |
| 4 | Architecture programme and standards | **Substantially done.** SEVEN ADRs ratified 2026-08-28→30 (015, 016, 017, 018, 020, 021, 022); the handbook — 66 conventions; `where-code-goes.md`; 5 enforcer suites | 30 shrink-only ledger rows ([[PL-13]]), the CSS decision ADR-018 parked ([[PL-21]]), [[PL-19]], [[PL-20]] |

**Tracks 3 and 4 are NOT pending — they are the tracks that produced the handbook**,
and they ran FIRST. The program's earliest commits, 2026-08-28, are test-builder
refactors; ADR-015 and ADR-016 were owner-ratified that same day. Architecture and
test conventions came first, the handbook came out of them, and track 2 began after —
the owner paused that work to do the documentation, which is why this file existing at
all matters: nothing else recorded that they were paused rather than unstarted.

> **This table was wrong when first written on 2026-08-30**, and wrong in a way worth
> keeping. It said tracks 3 and 4 were "not started" — because no backlog item was
> TITLED "Track 3" or "Track 4". That measured the presence of a label instead of the
> presence of the work, which is the exact failure this whole program keeps finding in
> the documents it audits. Seven ratified ADRs, a 709-line handbook and 24 shipped test
> plans were sitting on disk while the summary of them said "not started". Corrected
> the same day, on the owner's challenge.

### What track 1 covered, since nothing else records it

Three videos were transcribed and their claims tested against this repo rather than
adopted. What applied was implemented and pinned; what did not was rejected with a
reason. The durable output is in the root `CLAUDE.md` and the handbook — the point
of recording it here is that the track is CLOSED, so a future session does not
re-litigate the same claims from scratch.

### Track 3 and 4 are NOT "set the standards"

Both read as greenfield and neither is — they are the most advanced tracks here, and
what remains in each is finishing an application, not writing a rule.

- **Track 3**: the strategy is ratified (ADR-016 — three tiers, chosen on a 15-defect
  escape analysis, not on taste). The convergence plan has SHIPPED and is archived in
  `.rptc/complete/architecture-test-convergence/`. Eight enforcer suites hold it:
  mirror placement, builder uniqueness, split-family setup, no bare sleep, no lowered
  timeout, no config-leaf mocks, magic timeouts, mutation-config pairing. What remains
  is convergence debt — 13 suites that module-mock a stateless collaborator, the shared
  fixture builders, and deciding what the 59% mutation score means.
- **Track 4**: seven ratified ADRs with build-failing enforcers, plus the handbook
  itself — 66 conventions, 59 of them enforced. What remains is the exemption ledger
  (30 shrink-only rows across five rules) and [[PL-21]]'s CSS decision, which ADR-018
  deliberately parked rather than authorised.

Reading either as "write the rules" would restate rules that exist. That is the
mistake this entry is here to prevent, and the reason it is stated twice.

## Why an epic

It has children and outlives any sitting. It closes when all four tracks do — and
[[PL-29]] cannot close before track 3 runs, because two of its documents are
provisional pending the test strategy.

**Children are added when a track STARTS, not now.** Filing empty items for tracks 3
and 4 would put speculative work in a backlog that is read to decide what to do next;
the state table above is the record until there is real work to hold.

## Shipped so far

- 2026-08-30  Track 1 complete and enforced
- 2026-08-30  Track 2 phases A, B and C complete ([[PL-29]] carries the detail).
  [[PL-28]] closed with it — all ten rules adjudicated, six ratified, two deleted,
  one deferred, one resolved as judgement rather than law
- 2026-08-30  Pre-loop reconciliation for track 3: record validates (88 items, all six
  hygiene sections clean with controls), 8 unlogged commits recorded, and ADR-016's
  mock-wall claim RE-VERIFIED before the loop picks it up — 25 suites still mock
  `HelixService` against the 26 measured in August, 12 for `ConfigurationService`, and
  all 13 named files still on disk. The item is live, not stale.
- 2026-08-30  docs(backlog): tracks 3 and 4 were never "not started" — they built the handbook (`baf02741e`)
- 2026-08-30  docs(backlog): the four-track program existed nowhere (`acc687f94`)
- 2026-08-30  chore(backlog): pre-loop reconciliation for track 3 (`8e48d66e6`)
