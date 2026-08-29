---
id: PL-20
kind: fix
area: platform
needs: []
value: med
status: backlog
title: 19 CSS classes are used but no stylesheet defines them — triage each
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
