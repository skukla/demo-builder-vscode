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
| 3 | Test strategy — de-duplicate and clean up | **Substantially done.** ADR-016 ratified; the convergence plan SHIPPED and archived; 48 enforcer suites; ~24 completed test plans. The mock walls, the shared fixture builders ([[PL-16]]), the mutation burn-down ([[PL-22]]), the repetitive-suite read ([[PL-48]]) and the harness probes ([[PL-47]]) have all SHIPPED | [[PL-50]] and [[PL-46]] (open questions), [[PL-14]] (waiting on use), [[PL-11]] (active) |
| 4 | Architecture programme and standards | **Substantially done.** SEVEN ADRs ratified 2026-08-28→30 (015, 016, 017, 018, 020, 021, 022); the handbook — now **109 conventions, ALL 109 enforced**; `where-code-goes.md`; 48 enforcer suites and 25 hook rules. [[PL-31]], [[PL-13]], [[PL-19]], [[PL-20]] and [[PL-34]] all closed. [[PL-33]]'s last convention — vendor CSS in the lowest layer — was enforced 2026-09-10 once [[PL-21]] made it TRUE | [[PL-21]]'s remaining decomposition queue, [[PL-26]], [[PL-27]], and [[EDS-8]]'s 31-file decomposition queue, now gated |

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

## The burn-down roster

**This is the whole program.** Every item below is a child of this one, so the checker
will not let this epic close while any of them is unfinished — the relationship is
mechanical, not a promise in prose.

Each row says what FINISHED means, because an item without a done-condition is how a
programme runs forever.

> **Re-measured 2026-09-08**, because the "Now" column had gone stale in both
> directions: it still described [[PL-22]] as "16 of 507" and [[PL-32]] as "as any 286"
> months after both shipped, while [[PL-26]] sat on the roster with no `parent` set — on
> the roster in prose only, exactly the failure the paragraph above claims is impossible.
> Both fixed. Every state below was measured against the code, not read from this file.

**Seven items left.** Three of the four tracks are closed; track 4 holds most of what
remains.

> [[PL-13]] was closed 2026-09-08 on inspection, not on new work. This roster had
> recorded its done-condition as "the exemption ledger is empty"; the item's own
> body says "empty **or** every remaining row is a RATIFIED permanent exception",
> and all three rows have been exactly that since 2026-08-31. A roster that
> paraphrases a done-condition can make a finished item look open indefinitely.

### Wave 1 — unblocked, no decision needed. Start here.

| Item | Finished when | Measured state, 2026-09-08 |
|---|---|---|
| [[PL-11]] → PL-48 | The most repetitive suites have been READ and what reading finds is fixed | not started |
| [[PL-11]] → PL-47 | Themes, widths and accessibility are further readings of the existing baseline harness | not started. Cheap — extends an instrument that already loads all eight bundles |

Shipped out of this wave on 2026-09-08: [[PL-19]] (the sidebar joined the shared
channel; the manager was retyped so a `WebviewView` qualifies, and the outbound
envelope moved from `data` to `payload`) and [[PL-34]] (section A cleared, B's
builders confirmed present, C re-measured — [[PL-32]]'s sweep had already taken
`as any`/`as never` to 0/0 and the ceilings from 150/38 to 6/1). PL-34's recurring
hook-proof flake was split to [[PL-52]] rather than closed with it.

### Wave 2 — needs one decision from the owner before, or as, the work

| Item | The decision | Then |
|---|---|---|
| [[PL-21]] | Phase 2 (the CSS AUDIT) needs no authorisation and is the next step. Phase 4 (the refactor) does | Audit → ADR-018 → refactor |
| [[PL-20]] | Per class: was the rule never written, or is the class dead? Only a person can say | 19 classes, ledgered so the set cannot grow |
| [[PL-26]] | *Needs a done-condition* — that is the first work on it | A glossary exists and something checks the words are used |
| [[PL-27]] | Which of the skills is doing a job a check should hold | *needs a count* |
| [[PL-11]] → PL-50 | What to do about modules measured against suites that merely share their filename | open question |
| [[PL-11]] → PL-46 | Whether to drive the real VS Code, given it creates real Adobe/GitHub/DA.live resources | a question before it is work |

