# Step 2 — split the god file by feature

The safe step, the one that needs no decision, and the one that creates the seam
every later step depends on. 685 feature-family rules leave `custom-spectrum.css`
for sheets that reach only the bundles that render them.

**Done condition is an EMPTY DIFF.** Moving a rule between sheets must change
nothing on screen. A non-empty diff is a bug in the move, not a finding about the
CSS — revert and re-do it.

## Why this is the enabler and not the tidy-up

`custom-spectrum.css` is imported by all eight bundle entries, and esbuild builds
them in one pass, so nothing downstream can be scoped to a single surface while it
exists. Once `.dashboard-*` lives in a sheet only `src/features/dashboard/ui/main.tsx` imports:

- a cascade change to it touches one screen, so step 3 becomes 180 elements at a
  time instead of 762
- ADR-017 §6 finally holds for our largest sheet
- the class-reachability question ("is this styled on the surface that uses it?")
  becomes answerable by reading an import instead of running a scan

## The order: read it from the repo, never from this file

```bash
node scripts/cssMigrationCycle.mjs --worklist
```

It prints every remaining family with its bundle reach (from esbuild's real graph),
its blockers, and which of three LANES it is in:

| lane | meaning | what to do |
|---|---|---|
| **mover** | nothing inside a conditional at-rule | `--move`, then import the sheet from every entry it lists |
| **by hand** | at least one rule inside `@media` / `@container` / `@supports` | move the block WHOLE, and put it back WHERE IT WAS — not at the end |
| **dead?** | no bundle renders the family at all | do not move it — this is PL-53's question, and a visual diff cannot answer it |

**A table of families used to live here and it rotted within a day.** It listed
`.architecture-` (deleted as dead), `.project-` as needing a judgement call (it was
a one-bundle move), and counts from before the first cycle. Numbers copied into a
plan are stale the moment a cycle runs, which is the same failure as the overview's
starting values — fixed the same way.

**One family per cycle.** Capture, move one family, rebuild, re-capture, diff. An
empty diff commits; anything else reverts. Batching means a non-empty diff tells you
several things might be wrong instead of exactly what is.

**A conditional block goes back at its ORIGINAL INDEX.** "After the family's plain
rules" was the first instruction here and it is wrong: in all three hand-moved
families the block sat in the MIDDLE, with more of the family after it —
`.wizard-step-item`, `.sidebar-utility-footer` and `.choice-card--tile` all came
later in the god file and ended up earlier. Every visual diff was empty, so nothing
observable moved, but the sheets were not verbatim and three commit messages said
they were. Reconstruct the family in the god file's source order and check it
rule-by-rule against the baseline before believing the diff.

**Prefer a mover family reaching ONE bundle.** A family reaching three is still fine
— `.ai-*` and `.intflow-*` both went that way — but every entry in the list has to
import the new sheet, and a missed one renders as the style silently not applying.

## The trap: document order is part of the cascade

Two rules of equal specificity are resolved by which comes LAST. Moving a family
out of a 6,223-line file into a separate sheet changes where it sits relative to
every other rule, and the sheets arrive in whatever order the bundle graph
produces.

So a move is only behaviour-preserving when nothing of equal specificity was
relying on being after it. **This is exactly the reasoning that cannot be trusted**
— it was wrong twice on 2026-09-08 — so the rule is: expect an empty diff, and
believe the snapshot rather than the argument for why it should be empty.

Where a family genuinely does conflict, that is a finding worth recording rather
than working around: two rules of equal specificity fighting over the same property
is a bug that was invisible while both lived in one file.

## Which sheet does a family go to

Follow ADR-017 §6 and the reach map:

- a family used by ONE feature's components goes to that feature's sheet, new if
  needed, imported by that feature's entry
- a family used by SHARED components in `src/core/ui/` stays global — those render
  on surfaces whose bundles must all carry the rule (ADR-018 §3)
- a family used by two or three features is the judgement call; default to global
  until a third instance proves otherwise, per the repo's Rule of Three

**Check reach before moving, not after.** The bundle-reachability probe used on
2026-09-08 is the tool: for each class, which of the eight bundles contains a
component that uses it. A family moved to a sheet one of its consumers cannot see
is the `.text-orange-*` bug again, and it renders as "the colour simply did not
apply there".

## What cycle 1 found — read this before running cycle 2

Three defects in the mover, all found by running it against real CSS on
2026-09-08, all now controls in `--selftest`:

1. **A multi-line selector list was read as starting at the wrong line.**
   `.a:hover,` on one line and `.a:hover * {` on the next: only the second carries
   the brace, so the first selector was left behind. **The visual diff cannot see
   this** — the leftover still applies, because the god file is still imported by
   the same bundle. `--move` now runs a completeness check and refuses.
2. **The cascade layer was dropped.** custom-spectrum's rules live in
   `@layer theme`; the emitted sheet had no wrapper, so the moved rules became
   unlayered and started beating Spectrum. 90 sidebar elements moved. The mover
   now records each rule's enclosing layer and reproduces it.
3. **A rule was hoisted out of `@media`.** `.sidebar-tile-grid` inside
   `@media (max-height: 640px)` was emitted at top level, so it applied always —
   the sidebar's tiles flipped from a column to a row. `--move` now REFUSES a
   family containing any rule inside `@media`/`@container`/`@supports`, because
   moving them all hoists them and moving the rest leaves leftovers. **7 families
   (7 rules) are affected**; the other 95 (597 rules) are clean.

**And the `!important` ceiling reads `git ls-files`.** A new sheet that is not yet
`git add`ed is invisible to it, so the count appears to fall by however many
`!important` rode along. Stage the new sheet before reading any pin.

## Two constraints the script cannot see

**ADR-018 §3 blocks 321 of the 685.** A family used by a component in `core/ui/`
must stay in a globally-loaded sheet, because that component can render on any
surface. `.intflow-*` — the largest family at 52 rules — is blocked this way by
`ApiAccessPicker`. Moving those families requires moving the COMPONENT out of
`core/ui/` first, which is a component refactor and not a CSS cycle.

**105 rules have no `.tsx` user at all.** Neither movable nor obviously dead —
they want their own investigation before anyone assumes either.

So step 2's realistic scope today is **259 rules, not 685**, and
`featureRulesInGlobalSheet` cannot reach 0 without a decision about §3.

## Verification per cycle

1. `npm run compile`, stage bundles, capture (48 cells, 2,700 elements)
2. move one family, `npm run compile`, re-stage, re-capture
3. `diff()` — **empty commits, non-empty reverts**
4. interaction capture (168 cells) whenever the family contains a `:hover`,
   `:focus` or `:active` rule
5. the two step-2 ceilings must fall by the number of rules moved, and
   `godFileTopLevelRules` must fall by the same amount as
   `featureRulesInGlobalSheet` — if they diverge, rules were relabelled or lost

## Done when

- `featureRulesInGlobalSheet` reaches 0
- `godFileTopLevelRules` is at the utility count (~235) and the file is a utility
  sheet, not a god file
- every moved family verified by an empty diff at the time it moved
- no new sheet is imported by a bundle whose components do not use it
