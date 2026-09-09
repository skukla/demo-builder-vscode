# Loop report — 2026-09-08 into 09-09, CSS architecture migration

Branch `loop/2026-09-08-css-migration`, seven commits, pushed. **Nothing merged to
develop — that decision is yours.**

## The short version

Five families of CSS left the 6,223-line stylesheet that all eight screens load,
each one proved not to change a single pixel. The file is down to 5,545 lines and
the count of feature-specific rules stuck in it fell from 660 to 564.

Before any of that, I fixed something more important: the architecture document
describing this work was carrying a measurement the repo had already disproved,
and the approach we agreed on was written down nowhere permanent. Both are now in
the ADR and the handbook.

Along the way the checks caught five things that reading would not have — including
a class that has never styled anything, and a test asserting on where a rule lives
rather than what it says. Nothing was forced through.

## The story

You asked me to keep momentum overnight. The queue was 21 families of CSS rules
that could move out of the big shared stylesheet into the feature that actually
uses them, verified each time by photographing every screen before and after and
requiring the two to be identical.

**Then you asked whether the approach was documented, and it wasn't.** That turned
out to matter more than another family. `ADR-018` — the architecture decision for
CSS — still said the layer change moves 23 elements, and that removing
`!important` brings that down to 7. Measured properly on Monday, the real numbers
are 762 and 780, and the conclusion drawn from the old ones was backwards. Nothing
recorded what four research lanes had settled: that layers are the essential fix,
that CSS Modules should not be adopted, and why. That is all now in the ADR, and
the handbook's two CSS conventions no longer claim the migration is unauthorised.

**Then the moves.** Seven cycles. Five went straight through. Two did not, and
those are the interesting ones.

`.brand-*` refused to move on its own. Two rules like
`.expandable-brand-card.expanded .brand-card-header` belong to one family by their
first class and style the other's insides. Moving one alone leaves the other
behind — and because the leftover still sits in a file the same screen loads, the
before/after photographs come out identical. **The split would have looked finished
and been broken.** They moved together instead.

`.datapack-*` exposed something older. A class called `is-selected` is only ever
written attached to something else — `.datapack-card.is-selected` — so a button in
the search header that carries `is-selected` on its own has never matched any rule.
It only counted as "styled" because one of those combined rules happened to live in
the shared file. I nearly deleted it on sight, which would have repeated a mistake
from earlier in the day, because a test asserts on it. Reading that test settled it
the other way: the same state is already checked twice over, once for screen
readers and once for the visible highlight. So the class was a third marker nothing
used, and it went, with the two redundant assertions.

**Two test suites broke on moves that changed nothing visible.** Both were reading a
single stylesheet and checking a rule was in it — asserting where a rule lives
rather than what it says. And both hit a second problem I caused: the mover wraps
moved rules in a cascade layer to preserve their position, and these tests parse
CSS by splitting on braces, so the first rule inside that wrapper reads as the
wrapper's name. Exactly one rule per moved sheet went invisible. Both fixed.

**Finally, a finding I deliberately did not act on.** 351 of the 647 classes in the
big file appear in no code anywhere. That is a third of it. But an empty photograph
comparison cannot prove those dead — a class used only inside a dialogue the test
harness never opens looks identical to one nobody uses. Filed as its own item with
the method and four ways to settle it, rather than deleted overnight on weak
evidence.

## Shipped — on the branch, gated, awaiting your merge

| | |
|---|---|
| ADR-018 corrected + the settled approach documented | `bf0d40af3` |
| `.brand-*` + `.expandable-*` (31 rules, entangled) | `15db8b01b` |
| `.ai-*` (18 rules, three entries) | `3fc37191f` |
| `.datapack-*` (12 rules) + the dead `is-selected` | `aba424bad` |
| `.int-*` + `.sum-*` (23 rules) | `e9e44538d` |
| `.eventing-*` + `.progress-*` (12 rules) | `56a169f17` |
| PL-53 filed | `8685c4ef1` |

**96 rules moved across five cycles, every one verified by an empty diff** across
2,700 elements at eight surfaces, two themes and three widths.

| | at loop start | now |
|---|---|---|
| feature rules in the shared sheet | 660 | **564** |
| rules in the shared sheet | 895 | **799** |
| shared sheet lines | 6,223 | **5,545** |
| stylesheets | 11 | 16 |
| `!important` | 1,923 | 1,923 |

Gate green on every commit: 1,557 suites, 29,469 tests, zero lint errors. The
conditional refused two commits until the failures were understood — once for the
`is-selected` regression, once for a test reading one stylesheet.

## Filed — recorded, not forced

**PL-53: 351 of 647 classes in the shared sheet appear in no source string.**
Method and control are in the item. Not actioned because an empty diff cannot tell
"dead" from "not rendered by the fixtures", and 4,804 template-literal sites are a
blind spot for whole-word matching. Worth doing: if a third of that file is dead,
deleting beats moving, and every cycle currently carries dead weight into a feature
sheet.

## Corrected

- **ADR-018's migration measurement.** 23/7 replaced with 762/780, and the
  "the `!important`s are holding the old rendering in place" conclusion withdrawn.
- **The handbook** said the migration was "not authorised" and quoted 1,969
  `!important`. Both stale.
- **My own recommendation** to aim at component-owned sheets. The evidence says
  feature-level, which is what the plan already did. No change needed.
- **A completeness check I wrote** tested whether a line START sat inside a
  comment, so an indented comment read as a leftover rule and refused a legitimate
  move.

## Environment facts

- `caffeinate` was holding the machine awake for 8 hours from the start.
- The visual check needs the browser, which needs this session. **The loop is not
  autonomous** — it paces work, it does not run without a live session.
- The `!important` ceiling reads `git ls-files`, so a new stylesheet must be staged
  before the gate or its declarations are invisible and the count appears to fall.
  Hit twice; the cycle order now stages first.

## Your decisions

1. **Merge `loop/2026-09-08-css-migration` into develop?** Seven commits, all
   gated, no rendering change anywhere.
2. **ADR-018 §3.** Written into the ADR as §3a, explicitly *not adopted*. Amending
   it unblocks 321 more rules; leaving it caps step 2 at roughly 243 more. The
   evidence, the cost and the one argument against are all in the section.
3. **`.project-*` (43 rules) and `.architecture-*` (24).** Left deliberately —
   they span six and three features, so where they live is a judgement call, not a
   mechanical move.
4. **PL-53** — worth scheduling, or leave it filed?
