# Step 03 — Catalog config + schema + loader (6th declarative config)

**Purpose:** Add the declarative catalog of pre-built deployables — the 6th config file, mirroring
`block-libraries.json` exactly (curated list + loader + types). Seed the three existing meshes. Each
entry declares `kind`, `source`, `compatibleBackends/Frontends`, `requiredApis`, `providesEnvVars`,
and its OWN env schema. This is the data backbone D2's selection UX will consume (seam left clean).

**Prerequisites:** Step 01 (types). Independent of steps 02/04–09 (can be built in parallel, but
sequenced here for review clarity).

**Reuse / surgical anchors (verified):**
- `src/features/project-creation/config/block-libraries.json` + `.schema.json` — structure to mirror.
- `src/features/project-creation/services/blockLibraryLoader.ts` — loader pattern to mirror exactly
  (static JSON import + `as unknown as Config` + pure filter functions).
- `src/types/blockLibraries.ts` — type-file pattern to mirror.

## Tests to write FIRST (RED)

New file: `tests/features/project-creation/services/deployableCatalogLoader.test.ts`

- [ ] `getAvailableDeployables(backendId, frontendId)` returns the PaaS mesh for an EDS+PaaS selection.
- [ ] returns the ACCS mesh for EDS+ACCS; the headless mesh for a headless frontend.
- [ ] returns `[]` for an unmatched backend/frontend combo.
- [ ] `getDeployableEntry(id)` resolves a seeded entry; `undefined` for unknown id.
- [ ] `getDeployableSource(id)` returns `{owner, repo, branch}`.
- [ ] `getDeployableEnvSchema(id)` returns the entry's env schema array.
- [ ] **Schema validity:** every seeded entry validates against `deployables.schema.json` (load JSON,
      assert required fields present, `kind` ∈ {mesh,integration}, env schema items have `{name,type}`
      with `type` ∈ {text,secret}).
- [ ] each mesh entry's `requiredApis` includes `GraphQLServiceSDK` and `providesEnvVars` includes
      `MESH_ENDPOINT` (load-bearing for steps 04 + 07).

## Files to create / modify

- CREATE `src/features/project-creation/config/deployables.json` — seed three meshes:
  | id | source repo | kind | compatibleFrontends | compatibleBackends | requiredApis | providesEnvVars |
  |---|---|---|---|---|---|---|
  | `commerce-paas-mesh` | `skukla/commerce-paas-mesh` | mesh | `["eds-storefront"]` | `["adobe-commerce-paas"]` | `["GraphQLServiceSDK"]` | `["MESH_ENDPOINT"]` |
  | `commerce-eds-mesh` | `skukla/commerce-eds-mesh` | mesh | `["eds-storefront"]` | `["adobe-commerce-accs"]` | `["GraphQLServiceSDK"]` | `["MESH_ENDPOINT"]` |
  | `headless-commerce-mesh` | `skukla/headless-commerce-mesh` | mesh | `["headless"]` | (both / unset) | `["GraphQLServiceSDK"]` | `["MESH_ENDPOINT"]` |
  - Confirm exact backend/frontend ids against `stacks.json` / `components.json` during GREEN (the table
    is the spike's seed mapping; verify the literal stack ids).
  - Each entry carries an `envSchema: [{name, type, label, derivedFrom?/providedBy?}]` (meshes' backend
    inputs are largely `derivedFrom` Connect-Commerce — likely zero `type:'secret'` for the seed).
- CREATE `src/features/project-creation/config/deployables.schema.json` — JSON schema (mirror
  `block-libraries.schema.json`); `kind` enum, env-schema item shape, required fields.
- CREATE `src/types/deployables.ts` — `DeployableCatalogEntry`, `DeployablesCatalog`,
  `DeployableEnvVar` ({name, type:'text'|'secret', label, derivedFrom?, providedBy?}), `CustomDeployable`
  (mirror `CustomBlockLibrary`).
- CREATE `src/features/project-creation/services/deployableCatalogLoader.ts` — mirror
  `blockLibraryLoader.ts`: `getAvailableDeployables`, `getDeployableEntry`, `getDeployableSource`,
  `getDeployableEnvSchema`, `getDeployableName`.

## RED → GREEN → REFACTOR

- RED: loader + schema tests fail.
- GREEN: write JSON + schema + loader.
- REFACTOR: dedupe filter predicate; keep loader <150 lines like its sibling.

## Acceptance criteria

- Catalog loads, filters by backend/frontend, validates against its schema; suite GREEN.
- Custom-deployable-URL VS Code setting is declared in `package.json` `contributes.configuration`
  (mirror `demoBuilder.blockLibraries` / `customBlockLibraries`) — registration only; consumption is D2.

## Risks

- **Wrong stack/backend ids in seed** → a deployable never appears for its intended user. Mitigation:
  the GREEN step verifies literal ids against `stacks.json`; tests assert each expected combo resolves.
