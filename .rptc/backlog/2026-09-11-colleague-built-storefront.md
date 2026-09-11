---
id: EDS-13
kind: epic
area: eds
needs: []
value: high
status: planned
---

# Portable demos: share storefronts, move whole projects

Filed 2026-09-11 by the owner. An SC can only build a project on a demo that ships in
`demo-packages.json`. SCs want to build on a demo a colleague made, and to share their own.
Research and every decision: `.rptc/research/colleague-storefront/research.md`. Plans:
`.rptc/plans/portable-demos/` (program: ledger, contract step, track order) and
`.rptc/plans/shareable-demo/` (the feature: nine steps and its iteration log).

Expanded 2026-09-11 (owner) from "shareable storefronts" into a PROGRAM with two tracks: a
storefront is a piece of a project, and the project's own export, import and copy have
"grown horridly stale" (measured: `.rptc/research/project-import-export/research.md`).

**Track 1, shared storefronts:**

- [[EDS-13a]] "Add a demo": build a project on a demo someone shared by link (the import
  half; the Welcome-step plus card, the dialog, the resolver every later lookup moves onto).
- [[EDS-13b]] "Share this demo": turn an existing project into a demo others can add (the
  export half; un-built).
- [[EDS-13c]] The shareable-demo contract: the description file, its rules and the
  process, published in `docs/`.
- [[EDS-13d]] A team catalog of shared demos (after 13a and 13b).

**Track 2, project portability:** [[PL-56]], export, import and copy carrying the whole
project, on one versioned contract of which the storefront description file is a slice.

Both halves carry their agent surface in the same change (CLAUDE.md "Hit every surface"
#4): probe, add, share, and `list_demo_packages` / `create_project` reading added demos.

## Dependencies outside the program

- **[[DI-3]] Spike: export a pack through the item APIs** — the HEAD of the program
  (owner, 2026-09-11). D32 has Share (and Export) offer "Publish it now?" when a demo names
  a pack that is not in the datapack service. The research records, from the service
  author's design conversation and the Postman map, a route that uses only calls proven on
  the shared deployment: `get-export-items` (a pure read) → `create-datapack` (the SC's own
  pack) → `add-data-item` → `promote`. The bulk export action's store step, which fails on
  stage, is not on that route. DI-3 proves the route end to end and lands it behind the
  existing export door; [[DI-1]]'s authoring loop then rides the same route. EDS-13b carries
  `needs: DI-3`. Two earlier notes here said export was blocked; they conflated the bulk
  action with the route, and the owner corrected them.

## Why it is not a one-field change

A storefront here is a catalog row, and the project keeps only the row's KEY
(`selectedPackage` + `selectedStack`), never its contents (`src/types/settingsFile.ts:58`).
Eleven production sites re-resolve the id against the bundled JSON after creation, and
reset refuses outright for an unknown id. The design move is where a shared demo LIVES so
those sites can still find it: the project stores its own row, and one resolver reads the
project first and the catalog second.

## Decisions made with the owner (2026-09-11)

1. Its own brand card, at the brand level (not a frontend swap under a shipped brand).
2. Paste a link, and remember it in the SC's settings; the project stores the row.
3. EDS and headless together.
4. Their `main`, report only: the colleague owns the storefront, we own the integration
   contract; no pinning, no patches; the five load-bearing patches are dry-checked.
5. Copy their published content by default, skippable; index probed before Continue.
6. Prefill exactly what shipped brands prefill: the three store codes.
7. Words: "Add a demo" plus card; the shipped "Custom (B2B + B2C)" becomes "Starter";
   "shared", "custom", "import" and "from GitHub" rejected for the reasons in research §9.
8. The dialog is the Add Integration shape; every surface and word is an existing one
   (research §9a is the gate).
9. Option 2 (the in-repo description file) is in, as a published contract; option 3 (a
   team catalog) is next, not now.

## Shipped so far

- 2026-09-11  Research, seam map and design on `feature/colleague-storefront` (worktree
  from `origin/develop`); children filed.
- 2026-09-11  Research, design and program filing (d5f84e1f5)
- 2026-09-11  Program plan + shareable-demo feature plan (0c78af9a0)
- 2026-09-11  Decisions D16–D17 and four smaller ones recorded in the plans (b72ee40aa)
- 2026-09-11  Walkthrough decisions D18–D23, D5 amended; EDS-14 filed (4adf0aadc)
- 2026-09-11  Reuse map + plain step names (94c217020)
- 2026-09-11  Plan review: D26–D30 (1b214f7f8)
- 2026-09-11  D31–D32, DI-3 spike filed at the head (1d0248ac1)
