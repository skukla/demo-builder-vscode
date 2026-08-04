# The scenario meshes, and the two catalogs that disagree about them

**Date:** 2026-08-04
**Type:** Hybrid — external repo inventory (four mesh repos, read via `gh api`) + codebase config audit
**Question:** What are the scenario-specific mesh repos, why does each exist, and why can the
dashboard's "Add API Mesh" not deploy one?

## Summary

Four mesh repos exist. Each is a genuine scenario starting point: it presupposes a frontend
and a backend, and its GraphQL composition is shaped by that pair. Choosing the wrong one for
a stack does not merely under-perform — it reads environment variables the project does not
have.

The extension picks a mesh from **two independent configs that disagree**. `stacks.json`
(project creation) pairs stacks to meshes correctly. `app-builder-components.json` (the
dashboard Add picker) pairs two of them to the wrong repo, omits a fourth, and declares an
environment contract (`COMMERCE_ENDPOINT`) that **no repo reads**. That is why a mesh added
from the dashboard fails on a missing `.env` — and would still be the wrong mesh with one.

## The four meshes

### 1. `skukla/commerce-eds-mesh` — EDS storefront + Commerce **PaaS**

Registry id: `eds-commerce-mesh`. Its own header states the scenario: "optimized for Edge
Delivery Services (EDS) storefronts … For Headless/Next.js storefronts, use the headless repo
instead."

- **Two sources** — `CommerceGraphQL` (Commerce Core) and `CatalogService`.
- **Passthrough, no prefixes.** EDS dropins issue unprefixed operations (`productSearch`),
  so the schema must expose native names.
- **Conflict resolution by removal** — `filterSchema: ['Query.!products', 'Query.!categories']`
  strips those from Commerce Core so the richer Catalog Service versions win. The config's own
  comment: "EDS dropins expect the Catalog Service versions."
- **Response caching on**, with `X-Magento-Cache-Id` exposed.
- **Env:** `ADOBE_COMMERCE_URL/GRAPHQL_ENDPOINT/ENVIRONMENT_ID/WEBSITE_CODE/STORE_CODE/STORE_VIEW_CODE`,
  `ADOBE_CATALOG_SERVICE_ENDPOINT/ENVIRONMENT/API_KEY`, `ADOBE_PRODUCTION_CATALOG_API_KEY`.

### 2. `skukla/eds-accs-mesh` — EDS storefront + **ACCS**

Registry id: `eds-accs-mesh`. The ACCS counterpart of #1, and its header lists the differences
explicitly.

- **One source** — `ACCSGraphQL`. The ACCS supergraph already federates Catalog Service, so
  there is nothing to stitch.
- **No transforms.** With one source there are no name collisions to resolve — the reason #1
  needs `filterSchema` disappears.
- **No `x-api-key`, no `Magento-Environment-Id`.** Store scoping travels as
  `Magento-Website-Code` / `-Store-Code` / `-Store-View-Code` headers only.
- **Env:** `ACCS_GRAPHQL_ENDPOINT`, `ACCS_WEBSITE_CODE`, `ACCS_STORE_CODE`,
  `ACCS_STORE_VIEW_CODE` — four variables, sharing no names with #1.

That last point is the whole reason these are separate repos rather than one parameterized
mesh: PaaS and ACCS do not differ by endpoint value, they differ in how many services exist
and what identifies a store.

### 3. `skukla/headless-commerce-mesh` — headless (Next.js/React) + Commerce PaaS or ACCS

Registry id: `headless-commerce-mesh`. The most elaborate of the four, because a headless
storefront owns its own query layer and can consume a bespoke schema.

- **Three sources** — `CommerceGraphQL`, `CatalogServiceSandbox`, `LiveSearchSandbox`.
- **Prefixed operations** — `Commerce_`, `Catalog_`, `Search_`. The opposite choice from #1:
  prefixes make provenance explicit for a hand-written client, where EDS dropins would break.
- **Custom resolvers and type defs**, injected at build time from `schema/*.graphql` and
  `build/resolvers/*.js` — the README calls this a "build-time injection pattern to overcome
  API Mesh limitations."
- **Dynamic facets with SEO-friendly URL mapping**, and SSR-optimized queries returning whole
  pages in one request.
- **Env:** same `ADOBE_COMMERCE_*` / `ADOBE_CATALOG_*` set as #1.

### 4. `skukla/commerce-paas-mesh` — native non-conflicting; partner/mobile starting point

