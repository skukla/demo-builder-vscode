---
id: EDS-72
kind: fix
area: eds
needs: []
value: high
status: gated
plan: import-creates-project
waiting-on: the owner's live check: reset an imported project and see its own code come back
---

# Importing a demo file gives the SC the project, not a template to build one from

Plan: `.rptc/plans/import-creates-project/overview.md` (with Save as Package).

Filed 2026-11-18 from the beta.153 release walk (U3.1 step 2, finding F241's follow-up). Owner:
in beta.153.

## What happened

The owner sent a demo with Share Demo, Send a File, and imported the zip from the projects list.
An SC importing a file expects the project: the demo, ready to deliver. What they get is:

1. a new repository on their GitHub account, marked a template (`createRepositoryFromZip` in
   `services/storefront/zipStorefrontImport.ts`, its "Marking it as a template" step);
2. a new card on their Welcome step, named after the demo (`importDemoBundle` in
   `handlers/importStorefrontZipHandler.ts`, `rememberAddedDemo`);
3. the wizard, open on that card, which then makes the project its own repository from that
   template (`storefrontSetupPhase1.ts`, `createFromTemplate`), its DA.live site, the Commerce
   setup and the datapack install.

They end with a project, but by way of a template and a card nobody told them about, both left
behind. The wizard's first step, Demo Setup with the packages grid, reads as starting over.

Cause: the zip import began as "Add a Demo Package from a zip" (shareable-demo step 10), where
a template IS the point. Send a File reused it to carry a whole project.

## The two intents, and which door serves each

| The SC wants | Door | Gets |
|---|---|---|
| a demo to build their own projects from (a template) | Share Demo, **Send a Link**, with **Add to My Welcome Step**; Welcome step, **Add a Demo Package** (link or zip) | a card on the Welcome step |
| this project, handed over | Share Demo, **Send a File**, then the projects list's **Import from File** | the project |

This item changes only the second row. The first stays exactly as it is, so nothing about saving
a project as a template for reuse is given up: Send a Link already does it, for the SC and their
colleagues, and Add a Demo Package's zip door stays a template import.

## What this item would build

- Import from File, given a bundle with a storefront: no intermediate repository, no Welcome card.
  The wizard opens on the bundle's own project (name, settings, datapack, integrations), and
  creation makes the project's repository straight from the zip's files (`createRepositoryFromZip`
  already pushes files into a new repository; here the new repository is the project's own).
- Its own progress window shows the steps, as F241 made it.
- The wizard reads as an import of this project, not a choice among packages: the bundle's demo
  is shown as what is being imported (decide in design: skip the packages grid, or show it
  selected and locked).
- Every action has its agent tool (owner, 2026-11-18): the plan's agent table.

## Questions for the design

- The storefront's content site: the bundle carries only a pointer to the sender's published
  DA.live site, not the content (`demoBundle.ts:53-78`); creation copies from that site and does
  not need the source repository (`edsPipeline.ts:311-346`). Researched 2026-11-18.
- Reset: a project reset puts the storefront back to its template. With no template repository,
  the plan recommends restoring the project as imported (the import's commit in its own
  repository), not the brand it was built on, which would discard the sender's code.
- Code sync: unchanged. The project's repository is new, and the wizard's code sync step
  (`storefrontSetupPhase3.ts`, `pauseForGitHubApp`) covers it.

## Cost

Project creation's storefront phase gains a source kind (files from a bundle, beside a template
repository and a non-template one). Needs tests on both creation and regeneration paths and the
live cycle: import a bundle on a second account, create, publish, reset.

## Shipped so far

- 2026-11-18: phase 2 built on `fix/release-walk-fixes`, uncommitted, not yet run live. Import
  from File with a bundle opens the wizard on the imported demo alone; storefront setup makes the
  project's own repository from the bundle (`storefrontSetupBundle.ts`); the project records
  `importedFrom` with the import commit and Reset restores it (`importedProjectReset.ts`);
  `create_project_from_file` takes a bundle zip. Walk row F245.
- 2026-11-18: updates count from the sender's build, uncommitted. An imported project records
  the template commit the sender's storefront was pinned to (`builtWith.lkg` in the bundle's
  description file) as its `lastSyncedCommit`, so a storefront update offers every Adobe change
  since then; with no recorded commit it counts from the import, as before, and logs that.
  Walk row F252.
- 2026-11-18: the patches release too, uncommitted. Share Demo writes the storefront's patches
  release (`builtWith.patchesRelease`), and an imported thin-layer project records the sender's
  release instead of today's, so every patches release published since the sender's build is
  offered. Walk row F255.
- 2026-11-18  fix(import): an imported project counts patches releases from the sender's build (F255) (`5869e31da`)
- 2026-11-18  fix(share): every shared storefront records the template commit its code matches (F254) (`db733678e`)
- 2026-11-18  fix(import): an imported project counts updates from the sender's template version (F252) (`643f15844`)
- 2026-11-18  fix(updates): a storefront update never resets an imported project to the template (F249) (`18ea53f9c`)
- 2026-11-18  feat(import): Import from File creates the project from the bundle (EDS-72 phase 2) (`988e84d0e`)
- 2026-11-18  fix(share): plain sentences for the package file and card (F244) (`febb0cbaa`)
- 2026-11-18  fix(dashboard): the unreachable-source banner offers Save as Package (F243) (`3f02b2e55`)
- 2026-11-18  feat(dashboard): Save as Package on the Share row; Send a Link only shares (EDS-72 phase 1) (`9a2458671`)
- 2026-11-18  docs(plan): the owner's four decisions for EDS-72 (`16988d04a`)
- 2026-11-18  docs(plan): every import and package action has its agent tool (`3bcc0bd11`)
- 2026-11-18  docs(plan): import creates the project; Save as Package makes the template (`31bae6ec3`)
- 2026-11-18  docs(backlog): EDS-72, importing a demo file gives the project, not a template (`9c6e78fbb`)
- 2026-11-21  Reconciled 2026-11-21: code and docs are in v1.0.0-beta.153 and release test U3.1 passed live 2026-11-20. Left: the plan's phase 3 live step, reset an imported project and see its own code come back.