### Wave 3 — blocked, and by what

| Item | Blocked on | Why |
|---|---|---|
| [[PL-33]] | [[PL-21]] | 88 conventions, 87 enforced. The one gap is a `@layer vendor` rule that is **not yet true** — no such layer exists in `src/`, so a check would fail the build rather than protect anything. It waits on the CSS migration, which is not authorised. A rule with a start date, not debt |
| [[PL-29]] | track 3 ([[PL-11]]) | Two documents stay provisional until the test strategy they describe settles |
| [[PL-11]] | its own children | Closes when PL-14, PL-46, PL-47, PL-48 and PL-50 do |

[[PL-14]] is built and waiting on USE, not work: all seven artifacts landed
2026-08-31, and it closes when a webview test is authored against the new
`webview-test-authoring` sections. Fold it into the next webview test rather than
scheduling it.

**The critical path is [[PL-21]].** It gates PL-33 outright, it is the largest single
item left, and its phase 2 can start today without a ruling.

## What is deliberately NOT in this program

Naming these matters more than naming what is in, because the way a burn-down never
finishes is by quietly absorbing everything.

- **The agent-surface track** — [[AI-1]], [[AI-2]], [[AI-3]] and their children. It is
  active and it is substantial, and it does not belong here: [[AI-1]] is a `question`,
  which by definition has no "done". Folding open questions into a burn-down guarantees
  the burn-down never closes.
- **Product work** — every `EDS-*`, `AB-*`, `DI-*`, `PR-*` item, and the platform
  features ([[PL-3]], [[PL-23]], [[PL-24]]). Different programme, different cadence.

## The rule that keeps this finite

**The roster above is CLOSED. It may shrink and it may not grow.**

New findings during the burn-down do not join it. They go to the backlog unparented, and
they are worked after this programme closes — unless one of them BLOCKS a track, which is
a decision to record here with the reason.

That is the whole discipline, and it exists because this repo's failure mode is not
carelessness, it is accretion: 51 live items, of which this programme is 17. Without a
closed roster the other 34 arrive one plausible item at a time.

**Measuring it:** every item is a child of this epic, `backlog.mjs check` refuses to let
the epic ship while a child is unfinished, and the count of unfinished children IS the
burn-down number. Nothing else needs tracking.

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
- 2026-08-31  Track 3 (test strategy) COMPLETE, overnight 2026-08-31. All 28 module-mock walls converted; PL-14's seven artifacts done; family-extraction worklist 11/11; dead-mock-scan shipped and registered; the 63-family ledger swept. 159 dead mocks removed across the night. Tracks 1 and 2 were already complete; Track 4 (architecture programme) is the remaining one.
- 2026-08-31  feat(tooling): one reading of codebase health, appended to a time series (`309b2e69b`)
- 2026-08-31  Merge the Track 3 convergence loop into develop (`b5b610003`)
- 2026-09-01  test(helpers): the logger fake ledger reaches zero and becomes a ban (`f2f9e3816`)
- 2026-09-01  test(sop): seven rules that reached zero are banned, not ledgered (`4413bb469`)
- 2026-09-01  chore(health): snapshot 7 — after the PL-33 merge (`bbe320dda`)
- 2026-09-02  docs(backlog): make the programme one closed roster that can actually finish (`6c45d15c5`)
- 2026-09-02  fix(backlog): `set` stored a list field as a string, and refused with a nonsense reason (`f907f2aac`)
- 2026-09-08  docs(backlog): the finish list for the four-track programme, measured not remembered (`353b62b6c`)
- 2026-09-08  fix(backlog): the glossary item was on the roster in prose only (`c191e6bf4`)
- 2026-09-10  2026-09-10  Table corrected: PL-47/48 shipped, PL-13/19/20/34 closed, conventions 88->109 all enforced
