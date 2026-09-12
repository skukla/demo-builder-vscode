---
id: EDS-13a
kind: feature
area: eds
parent: EDS-13
needs: [PL-56a]
value: high
status: active
---

# "Add a demo": build a project on a demo someone shared by link

Filed 2026-09-11. The import half of [[EDS-13]]. Plan: `.rptc/plans/shareable-demo/`
(overview carries the feature's design iteration log). Research and every decision:
`.rptc/research/colleague-storefront/research.md` (§7 flow, §8 gap analysis, §9 decisions,
§9a the reuse mapping the plan is gated on).

## What the SC gets

A plus card, "Add a demo", at the end of the Welcome grid. It opens the same dialog shape
the Integrations area uses: stage 1 pick a demo added before or paste a GitHub link; stage 2
what we found (storefront kind, published content, store codes, and a B2B switch only when
we could not tell) plus a name. "Add demo" closes the dialog and the demo is an ordinary
card, selected, remembered in the SC's settings for next time. Build Your Project is
unchanged from there: the Storefront area shows the frontend piece as fixed by the repo.

## What the extension does

- Reads the repo with the SC's GitHub token: kind (`classifyRepoForStorefront` for Edge
  Delivery; a headless probe beside it), `fstab.yaml` for the content site, `config.json`
  for store codes and B2B flags, the dependency list as the B2B fallback, the template flag,
  the default branch, and the optional description file ([[EDS-13c]]) which wins when
  present.
- Probes the content site's published index before Continue.
- Synthesizes a package (two stacks for the kind, no `configDefaults` beyond the read store
  codes, read `configFlags`, `requiresMesh: 'optional'` unless the file says otherwise,
  `templateOwner/templateRepo` and `contentSource` set, no patch ledgers, no brand assets).
- Persists the synthesized storefront row WITH the project, and adds ONE resolver,
  `resolveStorefrontForProject(project)` (project row first, catalog second), that every
  post-creation lookup in research §3b moves onto. Pinned as a spine chokepoint.
- Creates the repo with `generate` when the template flag is set, else create-empty + git
  fetch (the path reset already uses). Reset goes to the colleague's `main`; no LKG pin.
- Runs the five load-bearing code patches as a dry check at create and reset; each miss is
  a caveat in the SC's words, alongside the existing PDP caveats.
- Agent surface in the same change: a read tool that probes a link as stage 2 does, an
  action that adds and remembers a demo, `list_demo_packages` returning added demos,
  `create_project` accepting an added demo's id or a link.

## Constraints carried from research

- A colleague's `config.json` is hints only: the generator rewrites it wholesale
  (ADR-009). The B2B answer must be stored with the project and re-expressed every time.
- Content copy needs a published index unless the SC's DA.live token belongs to the
  colleague's org. A missing index means an empty site, offered, never a mid-create failure.
- Rename the shipped "Custom (B2B + B2C)" brand to "Starter (B2B + B2C)" through the
  existing id rename map, so "custom" stops meaning make-it-yourself beside the plus card.
- Every surface, pattern and word is an existing one (research §9a). A new component,
  hook, stage shell, settings shape or noun has to name the row it replaces and why.

## Shipped so far

- 2026-09-12  5fc236f40 Step: look up a project's storefront in one place — resolver, eight sites moved, chokepoint pin
