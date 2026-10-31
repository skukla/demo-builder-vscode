# Dialog design

How a dialog looks, how big it is, and what it says. Agreed with the owner on
2026-10-31, from mockups, after a day of result screens that each looked fine alone
and read as machine-made together ([[PL-85]]).

The cause was not one bad screen. There was no written rule for what goes INSIDE a
dialog, so each screen was composed on the spot from parts (a status box here, a
row list there, a muted footnote under it) and each one drifted. These rules are
the fix. They build on Spectrum's own dialog shape: a title, one rule, plain
content, buttons.

## The test every line has to pass

**Does it change what the SC knows or does next?** If a line repeats the title, a
button, or something the SC picked seconds ago, delete it. This catches most of
what reads as AI-written:

| Cut | Because |
|---|---|
| "What clearing does" over a list | The list says it |
| Store and Data rows on a result | The SC picked both seconds ago |
| "Closing this doesn't stop it." | The button says "Run in background" |
| "Remove X's data from this store?" under the title "Remove X" | It repeats the title |
| "Data (12)" | It counts a list the SC can see |
| "Every data type went in." | It says nothing the green title did not |

## Layouts

Every dialog is built from five. A dialog that walks through several (Import goes
form, confirm, progress, result) shows one at a time.

| Layout | Holds | Usual width |
|---|---|---|
| **Form** | Fields, then the actions | medium; large or extra-wide when a list needs columns |
| **Confirm** | A question as the title, one sentence, Cancel and the action | small |
| **Progress** | A spinner, what is happening, how far | small |
| **Result** | The outcome as the title, then only what is left to know or do | small |
| **Guide** | Steps with their state, one step open (the demo setup guide; a pack's setup step is a guide of one) | large |

## Rules

**Status lives in the title.** A small icon before it: green done, amber needs the
SC (including a dangerous confirm), red failed. No status boxes in the body. A
done result with nothing else to say is just its title. Where nothing follows from
it, it closes itself (the progress window); a dialog whose result offers Back to its
form (Import) stays until closed.

**Four kinds of text.** Title; body text; label (small, muted, sentence case,
never capitals); note (small, muted). Nothing else.

**Spacing:** 4 between a label and its field, 8 between rows, 16 under the title,
24 between groups.

**Lines:** one rule, under the title. No box borders, no rule over the buttons.

**Buttons:** Close or Cancel first, then the actions, the main one last. A
dangerous main action is solid red. Never two buttons that do the same thing.

**Words:**
- The title names the thing and the outcome ("Removed ZZ Test Root DB12").
- The body never repeats the title.
- Facts, not commentary. Digits for numbers, with separators (1,284).
- A warning is a word in the main sentence ("Permanently removes…"), never a
  muted footnote under it.
- No bullet lists. A list of consequences is one sentence, or sits on the row it
  belongs to.
- A sentence names up to seven kinds in full; past that, three and "and 9 more
  data types".

**Problems sit next to the thing they are about**, as a note line: a store another
project claims gets its note on its own row, not a box above the list.

**An Admin step is drawn one way everywhere**: Where (the menu path), Enter (each
value copyable), Then. In the setup guide, in a pack's setup step, and in a result
that leaves one to do. Numbered lists only for instructions that are not an Admin
step.

## Size and motion

- **Pinned near the top**, not centred, so content that grows pushes only the
  bottom edge down and nothing above it moves under the pointer.
- **Height fits the content** and eases when it changes, growing or shrinking.
- **Width is a step**, chosen by the view, never measured from text: small 400,
  medium 480, large 640 (Spectrum's own), extra-wide 980. A longer store name wraps;
  it does not widen the dialog. When a view changes step, its content is hidden
  while the box eases to the new width, then fades in, so text never visibly
  rewraps.

## Long content

- Text always wraps. Nothing is cut off with an ellipsis, titles and names
  included.
- A row's note sits on the right when it fits, and drops under the name when it
  does not. It never squeezes the name.
- Button labels never wrap; a dialog too narrow for its buttons wraps the row.

## Where it is built

`core/ui/components/ui/Modal.tsx` (the title's status icon, the width steps and
their easing, the button styles), `core/ui/components/layout/SteadyHeight.tsx` (the
height), `core/ui/styles/modal.css` (pinning, text kinds, spacing).
