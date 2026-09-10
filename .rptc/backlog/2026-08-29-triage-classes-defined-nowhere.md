---
id: PL-20
kind: fix
area: platform
needs: []
value: med
status: shipped
title: 19 CSS classes are used but no stylesheet defines them — triage each
parent: PL-30
---

# 19 classes a component asks for that nothing styles

Found 2026-08-29 by the sibling rule to ADR-017 §6, added in the same commit as
the §6 check itself. Seeded into `classesDefinedNowhere` in
`tests/sop/webview-architecture-rules.exemptions.json`, so the set cannot GROW
while it waits. This item is the triage.

## Why these are not one problem

Each is "a component uses class X, nothing defines X", but the FIX differs and
only a person can say which applies:

- **The rule was never written.** The element is meant to look a certain way and
  silently does not. Two of the original 21 were this and are already fixed:
  `.text-orange-700` (warning text, not amber) and `.text-red-500` (an ERROR
  icon, not red — it existed only inside VerifiedField's inline `<style>` block,
  so it applied wherever that component happened to be mounted and nowhere
  else).
- **The markup is dead.** A class left behind by a redesign. The fix is to
  delete the attribute, not to invent a rule for it.

Guessing wrong in either direction is worse than leaving it: inventing a rule for
dead markup adds CSS nobody wanted; deleting a class that a designer intended
loses the intent.

## The list

    complete                       control-panel-secondary-inner   field-help-dialog
    config-section-footer          dashboard-control-panel         inline-rename--editing
    content-sidebar-inner          dashboard-zone-label            intflow-api-reason
    control-panel                  datapack-danger-detail          page-header
    control-panel-body             datapack-danger-value           page-header-inner
    done                           field-help-button               project-card-menu-button
                                                                   project-row-menu-button

Layout names dominate — `page-header`, `control-panel*`, `content-sidebar-inner`
— which suggests a layout refactor left its class names behind. Check that
hypothesis first; it may resolve most of the list in one pass.

## How to work it

Per class: find the usage, look at the rendered element, decide "should this look
different?" If yes, write the rule where the ADR says it belongs (global sheet if
core components use it). If no, delete the attribute. Then delete its ledger row
— the check fails on a row that no longer violates, so the ledger cannot drift
from reality.

## Not to be confused with

