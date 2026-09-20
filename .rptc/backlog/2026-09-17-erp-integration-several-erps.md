---
id: AB-16
kind: feature
area: app-builder
parent: AB-9
needs: [AB-23]
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

## The shape, rewritten by AB-17 (2026-09-20)

**Both limits above were limits of ONE SHARED WORKSPACE, and that is being removed**
(AB-17 answered; AB-23 builds it). Each integration and each system gets its own
workspace, so:

- **Item 1 below comes free.** A second ERP has its own namespace, its own database and
  its own static site. No package renaming, no collection prefixes, no per-project screen
  key — the renaming work this item was carrying is deleted, not done.
- **"One integration per ERP" is back on the table.** It was ruled out because one
  workspace holds one App Management app; with a workspace each, a second integration is
  possible. That makes it a real choice rather than a constraint, and it is now the first
  owner decision below.

The rest of this item — routing, tagging, per-ERP teardown, the cards — stands whichever
shape wins, because it is about which ERP owns which work, not about where the code runs.

### The two shapes now worth comparing

| | One integration, several ERPs | One integration per ERP |
|---|---|---|
| Commerce-facing apps | one | one per ERP, each its own App Management app |
| Routing | inside the integration (by website, store view, company) | by which app Commerce calls |
| Webhook and event names | one app id, so no collision | per-copy `metadata.id` (AB-17 steps 1–2 showed it can vary per build) |
| Resembles | middleware in front of several back ends | a separate connector per system |

Deciding between them is the first thing this item needs; everything else follows.

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

## Waiting on AB-23

The workspace-per-integration build. This item cannot be planned before it lands, because
which of the two shapes above is even possible depends on it.

## Owner decisions before planning

- **Which shape** (one integration routing to several ERPs, or one integration per ERP).
- The routing rule (store view, website, product attribute, company).
- How an SC adds the second ERP (from the integration's card, or the gallery tile again).
- Whether each ERP keeps its own screen, or one screen switches between them.

## Live checks before building

Both of the old checks are gone: they asked whether two ERPs could live side by side in
ONE workspace, which is no longer the plan. What replaces them belongs to the shape that
wins — for one-integration-per-ERP, it is AB-17's step 6: two copies with different
`metadata.id` on one Commerce, and the first copy's webhooks untouched.

## Shipped so far

- 2026-09-20  Rewritten around AB-17's answer: the renaming work is deleted (a workspace each gives every ERP its own namespace and database), and one-integration-per-ERP becomes a choice rather than an impossibility. Now waits on AB-23.
