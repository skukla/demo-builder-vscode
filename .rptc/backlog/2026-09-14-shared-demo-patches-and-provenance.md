---
id: EDS-13f
kind: feature
area: eds
parent: EDS-13
needs: [EDS-13a, EDS-13b]
value: high
status: active
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

## Owner decisions

All decided. The version-gap policy (plan step 05, decision 6) was confirmed by the owner on
2026-10-04 ("Do it!"): report always, fix what fits, offer the fork sync only to forks, never
reset a generated repository onto the current boilerplate, never refuse on age, warn below a
floor. (Decision 6 in the plan's overview records it as agreed 2026-09-14; this item listed it
as open until the 2026-10-04 confirmation. They now agree.)

## Shipped so far

- 2026-09-14  docs(rptc): plan boilerplate provenance, patches that fit and the version gap for shared demos (`a878f69ed`)
- 2026-09-14  docs(rptc): the card stays streamlined, the storefront report is one door away, diagnostics learns the same facts (`ac3ab675d`)
- 2026-10-03  2026-10-03 unattended run on loop/2026-10-03-night2-b (staged, not committed): steps 01-04 and 07 built, 05 stopped for the owner, 06 docs done and live acceptance not run. Every storefront now records its boilerplate (package.json name+version) and GitHub lineage (template_repository / fork parent) on the card, the project record (creation and reset) and a zip card; the add dialog shows one 'Built on' row. Save as demo package writes description file v2 with builtWith; a project started from it gets its ledger's fixes applied where they fit on create and reset (no re-pin: the hash guard is not built). A colleague's storefront with our lineage is offered the 5 load-bearing + 2 universal fixes that fit, opt-in (Storefront Report command modal, reset_project/create_project applyFixes:true), one commit to the SC's own repo; a fix fits only when its code appears exactly once. Caveat wording now says what Demo Builder writes. New: Demo Builder: Storefront Report command, get_storefront_report tool, Diagnostics 'Storefront origin and Demo Builder's fixes' section, all one computation (storefrontReport.ts). Not built: Welcome/projects-list card line and the dashboard/card menu doors, the zip pre-create fit display, the pre-render and content headings of the report. Live checks owed: aistore by link, a saved Bodea package, the zip path.
- 2026-10-03  feat(eds): shared demos carry their boilerplate and fixes; one storefront report (EDS-13f steps 01-04, 06, 07) (`0ee47ed3b`)
- 2026-10-03  2026-10-04 owner confirmed step 05 (version gap) as written: report always, fix what fits, fork sync only for forks, never reset a generated repo, never refuse on age, warn below a floor. Built on loop/2026-10-04-step5 (staged, not committed): floor OLDEST_TESTED_BOILERPLATE = 6.0.0 (the B2B template at the patches repo's b2b/last-known-good), and the warning 'Built on an older boilerplate (N.x); some fixes may not fit.' on the add dialog's Built on row and the storefront report (command, Diagnostics, get_storefront_report). Fork sync was already forks-only. Not built: a fork-sync door on the report.
- 2026-10-03  feat(eds): warn below the oldest tested boilerplate; Demo Builder Blocks in the library list, off by default (EDS-13f, EDS-24) (`2688a1018`)
- 2026-10-04  2026-10-04 night3-a (staged, not committed): staleness - both leftovers still unbuilt (no card line; the report had no fork-sync door); built the door: after the Storefront Report opens, if GitHub records the project's OWN repository as a fork of one of our patched templates and it is behind, a modal (default No) offers 'Bring the code up to date with the template', naming the fork, the template and the commit count, then runs the existing merge-upstream (ForkSyncService.syncFork) on its default branch; a conflict changes nothing and says so; a generated repository is never offered it (templateCatchUp.ts); NOT built: the one-line 'Built on' note on the Welcome and projects-list cards - it adds a line to two card grids and needs a visual check this run could not do (no compile).
