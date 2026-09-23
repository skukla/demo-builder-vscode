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
