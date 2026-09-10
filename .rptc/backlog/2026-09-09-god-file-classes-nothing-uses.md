---
id: PL-53
kind: question
area: platform
needs: []
value: med
status: shipped
---

# 351 of the god file's 647 classes appear in no source string — 254 rules deleted

Found 2026-09-09 during the CSS migration loop, while looking for work that did
not need the browser. **Filed rather than actioned, and the reason is the whole
point of the item.**

## The measurement

Every class token appearing in any string literal across `src/**/*.ts(x)` was
collected — `className`, `UNSAFE_className`, `cn()` arguments, plain strings —
then compared against the classes `custom-spectrum.css` defines:

| | |
|---|---|
| classes defined in the god file | 647 |
| appearing in NO source string | **351** |
| template-literal sites in `src/` | 4,804 |

Spot-checked with a control: `page-header`, known live, shows 7 mentions in
ts/tsx. Five candidates — `.action-pill`, `.architecture-addons`,
`.selector-card`, `.template-card`, `.project-button` — show zero.

Largest candidates by rule count: `.architecture-addons` 6, `.selector-card` 6,
`.architecture-option` 5, `.architecture-modal-option` 4, `.modal-step-content` 4,
`.wizard-step-item` 4.

## Why this was NOT actioned by the loop

**An empty visual diff cannot prove these dead**, and that is the difference
between this and the 47 bare `.spectrum-*` selectors deleted the same day.

Those were dead by CSS SEMANTICS: Spectrum ships hashed class names, so
`.spectrum-Button` cannot match `o7Xu8a_spectrum-Button`, and the empty diff
merely confirmed what the selector could not do. These are only *apparently*
unused. A class rendered exclusively in a state the fixtures do not reach — a
modal, an error path, a wizard step the harness never opens — produces an empty
diff and is still live.

**And 4,804 template-literal sites are a blind spot.** A class assembled as
`` `template-${kind}` `` never appears as a whole token. `dynamicClassSiteCeiling`
(95 sites per bundle) tracks the same gap for the inverse check.

So the honest verdict is 351 CANDIDATES, not 351 dead classes, and the bar for
deleting one is higher than a diff.

## What would settle it

Any of these, in increasing cost:

1. **Grep each candidate's whole name across `src/` including `.ts`.** Cheap;
   already done for five. Removes candidates that ARE mentioned somewhere the
   token-based scan missed.
2. **Check whether a candidate is reachable only through a dynamic prefix** — for
   each, does any template literal in `src/` build a string starting with its
   stem?
3. **Fixtures for the unrendered states.** The real fix for the diff's blindness,
   and it helps every later cycle too. `webview-visual-baseline` renders each
   surface at REST; modals, error paths and later wizard steps are uncovered.
4. **Delete in small batches and confirm in the Extension Development Host.** The
   only check that sees a modal actually open.

## Why it is worth doing

`custom-spectrum.css` is the file the whole migration exists to dismantle. If a
third of its classes are dead, deleting them is cheaper than moving them, and
every family move currently carries dead weight into a feature sheet.

## Related

- [[PL-21]] — the migration; this was found by its loop
- `.rptc/plans/css-architecture-migration/` — step 2 is what moves the live ones
- PL-20 closed the inverse defect: classes a component asks for that nothing
  styles. This is classes nothing asks for.

## Shipped so far

- nothing; this is a finding with a stated method, not started work.
- 2026-09-09  SCHEDULED by the owner 2026-09-09. And two families have already been verified dead to this item's OWN level-1 bar (whole-name grep across src including .ts, with a positive control), while answering a different question about where to move them: .architecture-* is entirely dead — all 24 rules, and all 9 'architecture-' mentions in ts/tsx are COMMENTS ('architecture-duplication scan', 'architecture-dependent', 'css-architecture-migration'), zero are class names. .project-button-* is dead — 7 rules, zero mentions. Control: datapack- returns 82 mentions. That is 31 rules of the 351 candidates confirmed by direct evidence rather than by absence from a token scan. It also shows the token scan UNDER-states the problem in one direction and over-states it in another: .project-* looked like 33 users across 6 bundles, which was noise from every string containing 'project-'; decomposed by sub-family it is 36 projectsList-only rules plus 7 dead ones.
- 2026-09-09  fix(css): delete 32 rules nothing names — and keep the one that is used (`1f777e8f5`)
- 2026-09-09  docs(backlog): PL-53 — a third of the god file may be dead, and why a diff cannot prove it (`8685c4ef1`)
- 2026-09-09  fix(css): delete 254 rules no file names — the god file is 967 lines (`18dc95a91`)

## Answered, 2026-09-09

**254 rules deleted. `custom-spectrum.css` is 967 lines, from 6,223.** 95 rules
remain, 4 of them feature rules.

The measurement above counted CLASSES on the file as it stood that morning, before
571 rules moved out of it. Re-run at the end of the day against the 349 that were
left:

| | rules |
|---|---|
| named by no file under `src/`, `tests/` or `media/` | **254** |
| test handles — the suite queries them, nothing styles them | 26 |
| genuinely used | 69 |

**Levels 1 and 2 were enough, and level 3 turned out to be unnecessary.** The item
proposed building fixtures for states the harness never reaches — modals, error
paths — as the real fix for the visual diff's blindness. That is right for a class
some code NAMES but no fixture renders. It cannot help here: if no file names the
class, no state can apply it. The expensive step was aimed at a different problem
than the one this set has.

**One check the item did not state, and it decided the scope.** Excluding unused
VARIANTS of a live utility set — `.text-2xl` while `.text-sm` is used — was
proposed on the reasoning that a scale is kept complete on purpose. That was an
assumption, and the owner pushed back on it. The way a utility can be applied
without appearing as a whole token is a template literal building `text-${size}`,
and of the **90 class-building template heads in the entire codebase, not one is a
utility stem**. So an unused variant is simply unused, and the 114 that reasoning
would have spared were deleted with the rest.

**What the visual diff contributed, stated honestly:** an empty diff across 2,700
elements and 168 interaction cells, which rules out collateral damage and does NOT
prove these were dead. The evidence for deadness is the name search with its
controls. The remaining risk is a class applied from outside this repo's code, and
it is closed by opening the Extension Development Host — the owner's check, not a
scripted one.

## Related

- [[PL-21]] — the migration this was found by, and which it finishes