**Not in the registry.** It appears only in the dashboard catalog. Its README frames it as a
starting point rather than a demo stack: "Use this as a starting point for a headless
storefront or a partner/mobile integration. The config is instance-agnostic."

- **Three sources under native names** — Commerce Core owns cart/checkout/customer/orders;
  Catalog Service owns `products`/`categories`/`productSearch`; Live Search owns search.
- Conflicts resolved by `filterSchema` removal on both Commerce Core and Live Search.

It overlaps #1 and #3 heavily. Whether it should be offered at all is a product question, not
a defect — but it should not be offered *instead of* them.

### Why four and not one

| | Frontend expects | Sources | Naming | Store identity |
|---|---|---|---|---|
| commerce-eds-mesh | dropin queries | 2 (Core + Catalog) | native | `ADOBE_COMMERCE_*` + Catalog API key |
| eds-accs-mesh | dropin queries | 1 (ACCS supergraph) | native | `ACCS_*` headers |
| headless-commerce-mesh | hand-written client | 3 (+ Live Search) | prefixed | `ADOBE_COMMERCE_*` |
| commerce-paas-mesh | hand-written client | 3 (+ Live Search) | native | `ADOBE_COMMERCE_*` |

Naming is dictated by the frontend; source count and store identity are dictated by the
backend. A single mesh cannot satisfy both axes without runtime branching that API Mesh does
not offer, which is why the scenario repos exist.

## The two catalogs

### `stacks.json` — correct

Used at project creation. Selects by frontend × backend:

| Stack | Frontend | Backend | Mesh |
|---|---|---|---|
| `eds-paas` | eds-storefront | adobe-commerce-paas | `eds-commerce-mesh` |
| `eds-accs` | eds-storefront | adobe-commerce-accs | `eds-accs-mesh` |
| `headless-paas` | headless | adobe-commerce-paas | `headless-commerce-mesh` |
| `headless-accs` | headless | adobe-commerce-accs | `headless-commerce-mesh` |

Each id resolves through `components.json` → `mesh.<id>`, whose `requiredEnvVars` match the
repo's `.env.example` **exactly**, in all three cases. Source pins `tag: stable`.

### `app-builder-components.json` — wrong on every mesh row

Used by the dashboard's Add picker:

A third config settles what the catalog *intended*. `appBuilderComponentSelectionState.ts`
carries a bridge map from catalog id to registry id, so a mesh picked in the wizard still
drives `hasMeshInDependencies`:

```ts
'commerce-paas-mesh':     [COMPONENT_IDS.EDS_COMMERCE_MESH],   // → repo commerce-eds-mesh
'commerce-eds-mesh':      [COMPONENT_IDS.EDS_ACCS_MESH],       // → repo eds-accs-mesh
'headless-commerce-mesh': [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
```

Read against that map, the catalog's **compatibility axes are right** and its **`source` blocks
are wrong** — each row clones the repo whose name matches its own id string, not the repo the
registry id it bridges to actually lives in:

| Catalog id | Axes | Bridges to registry | Should clone | Actually clones |
|---|---|---|---|---|
| `commerce-paas-mesh` | eds + PaaS ✓ | `eds-commerce-mesh` | `commerce-eds-mesh` | `commerce-paas-mesh` ✗ |
| `commerce-eds-mesh` | eds + ACCS ✓ | `eds-accs-mesh` | `eds-accs-mesh` | `commerce-eds-mesh` ✗ |
| `headless-commerce-mesh` | headless ✓ | `headless-commerce-mesh` | `headless-commerce-mesh` | ✓ |

Both EDS rows are shifted by one position. `headless-commerce-mesh` escapes only because its
catalog id, registry id, and repo name happen to be the same string.

Four defects, all independent:

1. **Both EDS rows clone the wrong repo.** An EDS+ACCS project is offered a correctly-labelled
   ACCS mesh that clones `commerce-eds-mesh` — the PaaS mesh, which reads `ADOBE_COMMERCE_*`
   and needs a Catalog Service API key the project has no reason to hold. An EDS+PaaS project
   gets `commerce-paas-mesh`, a one-day spike, instead of the maintained EDS mesh.
2. **`eds-accs-mesh` is reachable from no row.** The one mesh built for EDS+ACCS is cloned by
   nothing.
3. **`envSchema` is fictional.** All three rows declare a single `COMMERCE_ENDPOINT`
   (`derivedFrom: 'connect-commerce'`). No repo reads that variable — verified against all four
   `.env.example` files and all four `mesh.config.js` files. The registry's `requiredEnvVars`
   are the real contract.
