---
id: EDS-13b
kind: feature
area: eds
parent: EDS-13
needs: [EDS-13c]
value: med
status: active
---

# "Share this demo": turn an existing project into a demo others can add

Filed 2026-09-11 by the owner as the other half of [[EDS-13]]. Un-built; nothing in the
extension does this today.

## The ask

An SC who built and customised a demo wants a colleague to be able to add it with one
link. Today that means hand-writing the description file ([[EDS-13c]]), remembering to
publish the content site, and knowing about the template flag. The extension already knows
everything the file needs.

## What it does

From the project dashboard, "Share this demo":

1. Writes the description file into the project's own storefront repo from what the
   project already holds: name, description, store codes (from the Commerce config),
   B2B flags, selected block libraries, mesh posture. Through the generated-file seam
   (ADR-013) so a hand-edited file is never clobbered.
2. Checks what a colleague's "Add a demo" will need and says so in plain words: content
   site published with an index (offers to publish if not), repo reachable, default branch
   `main`, template flag (optional; explains the fast path).
3. Hands the SC the link to send.

Reversal: "Stop sharing" removes the file (again through the ADR-013 seam, only when the
file is ours). The project is unchanged either way.

Agent surface in the same change: an action tool that does 1–3 and returns the link, so an
agent asked "share this demo with Jen" can.

## Naming trap

"Export" already means settings export in the projects dashboard
(`settingsSerializer.ts`). This action must not use that word in anything the SC reads.
"Share this demo" is the candidate; settle it before building.

## Decided 2026-09-11

- Name: "Share this demo" / "Stop sharing".
- The template flag is a tick box in the share dialog, off by default; unticking undoes it.

## Open

- Where the SC's description text and icon come from at share time (a prompt, or defaults
  from the package they started on).

## Decided 2026-09-13

- Renamed **"Save as demo package"** / **"Remove demo package"** after the owner pushed back on
  "Share": what leaves is the storefront as a starting point, not the whole demo, and Export
  already means the settings file. The word is the glossary's: a demo package is the card on
  the Welcome step.
- Save also puts the card on the SC's own Add a demo list, so an SC can reuse their own
  storefront without pasting their own link; the link is how a colleague gets the same card.
- The description text comes from the brand or demo the project was built on (the project's
  title for a Starter build), editable in the dialog. No icon (dropped 2026-09-12).
- Rehomed the same day: the storefront part lives in the dashboard's **Export** dialog
  ("Storefront as demo package"), not on its own row. Export is the umbrella for everything
  that leaves a project; the decision of record is on [[PL-56]].

## Shipped so far

- 2026-09-13  feat(dashboard): Export becomes the umbrella, with the storefront as a demo package (`e7ddcd37e`)
- 2026-09-14  fix(demo-package): the Save dialog says what colleagues get, and reset keeps the file (`fc7ab73c5`)
- 2026-09-14  fix(export): the link form is the link and Copy link; no warning, nothing to save first (`d57944af9`)
- 2026-09-14  refactor(demo-package): bring Export and the reset helper back inside the conventions (`a966c719f`)
- 2026-09-14  feat(demo-package): Save shows the house spinner, the house success state and footer actions (`fc811e690`)
