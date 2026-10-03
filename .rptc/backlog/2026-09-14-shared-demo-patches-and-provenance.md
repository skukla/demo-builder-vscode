---
id: EDS-13f
kind: feature
area: eds
parent: EDS-13
needs: [EDS-13a, EDS-13b]
value: high
status: planned
---

# Shared demos carry their boilerplate, their patches and a way to stay fixed

Filed 2026-09-14 from `.rptc/research/shareable-demo-patches/research.md`. Plan:
`.rptc/plans/shareable-demo-patches/`.

## Why

A saved demo package ("Save as demo package") records nothing about what its storefront was
built from, so a project started from it is treated as a colleague's storefront: patched
files travel frozen, later fixes never arrive, and the repository is never re-pinned. A
colleague's storefront built from our boilerplate two versions ago takes five of our seven
load-bearing and universal fixes exactly (live fit test on `sayurihanki/aistore`,
2026-09-14), yet today it only gets a dry check and a caveat. And nobody records which
boilerplate, at which version, a storefront was built on.

## What the SC gets

Every storefront the extension touches knows its boilerplate and version and where it came
from; a saved package stays a Demo Builder storefront (fixes applied where they fit, re-pinned
only when safe); a colleague's storefront that shows our lineage is offered our fixes, opt-in,
named by what they fix; the card and completion say how old the boilerplate is and what that
means; the caveat wording names what the extension does write.

## Owner decisions still open

The version-gap policy (plan step 05): what to offer when a colleague's storefront is older
than the current boilerplate, given that a template-generated repository has no shared
history to merge from.

## Shipped so far

- 2026-09-14  docs(rptc): plan boilerplate provenance, patches that fit and the version gap for shared demos (`a878f69ed`)
- 2026-09-14  docs(rptc): the card stays streamlined, the storefront report is one door away, diagnostics learns the same facts (`ac3ab675d`)
- 2026-10-03  2026-10-03 unattended run on loop/2026-10-03-night2-b (staged, not committed): steps 01-04 and 07 built, 05 stopped for the owner, 06 docs done and live acceptance not run. Every storefront now records its boilerplate (package.json name+version) and GitHub lineage (template_repository / fork parent) on the card, the project record (creation and reset) and a zip card; the add dialog shows one 'Built on' row. Save as demo package writes description file v2 with builtWith; a project started from it gets its ledger's fixes applied where they fit on create and reset (no re-pin: the hash guard is not built). A colleague's storefront with our lineage is offered the 5 load-bearing + 2 universal fixes that fit, opt-in (Storefront Report command modal, reset_project/create_project applyFixes:true), one commit to the SC's own repo; a fix fits only when its code appears exactly once. Caveat wording now says what Demo Builder writes. New: Demo Builder: Storefront Report command, get_storefront_report tool, Diagnostics 'Storefront origin and Demo Builder's fixes' section, all one computation (storefrontReport.ts). Not built: Welcome/projects-list card line and the dashboard/card menu doors, the zip pre-create fit display, the pre-render and content headings of the report. Live checks owed: aistore by link, a saved Bodea package, the zip path.
