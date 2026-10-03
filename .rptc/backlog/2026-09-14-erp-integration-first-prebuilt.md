---
id: AB-9
kind: feature
area: app-builder
parent: AB-1
needs: []
value: high
status: active
---

# ERP integration: the first pre-built integration in the catalog

Filed 2026-09-14 by the owner. The integrations gallery is empty today (the two catalog
entries are the starter-kit seed and the blank shell); this is its first tile.

## The ask, in the owner's words

Use the Commerce integration starter kit to create an integration with an ERP modeled on
SAP. It ships two things: the ERP clone and the App Builder integration to it, so the SC can
demonstrate both the SAP side and the Commerce integration. Bidirectional. Works whatever
data the Commerce instance holds. Every ERP record resettable. Nishant Kapoor's private
`agilent-erp-mock` is the reference.

## The shape (plan: `.rptc/plans/erp-integration/`, thirteen-plus decisions in its ledger)

Two public repositories (`skukla/demo-erp`, `skukla/commerce-erp-integration`), two catalog
entries, one gallery tile "ERP integration" named by the SE at pick time. The ERP is a new
kind of component, `system`: a plain App Builder app in the demo's own project and
workspace, App Builder Database for its records, its own screen, provides `ERP_BASE_URL`,
knows nothing of Commerce, and is a UNIT with its integration (added before it, removed
with it, shown as the second section of its card, never a card of its own). The integration
is the workspace's one App Management app, built on the kit: the order and pricing webhooks,
syncs both ways, company write-back with a ledger, the mirror and reset, an Admin UI SDK
screen inside Commerce Admin. Reset: Commerce is master of what it owns; the ERP is
transitory; only the company blocks and credit limits the ERP set are reverted.

## Steps

01 spike the four unknowns on a scratch workspace · 02 the ERP repository · 03 the
integration repository · 04 catalog entries, the unit's add/remove, naming · 05 the card,
the flyout, the agent tools · 06 live acceptance on Bodea and docs.

## Rules the owner set

- Build both apps with our tooling to Adobe's standards (the starter-kit skills, the App
  Builder patterns); Nishant Kapoor's code is used where it meets that bar, assessed rather than trusted.
- The scratch workspace for the spike is created and deleted by the agent through the
  proven SDK path; no owner action needed.
- The ERP's display name is an input of the integration's configuration, default "Acme ERP".
- An instance without B2B companies gets one default business partner named for the project.

## Shipped so far

- 2026-09-14  docs(rptc): plan the ERP integration, the first pre-built catalog entry (`2b3490a65`)
- 2026-09-14  docs(rptc): record the ERP integration build and what its deploys taught (`c5ec66682`)
- 2026-09-14  docs(rptc): decisions 19 to 21 and the integration step as rebuilt (`449ac0c1a`)
- 2026-09-14  docs(rptc): step 07, how the ERP and the integration are updated (`e0f4bd2e4`)
- 2026-09-14  feat(wizard): the ERP integration's card says what comes with it; docs for the pair (`68086fabb`)
- 2026-09-14  feat(dashboard): the ERP rides its integration's card, with two verbs for people and agents (`edaf98784`)
- 2026-09-14  feat(app-builder): the ERP pair in the catalog — a system kind, bound to its integration (`f4c20c83d`)
- 2026-09-15  fix(app-builder): an app whose actions ask for the project credentials deploys (`b24918ad4`)
- 2026-09-15  Merge develop into feature/erp-integration (`a99be82a5`)
- 2026-09-15  fix(app-builder): a project subscribes only the APIs of what it has (`6e3d4b5b7`)
- 2026-09-15  chore(backlog): record the commits that reached AB-9 and PL-55 (`92ec7ecb3`)
- 2026-09-16  feat(app-builder): Open ERP opens the ERP's own screen, with a key only the extension holds (`09fd7af68`)
- 2026-09-16  fix(app-builder): an extension app's URLs come from its own config, so its Commerce install runs (`dd504124e`)
- 2026-09-16  fix(dashboard): the ERP flyout no longer blanks the integrations surface (`09f724928`)
- 2026-09-15  chore(backlog): record the scoping commit on AB-9 (`412c04544`)
- 2026-09-16  test(app-builder): the declared-actions tests join their subject's suite; the ERP doc gains Sync records (`72b7c92fe`)
- 2026-09-16  fix(app-builder): the ERP integration's credential gets Adobe Commerce as a Cloud Service, and a skipped API is never reported as added (`17759e61f`)
- 2026-09-17  docs(plans): systems get their own linked card; AB-15 and AB-16 for several ERPs (`b56aa29e2`)
- 2026-09-17  fix(app-builder): removing the ERP integration undoes what it changed in Commerce (`5754b0c1d`)
- 2026-09-17  feat(integrations): the ERP is a card of its own, and removal cleans up before it undeploys (`2365f948c`)
- 2026-09-17  docs(plan): decision 24 — the ERP's offline switch is removed, not kept (`bc15c7a7f`)
- 2026-09-24  docs(plan): the ERP programme — every piece of ERP research and planning in one order of work (`99c0539da`)
