# Datapack store — plan (recorded 2026-10-01; not started)

Program: [[DI-1]] (the authoring loop), with [[DI-3]] closed under it. Research:
`.rptc/research/data-installer-service-docs/research.md` (the App Builder Database section),
`.rptc/research/data-installer/spike-di3-item-api-export-2026-09-11.md` (why export fails),
`.rptc/complete/data-installer-plan/HANDOFF.md` (the service is locked). Owner's framing,
2026-10-01: sharing finished work for reuse is ONE purpose and gets this plan; an agent
working Commerce data without hitting walls is the OTHER (AI-12, on
`feature/commerce-agent-tools`). This plan is the first purpose only.

Nothing here is built. Step 1 is a measurement and it gates the shape of everything after it.

## Goal, in the owner's words

"A hybrid solution … one that uses the App Builder database solution to deploy an org-wide
builder datapack store for a library, while also allowing for SCs to add their own data packs
to it" — and "add this to the existing App Builder service that already powers the shared
lookup service and PDP stuff."

## What is true today (measured)

- **The Data Installer service installs well and cannot export.** Import is the bulk path and
  delete removes exactly what a pack installed (proven live, `docs/systems/data-installer.md`).
  Export fetches the rows and then fails to store them — its export store step has no database
  configuration on the deployment, and the async worker stores no better (DI-3, three
  measurements). The service's owner has retired; no service change is coming (HANDOFF, 2026-08-23).
- **Its WRITE APIs work.** `create-datapack`, `add-data-item`, batch get, `promote` and the
  `shared` flag on `update-datapack-metadata` all answer (DI-3 §gaps). So a pack can be PUSHED
  into the Data Installer by anyone who has its rows; only the service's own export is broken.
- **The shared service we own is `accs-discovery-service`** (github.com/skukla), deployed in the
  team workspace in the org that holds the Commerce instances. Five web actions — `discover-stores`,
  `get-commerce-credentials`, `render-pdp`, `prepublish-pdp`, `register-publish-key` — behind one
  fail-closed guard (IMS token + email-domain allowlist, ADR-014). It keeps publish keys in App
  Builder Files (`actions/lib/key-store.js`) and declares no database. `render-pdp` answers live
  shoppers on every SC's storefront.
- **App Builder Database** (GA 2026-03): declared in `app.config.yaml`, provisioned by the
  deploy, one database per workspace, no connection string anywhere — the failure that broke the
  Data Installer's export is structurally impossible. Documented surface covers find / insert /
  update / delete / count; aggregation and sessions were the two things flagged for
  verification, and neither is needed by a store this plan writes from scratch.
- **The one-registry rule stands** (owner, 2026-08-23): the org's packs must have ONE home.
  Two stores that can both hold a pack diverge.

## Decision (step 1 measured 2026-10-01 — see `step-01.md`)

**The datapack store is a new package inside `accs-discovery-service`, in the SAME Stage
workspace, on the App Builder Database, behind the service's existing guard.** Step 1 held
300 activations open beside `render-pdp` in a scratch namespace and the PDP path did not move
(p50 66–67 ms throughout, no 429 anywhere), so the second-workspace shape is not needed. The library is the set of packs marked
`shared`; an SC's own packs are theirs until promoted. Export runs in our service and reads the
instance over REST with the credential `get-commerce-credentials` already dispenses. Install
keeps using the Data Installer: our service pushes the pack through the Data Installer's working
write APIs, and its proven import and scoped delete do the rest.

Why this and not the earlier three shapes in DI-1: adopting the retired deployment (shape 1) has
nobody to adopt it from; a full cutover (shape 2) rewrites a service we did not write; the
partition (shape 3) runs two stores forever. This shape leaves the Data Installer as the
installer it is good at, and puts the only broken half — export — where we can fix it.

What it does NOT change: the Data Installer stays the installer; the extension's import, reset
and watch paths stay as they are; nothing is hosted inside the extension (ruled out, DI-1).

## Steps

| # | Step | Gate it answers | Design settled? |
|---|---|---|---|
| 01 | **Measure the namespace question.** DONE 2026-10-01 (`step-01.md`): 5, 100, 150 and 300 activations held open in a scratch namespace beside `render-pdp`; the PDP path's latency did not move and nothing answered 429. Decision: same workspace, as a package; one non-blocking activation per store job as the design rule. The `DatapackSpike` workspace stays as the development namespace until the build ships. | Can a long export or import share a namespace with the PDP path a shopper is waiting on? | Yes — measured |
| 02 | **Database and schema.** DONE 2026-10-01 (`step-02.md`): the database declared and provisioned, the `datapack-store` package with `packs` / `save-pack` / `save-pack-items` / `delete-pack`, a shared caller guard, 58 tests, live round trip green in the scratch workspace. Three database-library departures from the MongoDB driver found and wrapped (connect step, findOne throws on no match, list limit 100) and one read-after-write lag designed around. | Does the shape round-trip into `create-datapack` + `add-data-item`? | Yes, from DI-3's documented item shape; the push itself is step 05 |
| 03 | **Export action**, asynchronous: start / status / result, like `process-datapack-async`. Reads the instance over REST with the brokered credential, one data type at a time, stores rows as pack items. Selective by data type (the ERP demo captures `categories`, `b2b_shared_catalog_*`, `customer_groups`, `b2b_companies` without a whole-instance sweep). | Can we capture the Justrite setup as a pack? | Mostly — the per-type readers are the Data Installer's export processors, re-expressed over REST |
| 04 | **Library API**: list (shared + mine), get, promote (owner or allowlisted curator), delete own. Owner is the IMS email the guard already validates. | One registry, two visibilities | Yes |
| 05 | **Install route**: `push-to-installer` copies a pack into the Data Installer (create, add items, promote) and the extension's existing import takes over. Direct install over the bulk REST route is the fallback, not the default. | Does install stay the proven path? | Yes |
| 06 | **Extension**: the catalog shows library and own packs from our store beside the Data Installer's; export targets our store (`ExportDatapackModal`, `start_datapack_export`); a second `apiBaseUrl`-shaped setting for the store, read in one place like `dataInstallerConfig.ts`. Agent surface gets the same reads and the same confirm-gated writes (`mcp-tool-authoring`). | Human surface = agent surface | Partly — the settings and catalog merge need design |
| 07 | **Seed**: export the rebuilt Justrite setup (tree, grants to catalogs 1/15/16, Northgate and Harbor with contract prices) as the first library pack; install it onto a fresh scope; delete it; confirm zero. | Round trip to zero | — |

## Open questions (file as `question` items when they block a step)

- **Step 1's answer.** If the namespace cannot be shared, the store is a second workspace in the
  same I/O project — same repo, same guard, separate namespace — and the plan's "one service"
  becomes "one repo, two deploys".
- **Does the Data Installer's import grant new categories to the PUBLIC shared catalog?** On a
  B2B website an ungranted category is invisible to guests (EDS-24's measurement). If import
  does not grant, step 05 has to, after the push.
- **Packs bring their own root and do not merge** (`docs/systems/data-installer.md`). A pack
  exported from Justrite re-creates its tree; adding to an existing tree is not what a pack does.
- **The name.** "accs-discovery" also holding the datapack library is cosmetic; the README says
  what the service is.

## Not in scope

Replacing the Data Installer's import; hosting any of this in the extension; migrating the
Data Installer's own code to the database (the earlier cutover idea — superseded by this shape).
