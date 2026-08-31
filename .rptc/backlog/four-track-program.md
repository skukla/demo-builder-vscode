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

| # | Track | State |
|---|---|---|
| 1 | Claims from three t3.gg videos, applied where they fit this repo | **Done**, and enforced |
| 2 | Documentation synthesis — a canonical set that is useful and enforced | **Active** — [[PL-29]]. Phases A and B done; C is two files and five numbers |
| 3 | Test strategy — de-duplicate and clean up | **Not started.** Groundwork exists: ADR-016 ratified, [[PL-11]], [[PL-16]], [[PL-22]] |
| 4 | Architecture programme and standards | **Not started.** Groundwork exists: six ratified ADRs with enforcers; [[PL-19]], [[PL-20]], [[PL-21]] |

### What track 1 covered, since nothing else records it

Three videos were transcribed and their claims tested against this repo rather than
adopted. What applied was implemented and pinned; what did not was rejected with a
reason. The durable output is in the root `CLAUDE.md` and the handbook — the point
of recording it here is that the track is CLOSED, so a future session does not
re-litigate the same claims from scratch.

### Track 3 and 4 are NOT "set the standards"

Both read as greenfield and neither is. Measured 2026-08-30:

- **Track 3** has its strategy ratified already (ADR-016 — three tiers, chosen on a
  15-defect escape analysis). What remains is convergence: the mock-wall conversions,
  the fixture builders, and deciding what the 59% mutation score means.
- **Track 4** has SIX ratified ADRs with build-failing enforcers (015, 016, 017, 018,
  020, 021, 022). The frontend alone carries 16 conventions with 14 enforced. What
  remains is running the programme against them — [[PL-21]]'s CSS decision above all,
  which ADR-018 deliberately parked rather than authorised.

Reading either as "write the rules" would restate rules that exist. That is the
mistake this entry is here to prevent.

## Why an epic

It has children and outlives any sitting. It closes when all four tracks do — and
[[PL-29]] cannot close before track 3 runs, because two of its documents are
provisional pending the test strategy.

**Children are added when a track STARTS, not now.** Filing empty items for tracks 3
and 4 would put speculative work in a backlog that is read to decide what to do next;
the state table above is the record until there is real work to hold.

## Shipped so far

- 2026-08-30  Track 1 complete and enforced
- 2026-08-30  Track 2 phases A and B complete ([[PL-29]] carries the detail)
