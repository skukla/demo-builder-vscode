---
id: AB-16
kind: feature
area: app-builder
parent: AB-9
needs: [AB-23]
value: med
status: active
---

# One integration, several ERPs

Filed 2026-09-17 from the owner: demonstrating Commerce integrated with several ERPs is
common, and a project can hold one ERP today.

## Why it could not, and what shipped since

**Superseded 2026-09-22/23: a project CAN hold two ERP pairs today.** AB-23 shipped the
workspace-per-integration model and the copy machinery, and a second pair was added to a
live project on 2026-09-22 (`erp-integration-2` with `demo-erp-2`, in its own Adobe
workspace). AB-15's Commerce-side collision — two copies declaring the same app id — was
fixed the same day: a copy now declares the name the SC gave it. The list below is kept as
the record of what blocked it.

Two collisions REMAIN, and they belong to the routing layer, not here (found while
establishing the seam, `.rptc/research/multi-erp-order-routing/research.md`):

- both installed copies subscribe to `observer.sales_order_save_commit_after`, and each
  sends the WHOLE order to its own ERP;
- both write Commerce's single `ext_order_id`, so the first writer wins.

### The original list (2026-09-17)

- The pair is added under fixed catalog ids (`erp-integration`, `demo-erp`); a second add of
  the same tile is refused.
- The ERP deploys under a fixed package name (`deriveOwPackage('demo-erp')`), into fixed
  database collections, with one screen key per project, so a second ERP in the workspace
  would replace the first.
