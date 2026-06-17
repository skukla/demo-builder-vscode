# App Builder app — curated template catalog

> **Status: BLOCKED on slice 1** ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md)).
> Slice 2 of 5. Pure addition on top of the spine — no new deploy mechanics.

## Provenance

Designed 2026-06-17 alongside the App Builder app-structure research
([`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)).
Use case 2 from the design conversation: a brand-new app from a **pre-defined, best-practice
baseline** (e.g. a curated PaaS/SaaS mesh or a vetted integration app). Example baseline:
`skukla/commerce-paas-mesh`.

## Goal / scope

Let a user attach an app by picking from an **extension-curated catalog** of vetted baselines, instead
of typing a git URL. The catalog entry just supplies the source repo that the slice-1 spine already
knows how to clone + build + deploy.

**In scope:**
- A catalog of curated app/baseline definitions (new entries in the `app-builder` registry category
  from slice 1, or a dedicated catalog config mirroring `block-libraries.json` `type:"standalone"`).
- Selection UI: pick from the catalog (model on the block-library standalone-selectable list and the
  `customBlockLibraries` add-list UX). Catalog pick and the slice-1 URL entry coexist as two front
  doors to the same deploy.
- Per-entry metadata: display name, description, source repo/branch, default node version, required
  env vars (so `.env` generation works via the existing `requiredEnvVars` contract).

**Out of scope:**
- New deploy mechanics (spine owns them).
- Package-binding to demo templates (slice 3).
- Authoring/scaffolding (slice 4).

## UX / interaction — ⚠️ NEEDS A DESIGN PASS

The catalog browse/pick is genuinely open (list vs cards; how it sits beside the slice-1 URL entry;
filtering by backend type). Run a design-discussion pass before this plan locks — precedent: the
prereqs-reframe item's "16 decisions" thread; use the `rptc:frontend-design` skill for layout options.
Constraint: the picker should feel like the existing block-library standalone-selection list and
**coexist with**, not replace, the slice-1 URL entry.

## Reuse / refactor-for-reuse

- Reuse the slice-1 `deployAppComponent` path **unchanged** — the source repo is the only difference.
- Reuse the `block-libraries.json` standalone-entry config shape + its selection-list UI as the
  catalog model.
- No new deploy or state code.

## Execution plan (high level)

1. Define the catalog shape + seed entries (start with `commerce-paas-mesh` as a baseline if the demo
   model wants a curated mesh alongside the custom-app catalog; otherwise seed one vetted app).
2. Surface the catalog in the dashboard add flow (and wizard if slice-1 added a wizard surface).
3. Route a catalog pick into the slice-1 `deployAppComponent` path — the source repo is the only
   difference from the URL path.

## Constraints / risk

- Keep the catalog declarative (config-driven), consistent with the four existing config registries.
- Decide whether curated **mesh** baselines (like `commerce-paas-mesh`) belong here or stay in the
  existing mesh feature — the research notes the existing mesh could become one catalog entry among
  best-practice mesh templates. Settle in planning; do not silently expand mesh scope.

## Kickoff prompt

`/rptc:feat "Add a curated App Builder app catalog on top of the deploy spine (slice 2). Declarative
catalog of vetted baseline repos (model on block-libraries.json standalone entries); a catalog pick
routes into the existing deployAppComponent path — source repo is the only difference from the
URL flow. Coexists with the slice-1 URL entry. Settle whether curated mesh baselines (e.g.
commerce-paas-mesh) live here or in the mesh feature. See
.rptc/backlog/2026-06-17-appbuilder-app-curated-catalog.md and
.rptc/research/app-builder-app-structure/research.md."`
