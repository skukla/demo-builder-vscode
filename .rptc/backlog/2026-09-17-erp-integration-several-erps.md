---
id: AB-16
kind: feature
area: app-builder
parent: AB-9
needs: []
value: med
status: backlog
---

# One integration, several ERPs

Filed 2026-09-17 from the owner: demonstrating Commerce integrated with several ERPs is
common, and a project can hold one ERP today.

## Why it cannot today

- The pair is added under fixed catalog ids (`erp-integration`, `demo-erp`); a second add of
  the same tile is refused.
- The ERP deploys under a fixed package name (`deriveOwPackage('demo-erp')`), into fixed
  database collections, with one screen key per project, so a second ERP in the workspace
  would replace the first.
- The integration is an App Management app, and the ERP plan's decision 7 records one such
  app per workspace (the AB-2 spike's finding). Its Commerce webhook and event subscription
  names are fixed per app id, so two integrations on one Commerce collide (AB-15).

## The shape: one integration, several ERPs

"One integration per ERP" is ruled out by the two limits above. The ERPs, though, are plain
App Builder apps, which the spine can package-isolate in one workspace, as it does meshes.
So the integration stays the single Commerce-facing app and routes each piece of work to
the right ERP, which is also how middleware between Commerce and several back ends usually
looks.

## What it needs

1. **ERP instances with their own names:** package, database collections (or a prefix),
   screen key and display name per instance; an "Add another ERP" path on an existing
   integration; the integration's `ERP_BASE_URL` becomes a list.
2. **Routing in the integration:** which ERP takes an order, receives price and stock
   changes and owns a company. The likely rule is by website or store view, chosen on the
   integration's Commerce Admin settings page (AB-10).
3. **Events tagged with their ERP**, so a change from one ERP touches only its part of the
   catalog, and the mirror sends each ERP only its share.
4. **Reset, detach and removal per ERP:** the ledger records which ERP made each write;
   removing the integration removes all of its ERPs.
5. **Cards:** the integration's Uses row lists every ERP (the stored link is already a list,
   `.rptc/plans/erp-linked-tiles/overview.md`).

## Owner decisions before planning

- The routing rule (store view, website, product attribute, company).
- How an SC adds the second ERP (from the integration's card, or the gallery tile again).
- Whether each ERP keeps its own screen, or one screen switches between them.

## Live checks before building

- Two package-isolated copies of the ERP in one workspace, each with its own database
  collections, both reachable.
- Whether App Builder Database collections can be named per instance, or need a prefix
  inside one collection.
