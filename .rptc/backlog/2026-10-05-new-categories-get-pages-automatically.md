---
id: EDS-27
kind: feature
area: eds
needs: [EDS-24]
value: med
status: built
---

# New categories get their pages without a Republish

Filed 2026-10-05, designed with the owner in the EDS-24 session. EDS-24 writes category
pages at setup, reset and republish; a category added in Commerce afterwards shows in the
live menu at once but has no page of its own until the next Republish (the menu links it to
the filtered search page meanwhile). The owner asked for Demo Builder to close that gap
itself, since it holds the SC's DA.live sign-in and the shared App Builder service does not
(it holds only a publish key per site, so it could serve a generated page but never write an
editable one).

## Design (owner-approved 2026-10-05)

- **A setting: add pages for new categories automatically. Off by default.** Set once for all
  of an SC's projects, overridable per project.
  - **Off:** when Demo Builder sees categories without pages it OFFERS: "2 new categories: add
    their pages?" One click.
  - **On:** it adds and publishes them without asking, then shows a short notice naming what
    it added.
- **When it looks:** when a project opens in Demo Builder, and on a timer while it stays
  open. Only the open project, never every project on the machine.
- **Add-only.** It never edits or removes a page. Pages for categories deleted from Commerce
  stay until Republish or reset: removal is the riskier action and stays a deliberate one.
- **A hand-built page is always honored**, by the same check EDS-24 uses: a page at the
  category's address we did not write, a page we wrote that was edited, and a page for that
  category at ANY address (found by its list block's category) all mean "has a page".
- **Expired DA.live sign-in:** a notice, then wait. Never opens a browser unprompted.
- It reuses EDS-24's one page-writing step (`catalogMenuStep`), so there is still exactly one
  path that writes category pages.

## The rule it bends, and the owner's ruling

CLAUDE.md property 5 says cloud operations are confirmed before they run and never run
unattended. The owner's ruling (2026-10-05): an opt-in setting is the SC confirming once, in
advance, and that is acceptable for ADD-ONLY category pages. It does not extend to edits,
removals, or any other cloud write.

## Limits to state in the docs

It only works while VS Code is open with the project; a category added overnight gets its
page the next morning, and the menu's search fallback covers it until then.

## Surfaces

The setting in `package.json` (schema, type and reader together); the agent surface (can an
agent read and change the setting, and trigger the check?); docs/systems/category-pages.md;
the generated AI files if they describe it. Undo: turning the setting off stops it; pages it
added are removed by reset like any other page Demo Builder wrote.

## Shipped so far

- 2026-10-05  feat(eds): new Commerce categories get their pages without a Republish (EDS-27) (`4879c9dff`)
- 2026-10-05  2026-10-05 Live, read-only: the setting reads false; check_category_pages on Justrite answers no missing pages. The offer and the add are not yet seen live (needs a new Commerce category).