- The integration is an App Management app, and the ERP plan's decision 7 records one such
  app per workspace (the AB-2 spike's finding). Its Commerce webhook and event subscription
  names are fixed per app id, so two integrations on one Commerce collide (AB-15).

## Why anyone runs several ERPs — and the open decision (owner, 2026-09-23)

The reason, from a customer call: a company built by MERGERS AND ACQUISITIONS holds
different product records in different ERPs, aggregates them into one online catalogue,
and then has to decide how an order splits between those systems. They know a full order
management system exists and may be needed one day; they are betting on native Adobe
Commerce plus customization for now, and the owner thinks that bet is sound. So the demo's
job is to SHOW what that looks like — native Commerce and App Builder, no OMS on stage.

Two audiences, both real: the IT and architecture people who decide to integrate and own
the routing rules, and the operations person who lives with the result (a part-shipped
order, a line that went to the wrong system, a part that failed to send).

**The order customization is its own integration, layered on the ERP one** (owner): the ERP
integration stays one-ERP and generic. Which leaves the decision this item has to make:

- **A — foundation plus add-on.** The ERP integration exposes a seam; a routing integration
  sits above it when a project holds two ERPs. One codebase for ERP behaviour.
- **B — a complete multi-ERP integration type** in the catalog: one card, everything wired.

Leaning (not decided): **A underneath, B on the surface** — one ERP codebase and a separate
routing layer, with a catalog card that adds all three at once (ERP A, ERP B, routing), so
the SC picks one thing. A true B forks the ERP logic: the same order, price, stock and
status behaviour living twice, with the second copy drifting. Two COPIES of one app already
collided on one Commerce store (AB-15); two different codebases doing one job would be
worse.

What decides it is the SEAM — what the routing layer needs the ERP integration to expose so
it never reaches inside it. Being established in
`.rptc/research/multi-erp-order-routing/research.md`.

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

## Stored shapes the target list will move (read 2026-09-24, before the baseline release)

Read once so the single-ERP baseline can ship knowing what a target list changes. Nothing
here is built; the point is that every field below has an obvious one-target migration,
so releasing the baseline first costs a mechanical migration and nothing more.

**Extension side, per pair today.**

| Where | Field | Under targets |
|---|---|---|
| `componentConfigs['erp-integration']` | `ERP_DISPLAY_NAME` (typed at add, else the catalog default) | one name per target |
| `appBuilderComponents['demo-erp'].providesEnvVars` | `ERP_BASE_URL` (the ERP's deployed web base) | one address per target |
| deploy env of the integration | `ERP_BASE_URL`, `ERP_DISPLAY_NAME` as single action params | a target list the actions read (a config the integration owns, not N env vars) |
| `appBuilderComponents['erp-integration']` | `workspace` (own, shared with its ERP), `commerceAppId`, `name` ("<ERP> Integration"), `installation`, `updateAvailable` | unchanged; `name` reverts to the catalog's or names the targets |
| the pair model | `boundTo` 1:1, `pairedInstanceId`, `findMissingProvider`, `linkBroughtSystem`, copy numbering (`erp-integration-2` ↔ `demo-erp-2`) | the ONE real shape change: several systems bound to one integration. Every helper above assumes one partner |
| SecretStorage | the ERP's screen key; the ERP login the integration uses | one of each per target (the ERP side already keys them per ERP) |

**Integration side, per Commerce scope (global, website, store view) through
`@adobe/aio-commerce-lib-config`** (`app.commerce.config.ts` → `businessConfig.schema`,
read by `src/lib/settings.js`):

| Setting | Under targets |
|---|---|
| `orders_send`, `orders_hold_offline`, `orders_status_on_confirm` | integration-wide, unchanged |
| `pricing_contract_prices`, `pricing_discount_ceiling` | per target (each ERP prices its own products) |
| `structure_sales_org`, `structure_sales_org_name` | per target per scope (each ERP has its own structure) |
| `structure_order_prefix` | per target — the number's owner |
| `structure_owns`, `structure_owns_sources` (and the attribute rule) | per target — the routing rule IS the target's ownership |

**ERP side** (appearance, numbering, currency, company structure): already per ERP in the
ERP's own database. Nothing moves.

**The migration for a project on the baseline:** its one pair becomes target #1 — address
from `ERP_BASE_URL`, name from `ERP_DISPLAY_NAME`, its `structure_*` and `pricing_*` values
at each scope copied under that target. One-to-one, no information lost, no user input.

**Verdict:** release the baseline. The only structural change is the pair model going from
one partner to several, and that is AB-16's own work either way.

## Shipped so far

- 2026-09-20  Rewritten around AB-17's answer: the renaming work is deleted (a workspace each gives every ERP its own namespace and database), and one-integration-per-ERP becomes a choice rather than an impossibility. Now waits on AB-23.
- 2026-09-23  docs(backlog): AB-16, why several ERPs, and the layering decision it has to make (`201eb587e`)
- 2026-09-23  docs(research): what the mock ERP lacks, and where multi-ERP routing belongs (`8d1c8d75e`)
- 2026-09-23  docs(research): MSI is in the ACCS backend, so the ownership marker is a source (`425b233b6`)
- 2026-09-24  2026-09-24, reopened by the owner: should multi-ERP be its own catalog item shaped as the customer would build it — ONE integration serving one or more ERP targets, the routing consumer inside it (pass-through with one target), the mock ERPs separate systems? Recommendation given: yes, decide this item as 'one integration, several ERPs'; it matches the customer, keeps one App Management app (two copies register the same totals-collector batch names, unverified whether Commerce runs both), one codebase (a target list, not a fork), and per-target reversibility via the ledger. Costs named: fixed target slots in the static business-config schema; rules M1–M5 rephrased from pair to target; 'add another ERP' on the card; the OMS-swap story becomes a module boundary. Awaiting the owner's word before the plan, research and walk-through are rewritten
- 2026-09-24  docs(backlog): multi-ERP as one integration with targets — reopened, recommendation logged, awaiting the owner (`e1ee90feb`)
- 2026-09-24  DECIDED 2026-09-24 (owner): one integration, several ERPs, shaped as the customer would build it. The ERP integration serves one or more configured targets (address, display name, prefix, ownership rule); the routing consumer is inside it and passes every order through with one target; the mock ERPs stay separate systems in their own workspaces with their own screens and looks. AB-26t folds in as the routing slice. Order of work: nail down the single-ERP skeleton first (merge the loop branches, prove it live with a credential, keep the record true), then grow the target list out of it. Rules M1–M5 keep their discipline with the boundary moved from pair to target
- 2026-09-24  docs(rptc): decided — one ERP integration serving several targets; the routing item folds into AB-16 (`9aeca53a7`)
- 2026-09-24  docs(rptc): AB-16 reads the stored shapes a target list moves; the report lists the validation still owed (`d3bf6b69e`)
- 2026-09-26  Plan written (owner, 2026-09-26): .rptc/plans/several-erps/overview.md consolidates all remaining ERP work. Phase A finishes the one-ERP baseline (live proofs, API fixtures, filling by Demo Builder, shared-catalog contracts, sync validation, website scope); ERP feature growth freezes after contracts; Phase B is this item in eight slices (target model and migration, add another ERP from the card, per-target settings, routing, inbound per target, filling and pricing per target, surfaces, harness and live proof). Every ERP runs the same baseline code.
