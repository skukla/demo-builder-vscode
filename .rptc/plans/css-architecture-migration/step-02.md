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

## The order: biggest first, and one family per cycle

| family | rules | likely home |
|---|---|---|
| `.intflow-` | 52 | integrations |
| `.project-` | 43 | projects-dashboard |
| `.integration-` | 35 | integrations |
| `.dashboard-` | 28 | dashboard |
| `.prerequisite-` | 25 | prerequisites |
| `.sidebar-` | 24 | sidebar |
| `.architecture-` | 24 | project-creation |
| `.modal-`, `.template-`, `.wizard-`, `.timeline-`, `.brand-`, `.ai-` | 21-18 each | various |

23 families carry 10+ rules and cover 464 of the 685. The remaining ~221 sit in 79
small families and are the long tail — do them last, in groups, once the pattern is
established.

**One family per cycle.** The cycle is: capture, move one family, rebuild,
re-capture, diff. An empty diff commits; anything else reverts. Batching families
means a non-empty diff tells you several things might be wrong instead of exactly
what is.

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