4. **Different pin.** Catalog sources pin `branch: main`; the registry pins `tag: stable`. A
   creation-time mesh and a dashboard-added mesh would not be the same code even if the ids
   agreed. The three registry meshes all carry a `stable` tag; `commerce-paas-mesh` carries
   **no tags at all**, which is the likely reason the catalog reaches for `main` — one
   untagged repo set the pin for all four.

Registry mesh entries carry no `compatibility` object at all, so the two configs share nothing
— not the id, not the repo, not the env contract, not the git ref. A third file exists purely to
translate between their id namespaces, and translating is what hid the shift: the bridge map is
correct, so the wizard behaves, and only the repo each row clones is wrong.

## Why the dashboard add failed

`demo-builder-test` is `eds-storefront` + `adobe-commerce-accs`, and stores exactly the four
`ACCS_*` values the registry's `eds-accs-mesh` declares.

1. The picker filtered the catalog by backend and offered "Commerce ACCS API Mesh" — correctly
   labelled, correctly filtered.
2. That row clones `skukla/commerce-eds-mesh`, the PaaS mesh, not `eds-accs-mesh`.
3. **Nothing wrote a `.env` — the dashboard add path has no env step at all.**
   `appBuilderComponentRunner.buildDefinition` synthesizes a definition from the catalog entry
   with `configuration: { requiresDeployment: true, deploymentTarget: 'adobe-io' }` and no
   `requiredEnvVars`, then clones and deploys. `generateComponentEnvFile` is never called here.
4. `mesh.config.js` calls `require('dotenv').config()`, then `aio api-mesh` resolves
   `{env.ADOBE_COMMERCE_GRAPHQL_ENDPOINT}` against nothing →
   `ENOENT: no such file or directory, open '.env'`.

Two independent failures stack. Fixing the identity alone still deploys with no `.env`; writing
a `.env` alone still deploys the wrong mesh. And `regenerateProjectEnvFiles` — the canonical
registry-driven regeneration shared by EDS Reset and Configure — would *skip* a
dashboard-added mesh even if it were called, logging "No registry definition for installed
component", because the catalog id is not a registry id.

## Resolution (implemented)

**Identity — done.** The catalog's three mesh rows are deleted. `meshCatalogDerivation.ts`
builds them from `stacks.json` × `components.json`, so a mesh's repo comes from the registry
url of the very id being derived and cannot be transposed again. Catalog mesh ids are now
registry ids, which collapsed the bridge map in `appBuilderComponentSelectionState` to an
`isMeshComponentId` check and removed the third id namespace entirely. The derived source keeps
the registry's `tag: stable` pin instead of flattening to `main`.

Guard verified against the broken state: reintroducing the original defect (repo = the id
string) fails three derivation tests, including the EDS+ACCS case that was the live bug.

`commerce-paas-mesh` is in no stack, so it derives to nothing — removed by construction rather
than by a deletion that could be undone. See the audit below for why it should not take a slot.

**`.env` — done.** Identity was only half the failure. `envFileGenerator` now exports
`regenerateComponentEnvFile`, a single-component write sharing one extracted
`buildEnvGenerationContext` with `regenerateProjectEnvFiles`, so the dashboard resolves env
values exactly as project creation and EDS Reset do rather than through a dashboard-local
variant. The runner calls it through an injected `writeComponentEnv` dep inside
`dispatchDeploy`'s mesh branch — the one kind-dispatched seam, so add and redeploy cannot
drift apart on it. A failure there aborts before the deploy rather than reproducing the ENOENT.

Scope is mesh-only by design: catalog app repos ship no `.env` and take credentials through
the deploy's env injection (`runtimeCredentials.ts`).

The write also reports its own progress step. The original bug report was that a mesh install
showed one static line; the env generation ran in that silence.

Guard verified: moving the write after the deploy fails three tests, including both ordering
pins. A separate derivation test asserts every derived id resolves to a registry mesh with a
non-empty `requiredEnvVars` — the link that makes the lookup work at all.

**`deployMeshHeadless` — done, best-effort.** This is not merely the MCP path: it is the shared
core behind `DeployMeshCommand`, the projects-dashboard deploy handler, AND the `deploy_mesh`
MCP tool — every mesh redeploy in the extension. It reused whatever `.env` creation wrote, so a
redeploy after a credential change in Configure shipped the previous endpoints and read as
"my change didn't apply".

