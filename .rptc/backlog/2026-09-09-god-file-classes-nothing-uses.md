---
id: PL-53
kind: question
area: platform
needs: []
value: med
status: planned
---

# 351 of the god file's 647 classes appear in no source string

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