`bundleStylesheets` in the same ledger — that is the §6 rule proper ("the sheet
exists, this bundle does not load it") and is currently EMPTY.

## Shipped so far

- 2026-09-08  TRIAGED 2026-09-08. All 18 classes resolved against evidence rather than inspection. Ledger 18 -> 17: one class removed from the tree entirely, one reclassified as a deliberate keep, sixteen still open with a verdict each.

METHOD, AND THE TWO TIMES IT CAUGHT ME. First question per class: did a CSS rule for it ever exist? `git log -S` over *.css answers that mechanically. It reported four classes as having lost a rule; TWO WERE FALSE POSITIVES from substring matching — the hits for `.page-header` were `.page-header-section` and `.page-header-title`, and the hit for `.control-panel` was `.control-panel-single`, all different classes. Re-run requiring the class as a whole token in a selector line: only TWO ever had a rule. Second miss: a check for "does any test assert on this class" came back clean for `done`, and it was wrong — the pattern only looked for cn()/className forms and missed the suites querying it. Removing the class broke four tests. Both errors were caught by controls or the gate, neither by reading.

THE TWO THAT LOST A RULE.

.dashboard-zone-label — REMOVED FROM THE TREE. Its rule was deleted deliberately in 2344f2485 ("no zone heading") and the class outlived it on two sidebar elements, AiZone's "AI" and UtilityBar's "Utilities", styling nothing on either. Also corrected src/features/sidebar/CLAUDE.md, which described the class as "shared with the dashboard" — a doc asserting a live relationship to a rule that had already been deleted.

.done — KEEP, and the ledger entry now says why. The CSS that drew the tick (.sum-row.done .sum-label::before) was deliberately removed in 99e2aed08 when the marker became a Spectrum CheckmarkCircle, so the class genuinely styles nothing. But it is a STATE MARKER the suite reads: BuildYourProjectSummary's and CommerceStep's tests assert on it as the handle for "this row is done". A class that styles nothing is not automatically a defect; this one is a test-visible affordance.

THE SIXTEEN THAT NEVER HAD A RULE, and none is a JS hook — zero of the 18 appears in a querySelector, closest, classList or getElementsBy call anywhere in src/. They split:

THREE ARE GAPS IN A STYLED FAMILY and look like genuine omissions rather than markers. .datapack-danger-detail and .datapack-danger-value sit beside .datapack-danger-lede (font-weight 600), .datapack-danger-term (block, 11px, uppercase) and .datapack-danger-warning (red-600) — three siblings styled, two not, in a modal warning about a destructive import. .intflow-api-reason sits in a family of ten styled .intflow-api-* rules. What they should LOOK like is a design decision, not something to infer from the neighbours, so they are left for the owner.

THIRTEEN ARE STRUCTURAL WRAPPER LABELS on divs whose layout comes from the Spectrum components inside them — .page-header, .page-header-inner, .control-panel, .control-panel-body, .control-panel-secondary-inner, .dashboard-control-panel, .config-section-footer, .field-help-button, .field-help-dialog, .inline-rename--editing, .project-card-menu-button, .project-row-menu-button, .complete. They are inert and harmless, but each one reads as though styling exists. Deleting thirteen classes across thirteen files is a bigger change than this item was authorised for and is worth doing as one deliberate sweep under the visual baseline rather than piecemeal.
- 2026-09-08  SECOND PASS 2026-09-08: ledger 17 -> 14. Wrote the two rules whose elements had been built specifically to be styled — .datapack-danger-value (the Commerce instance named in the remove-sample-data confirm, which rendered quieter than its own label on a destructive-action dialog; the markup carries a comment saying the span exists so the value could be styled) and .intflow-api-reason (why an API row is locked, which rendered at inherited body size, louder than the row's own name). Both take their values from their immediate styled siblings rather than invented ones, and both are placed BESIDE those siblings so they land in the same cascade layer — custom-spectrum.css opens and closes @layer theme several times, so appending at the end of the file would not have. .datapack-danger-detail deleted from the markup instead: a <p> wrapper that never had a rule and needs none. NOT VISUALLY VERIFIED and that is a real instrument gap worth recording: the visual baseline captures each surface at REST, and neither element renders there — one needs a modal open, the other a locked API row. The fixtures cover no dialogs at all. Verified instead that each rule reaches every bundle whose components use it. REMAINING: 14, of which 13 are inert structural wrapper labels (.page-header, .page-header-inner, .control-panel, .control-panel-body, .control-panel-secondary-inner, .dashboard-control-panel, .config-section-footer, .field-help-button, .field-help-dialog, .inline-rename--editing, .project-card-menu-button, .project-row-menu-button, .complete) best swept in one deliberate pass, plus .done which is a deliberate KEEP.
- 2026-09-08  fix(css): write the two rules whose elements were built to be styled (`01168feb2`)
- 2026-09-08  fix(css): a dead class on two sidebar labels, and a doc still describing its rule (`2daa1bd0f`)
- 2026-09-08  FINISHED 2026-09-08. Ledger 18 -> 7, and the seven that remain are documented KEEPs rather than untriaged entries, so the item is closed rather than parked. Final split: 2 rules written for elements built to be styled (.datapack-danger-value, .intflow-api-reason), 10 classes removed from the tree (.dashboard-zone-label on two sidebar labels, .datapack-danger-detail, and the seven inert wrapper labels .control-panel-body, .field-help-button, .field-help-dialog, .inline-rename--editing, .page-header-inner, .project-card-menu-button, .project-row-menu-button), and 7 kept because the SUITE queries them as state handles (.complete, .done, .page-header, .control-panel, .control-panel-secondary-inner, .dashboard-control-panel, .config-section-footer) — each ledger entry now names the asserting line. THE LESSON THAT COST FOUR TESTS: a class that styles nothing is not automatically a defect. A first check for 'does a test assert on this' looked only at cn()/className forms, cleared .done, and removing it broke four tests; the re-run reads any quoted occurrence and then reads the matching line. Two doc corrections fell out: src/features/sidebar/CLAUDE.md described .dashboard-zone-label as shared with the dashboard long after its rule was deleted, and FullScreenSurface.tsx's docblock named page-header-inner as live. VERIFIED under the visual baseline: 47 of 48 cells byte-identical; the 48th was a bad BASELINE that captured wizard@dark@1280 with 6 elements against 105. That flake exposed an instrument hole now closed — assertHarnessFaithful checks the dashboard ONCE per run, so a cell failing to mount was recorded as real data, and a cell under-rendering in BOTH captures would compare identical and report clean. captureSurface now throws below 20 elements. Added alongside it for PL-21 phase 4: assertPropertiesCovered(cssText), which fails a change whose properties the fingerprint cannot see — the letter-spacing blind spot found earlier the same day is the case it exists for. Both guards ship with a control.
