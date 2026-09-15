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
- 2026-09-12  6a49396ca Step: the Custom brand is Starter (id and label); the package icon removed
- 2026-09-12  79edc51ee Step: read a colleague's repository - probe-shared-demo, markers verified against three real repos
- 2026-09-12  c768db042 Step: the Add a demo card and dialog - probe, fork on add, remembered demos as cards
- 2026-09-12  792564379 Step: create a project from an added demo - row on the wire, repo by template flag, dry check, wizard seeding, one field list, site-address links
- 2026-09-12  feat(eds): reset, update, change the source of and forget an added demo (`40144edcc`)
- 2026-09-12  chore(backlog): log the create-from-demo step on the add-a-demo item (`962143a7e`)
- 2026-09-12  chore(backlog): log the Add a demo dialog on the add-a-demo item (`4d10cfd41`)
- 2026-09-12  chore(backlog): log the repository probe on the add-a-demo item (`fd0421ba2`)
- 2026-09-12  chore(backlog): log the Starter rename on the add-a-demo item (`dab889ec4`)
- 2026-09-12  chore(backlog): log the resolver commit on the add-a-demo item; it is active (`df2fc6b7c`)
- 2026-09-12  feat(ai): the agent's demo actions, and one place for the content index path (`f534fd89e`)
- 2026-09-12  chore(backlog): log the after-creation step on the add-a-demo item (`c7c1d9863`)
- 2026-09-13  fix(ai): what the live run found — the agent's create path, the probe's fstab, DA.live's token, and one voice for its notifications (`eb8c1ec15`)
- 2026-09-12  chore(backlog): log the agent-actions step on the add-a-demo item (`c1e471ab2`)
- 2026-09-13  chore(backlog): log the live-run fixes on the add-a-demo item (`a9268f79f`)
- 2026-09-13  fix(eds): the probe names the site and the repository when only the site answers (`39f1d6679`)
- 2026-09-13  feat(eds): a storefront arrives as a zip, a demo leaves as a link or a file (`6b67cf95c`)
- 2026-09-14  docs(research): patches and the pre-render on saved demo packages and third-party storefronts (`58f378e77`)
- 2026-09-14  feat(add-demo): two ways in, one form at a time, and a warning where the structure is known (`64c9f1f38`)
- 2026-09-14  feat(add-demo): Add a demo package, with a description, a loading state and Edit (`b7d964ad1`)
- 2026-09-14  refactor(integrations): the mesh flyout's Commerce scope lines are one component (`0d548a497`)
- 2026-09-14  fix(add-demo): the spinner stays up while a dialog closes after a successful commit (`2b804909f`)
- 2026-09-14  fix(add-demo): a zip import that outlasts 30 seconds, and says what it is doing (`ae3689398`)
- 2026-09-15  feat(add-demo)!: no copy of an added demo; Remove deletes only a zip's repository (`171db9442`)
- 2026-09-15  fix(add-demo): Change source reaches a headless project; the dialog's name and description read as editable (`b4136c7ac`)
- 2026-09-15  fix(add-demo): Edit shows the repository in a read-only field; a taken zip name is a warning (`191dc85b5`)