It now refreshes the `.env` before deploying, but **best-effort**, unlike the add path:

| Path | No `.env` yet? | On refresh failure |
|---|---|---|
| `appBuilderComponentRunner` (add / dashboard redeploy) | yes, on add | abort before deploying |
| `deployMeshHeadless` (Deploy Mesh, dashboard handler, MCP) | no — creation wrote one | warn "may be stale", deploy anyway |

The asymmetry is the point. An add has no `.env`, so deploying without one *is* the ENOENT.
A redeploy always has one, so aborting because the refresh failed would convert a working
Deploy Mesh into a hard failure for any project whose mesh id has no registry definition —
trading a recoverable stale-config bug for a regression that blocks deploys outright.

### Audit: should an EDS+PaaS stack use `commerce-paas-mesh`?

No, on three independent grounds:

1. **It drops a header the EDS mesh documents as required.** `commerce-eds-mesh` carries
   `schemaHeaders: { Store: '{env.ADOBE_COMMERCE_STORE_VIEW_CODE}' }` on `CommerceGraphQL`
   with the comment *"Without Store header, Commerce may return incomplete schema missing
   mutations."* `commerce-paas-mesh` has no `schemaHeaders` on that source at all — a
   deploy-time introspection risk to cart and checkout.
2. **It is a one-day spike.** 5 commits, all 2026-06-16, untouched since, shipping a Postman
   collection and no `resolvers-src/`. `commerce-eds-mesh` has 100+ commits over a month whose
   most recent are *"add resolvers for missing EDS dropin fields"* and *"remove conflicting
   type extensions"* — the dropin-compatibility work `commerce-paas-mesh` never received.
3. **Its one addition is redundant where it would land.** It adds a Live Search source, but EDS
   dropins search through Catalog Service's `productSearch`, and `headless-commerce-mesh`
   already has Live Search plus prefixes, custom resolvers, and dynamic facets.

Flagged if it is ever revived: `CatalogService` is unfiltered while `LiveSearch` drops only
`products`/`categories`/`recommendations`, yet both point at `ADOBE_CATALOG_SERVICE_ENDPOINT`
and both expose `productSearch` and `attributeMetadata`. The README claims "no name
collisions"; the config does not obviously deliver that. Not deployed to confirm.

## Original recommendation

Delete the catalog's mesh rows and have the Add picker resolve meshes through the same
`stacks.json` → `components.json` path creation uses. That is the fix consistent with this
codebase's recurring defect shape — a documented single source with a live bypass — and it
removes, rather than reconciles, the second contract.

Consequences to weigh before implementing:

- **Install id changes.** The keyed `appBuilderComponents` map and the OpenWhisk package name
  derive from the component id. A project holding a `commerce-eds-mesh` key would need the
  legacy-id branch in `resolveKeyedComponentId`, or a migration.
- **`commerce-paas-mesh` loses its only home.** It is in no stack, and unlike the other three it
  carries no release tags — it is not version-managed as a shipped component. That points to
  hand-off template rather than demo stack, but it is a product call.
- **Git ref.** Registry `tag: stable` becomes the single pin. Verified present on
  `commerce-eds-mesh`, `eds-accs-mesh`, and `headless-commerce-mesh`; absent on
  `commerce-paas-mesh`, which would need a tag before it could join the registry.
- **`envSchema` disappears.** Nothing reads `COMMERCE_ENDPOINT`, so removing it costs nothing,
  but the catalog schema declares the field — the integration row (`app-builder-shell`) already
  omits it, so it can become optional rather than required.

## Verification performed

- All four repos read live via `gh api` on 2026-08-04: `mesh.config.js`, `mesh.json` (where
  present), `README.md`, `.env.example`.
- Registry `requiredEnvVars` compared field-by-field against each repo's `.env.example` — exact
  match for all three registry meshes.
- `COMMERCE_ENDPOINT` searched across all four repos' configs and env examples — zero hits.
- `stacks.json` mesh pairing extracted programmatically, not read by eye.
- `demo-builder-test`'s stored env keys compared against both contracts.
- Tags listed per repo via `gh api repos/skukla/<repo>/tags`.

## Open questions

1. Is `commerce-paas-mesh` meant to be offered in the extension at all? It is untagged and in no
  stack, and its scenario overlaps `commerce-eds-mesh` and `headless-commerce-mesh`.
2. Should the Add picker offer a mesh whose stack already implies one — or should it only offer
  the stack's mesh, making Add a re-attach rather than a choice?
