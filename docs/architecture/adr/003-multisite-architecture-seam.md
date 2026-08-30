# ADR-003: Multisite Architecture Seam

**Status**: Deferred

> Relabelled 2026-08-30 by the ADR audit. Its own Decision opens "No implementation
> today", so `Accepted` overstated it. The two disciplines it asks for ARE live —
> 11 sites default a new state field to `'main'` — which is why this is `Deferred`
> rather than dropped.
**Date**: 2026-05-18
**Decision Maker**: Project Team
**Implementer**: TBD (no implementation today; this ADR documents the seam for future work)

---

## Context

### The Problem

Adobe's [Repoless multisite pattern](https://www.aem.live/developer/repoless-multisite-manager) is the canonical approach for serving multiple environments (dev/stage/prod) or multiple locales (en, fr, de, …) from a single Git repository. Each "site" gets its own Configuration Service entry pointing at a distinct content source and (optionally) its own Adobe I/O workspace.

Demo Builder currently encodes a **single-environment, single-locale** assumption throughout its provisioning flows. Today this is a deliberate simplification — demos are single-environment by design and customers spin up new demos rather than promoting one through stage/prod. The question is whether to break this assumption now, and the answer (per the [Production-Readiness Roadmap](../../research/2026-05-18-production-readiness-roadmap.md)) is **no — defer until a demo actually needs it**.

This ADR documents *where* the single-env assumption is encoded so a future multisite implementation can scope its work concretely instead of re-deriving the seam.

### Why Document Without Implementing

Three reasons:

1. **Heavy lift, unproven demand.** Multisite would require per-env Config Service entries, per-env mesh deployments, per-env preview URLs, per-env state. None of the current demo use cases need it.
2. **Future code changes risk encoding new single-env assumptions.** Without a documented seam, every new feature might accidentally hardcode "main" or "default" as the only environment — making any future multisite work strictly harder.
3. **Forward compatibility, not retrofit.** Recording the seam lets reviewers catch foreclosures early (in PR review) rather than after they ship.

### Current Single-Environment Assumptions

#### 1. Project state — one DA.live org/site per project

**File**: `src/features/eds/services/reset/edsResetParams.ts` (lines 123-124, 168-179, 197-198)

Each Demo Builder project stores **one** `daLiveOrg` and **one** `daLiveSite` in `componentInstances[EDS_STOREFRONT].metadata`. The reset and setup flows read these scalar fields directly:

```typescript
const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;
```

Multisite needs a map keyed by environment (or locale):

```typescript
// Conceptual shape — NOT today's schema
{
    environments: {
        main:  { daLiveOrg: "...", daLiveSite: "..." },
        stage: { daLiveOrg: "...", daLiveSite: "..." },
        prod:  { daLiveOrg: "...", daLiveSite: "..." },
    }
}
```

#### 2. `buildSiteConfigParams` — takes one org/site

**File**: `src/features/eds/services/configService/configurationService.ts` (line 65)

```typescript
export function buildSiteConfigParams(
    repoOwner: string, repoName: string, daLiveOrg: string, daLiveSite: string,
    overlayUrl?: string,
): SiteRegistrationParams
```

Each call produces a single Config Service registration body. Setup (`handlers/configServiceRegistration.ts`, invoked from `storefrontSetupPhase3.ts`) and reset (`edsResetService.ts`) each call it once per project — both now via the shared `services/configService/siteConfigRegistrar.ts`.

Multisite needs either:

- **Loop**: call `buildSiteConfigParams` once per environment + a parallel `Promise.all` of `registerSite` calls, OR
- **List-aware variant**: a sibling function `buildSiteConfigParamsForEnvironments(envs[])` that returns an array.

The current signature stays single-env; the multisite implementation adds a sibling rather than overloading the existing function.

#### 3. Mesh deployment — one Adobe I/O workspace per project

**File**: `src/features/mesh/services/meshDeployment.ts` (`deployMeshComponent`, ~line 141)

Each project picks one Adobe I/O workspace at creation time and deploys one mesh into it. The mesh endpoint URL is workspace-scoped:

```
https://graph.adobe.io/api/<mesh-id>/graphql
```

Multisite needs one mesh per environment, since prod meshes must point at prod Commerce backends with prod caching characteristics. Implementation would need:

- Per-env workspace selection in the wizard
- Per-env `deployMeshComponent` invocations
- Per-env state tracking (`meshState` keyed by env)
- Per-env staleness detection

#### 4. Storefront preview URLs — derived from one main branch

**File**: `src/features/eds/config/config-template.json` (robots.txt + analytics blocks substitute `{ORG}` and `{REPO}` against a single branch assumption: `main--{REPO}--{ORG}.aem.live`)

The robots.txt sitemap URL (B1, commit `d012e7d9`) hardcodes `main--`. EDS branch-preview URLs follow `<branch>--<repo>--<owner>.aem.live`, so multisite via branch-per-locale would need this template to interpolate the branch identifier too.

#### 5. Commerce store scope — one website/store/store-view triple per project

**Added 2026-08-11.** The first four seams are all EDS-side. The Commerce scope is the
same assumption on the other axis, and it had more surfaces hanging off it than any of
them.

A project stores **one** website / store / store-view triple, as three scalar env vars per
backend (`ACCS_*` and `ADOBE_COMMERCE_*` in `components.json`). Multisite needs the same
scalar → keyed change as seam 1:

```typescript
// Conceptual shape — NOT today's schema
{
    scopes: {
        main: { websiteCode: "citisignal", storeCode: "citisignal_store", storeViewCode: "citisignal_us" },
        fr:   { websiteCode: "citisignal", storeCode: "citisignal_store", storeViewCode: "citisignal_fr" },
    }
}
```

Where the singular assumption is encoded:

| File | What assumes one |
|---|---|
| `features/components/config/components.json` | three scalar keys per backend |
| `features/components/config/envVarKeys.ts` | `BACKEND_OWNED_SCOPE_KEYS` — "the backend owns *the* scope", not the scope map |
| `features/components/ui/components/StoreSelectionRow.tsx` | `getFieldKeys(group.id)` writes exactly three fixed keys |
| `features/eds/services/configGenerator.ts` | `extractConfigParamsFromConfigs` emits singular `websiteCode` / `storeCode` / `storeViewCode` into `config.json` |
| `features/mesh/services/stalenessDetector.ts` | compares scalar values against the deployed snapshot |
| `features/dashboard/ui/components/integrations/integrationCardModel.ts` | `deriveCommerceScope` returns ONE triple for the flyout's Commerce scope row |

**Already the right shape — do not re-model it.** `Project.commerceStoreStructure` is a
CATALOG of every website, store group and store view on the instance, persisted from
discovery. It is not a selection, so multisite needs nothing from it; the names for N
scopes are already there.

**UI consequence.** Configure's Commerce tab renders Connection and Business Structure as
two sub-sections of one tab (`ConfigureSectionBody`). That is right for a single triple —
three pickers in one row, with a screen of space beneath. When the scope becomes a LIST
with add/remove, Business Structure should be promoted to its own tab, so a growing list
is not stacked under the connection fields. The split logic already exists as
`filterGroupsForSection`; promotion means `buildConfigureSections` emitting two sections
for one group, with a synthetic section id while `renderFieldRow` still receives the REAL
group (the store cascade branches on `group.id`).

**Trigger for the UI change specifically: when the scope stops being one triple.** Not
before — a whole tab for three pickers reproduces the single-control-tab problem that
`.rptc/plans/configure-commerce-subsections` removed.

---

## Decision

**No implementation today. Document the seam in this ADR and apply two ongoing disciplines:**

1. **State-shape discipline**: new metadata fields added to project state SHOULD default to "main" environment rather than be hardcoded as global. Example: a future field `someEnvSpecificThing` belongs on the (currently single, future-multiple) environment record, not on the project root.

2. **Function-signature discipline**: new functions that depend on `daLiveOrg`/`daLiveSite`/workspace SHOULD accept them as parameters rather than reaching into project state directly. This makes them callable per-environment in a future world without refactoring.

### Rationale

- **YAGNI.** No demo today needs multi-env. Building it speculatively burns time and adds surface area.
- **Open the door, don't walk through it.** Forward-compatible discipline in current PRs costs near-zero; retrofit cost is high.
- **One ADR beats many tribal-knowledge conversations.** Future contributors can read this ADR and understand the boundary without re-investigating.

### Decision Criteria for Triggering Implementation

Implement multisite when ANY of these become true:

- A demo customer asks for per-env demos (dev/stage/prod) sharing one repo.
- A demo customer asks for multi-locale demos (one repo, multiple languages, multiple sites).
- Adobe's CitiSignal template (or whichever template Demo Builder defaults to) starts assuming multisite — e.g., references multiple aem.live sites in its `helix-sitemap.yaml` or expects per-env Config Service entries.
- An RPTC feature cycle proposes touching `buildSiteConfigParams`, `extractResetParams`, or `deployMeshComponent` in a way that would benefit from the multi-env shape.
- A demo needs one storefront to serve more than one Commerce website / store view (seam 5) — e.g. a locale switcher backed by different store views.

### Trade-offs Accepted

- **Slightly slower future implementation**: without scaffold built today, the future cycle does both the implementation AND the migration of existing state. The migration is the harder part.
- **Demo Builder cannot showcase multisite**: customers asking "show me Repoless multisite" cannot use a Demo Builder demo to see it. They'd need to stand it up manually until this ADR's implementation lands.
- **Possible drift**: future PRs may accidentally encode new single-env assumptions despite the discipline. PR review must check this.

---

## Implementation (Deferred)

No code changes in this ADR. When multisite work happens, the implementing PR(s) should:

### Step 1 — Project state schema migration

- Update `componentInstances[EDS_STOREFRONT].metadata` to support an `environments: Record<string, EnvMetadata>` field alongside the current `daLiveOrg` / `daLiveSite` scalars.
- Migrate existing projects: copy the scalar fields into `environments.main` at load time. Keep scalar fields for backward compatibility during a deprecation window.
- Add `selectedEnvironment` to project state (default `"main"`).

### Step 2 — Config Service per-env registration

- Add `buildSiteConfigParamsForEnvironments(repoOwner, repoName, environments)` returning `SiteRegistrationParams[]`.
- Setup flow (`handlers/configServiceRegistration.ts::registerConfigurationService`) becomes `Promise.all(envs.map(env => configService.registerSite(...)))`.
- Reset flow (`edsResetService.ts::publishConfigAndRegisterSite`) same pattern.

### Step 3 — Mesh per-env deployment

- Wizard adds a per-env workspace selection step (or auto-picks based on workspace-name patterns like `*-dev`, `*-stage`, `*-prod`).
- `deployMeshComponent` iterates over the environments list.
- `meshState` becomes `Record<envName, MeshState>`. *(Post-ADR-011 D3 note: `meshState` is retired — this sketch generalizes to per-env keyed `appBuilderComponents` mesh entries instead.)*

### Step 4 — Robots.txt + analytics template

- Update `config-template.json` to support env-scoped substitution (e.g., a `{BRANCH}` placeholder alongside `{ORG}` / `{REPO}`).
- `configGenerator.ts` resolves the correct branch per environment.

### Step 5 — UI surfacing

- Sidebar shows the active environment.
- Switch-environment action wherever appropriate.
- Reset and configuration UIs scope their operations to the active environment.

Each step is a separate `/rptc:feat` cycle. Step 1 is the load-bearing one — without state migration, the rest cannot proceed.

---

## Verification

This ADR has no implementation, so no test verification. Acceptance criteria for the deferred implementation:

- A single project can register 2+ Config Service site entries pointing at different content sources.
- A single project can deploy 2+ meshes to 2+ Adobe I/O workspaces.
- Existing single-env projects continue to work without migration prompts (`environments.main` shim).
- Adobe Repoless-pattern preview URLs (`<branch>--<repo>--<owner>.aem.live`) resolve correctly per environment.

---

## Consequences

### Positive

1. **Future multisite work has a concrete starting point.** The implementing PR doesn't re-investigate the seam.
2. **Current PRs can be reviewed against this ADR.** Reviewers can flag accidental new single-env assumptions.
3. **No speculative implementation cost today.** Demo Builder stays small and focused.

### Neutral

1. **Discipline must be enforced.** No automated check ensures new code respects the seam; relies on reviewer attention.
2. **Two patterns coexist when implementation lands.** During migration, both scalar and `environments` shapes will exist on project state.

### Negative

1. **Future work pays state-migration cost in full.** Could have been amortized by building the scaffold piecemeal.
2. **Cross-feature features may need rework.** Anything touching mesh state or DA.live config in the interim may need updating once multisite lands.

---

## Future Considerations

- **Storefront template support.** If Adobe's CitiSignal storefront adds Repoless-aware behaviors (e.g., reading the current branch for env-specific configuration), that may trigger this ADR's implementation regardless of customer demand.
- **AEM Config Service evolution.** Adobe's content overlay / BYOM patterns (see `byomOverlayUrl` in `SiteRegistrationParams`) may grow per-env semantics. Coordinate any multisite implementation with those.
- **Operational telemetry per env.** If Demo Builder ever ships dashboards or RUM-style metrics, those would benefit from per-env scoping built on the same primitives.

---

## References

- **Roadmap**: [Production-Readiness Roadmap, item C1](../../research/2026-05-18-production-readiness-roadmap.md#tier-c--multisite-ready-architecture-decisions-not-implementation)
- **Adobe pattern**: [Repoless multisite manager](https://www.aem.live/developer/repoless-multisite-manager)
- **Single-env code locations**:
  - `src/features/eds/services/reset/edsResetParams.ts` (project state shape)
  - `src/features/eds/services/configService/configurationService.ts` (`buildSiteConfigParams`)
  - `src/features/mesh/services/meshDeployment.ts` (`deployMeshComponent`)
  - `src/features/eds/config/config-template.json` (template URL substitution)

---

## Glossary

| Term | Definition |
|------|------------|
| **Repoless multisite** | Adobe's pattern: one Git repo serves multiple aem.live sites (per env or locale), each with its own Config Service entry |
| **Environment** | A logical deployment target (e.g., `main`, `stage`, `prod`). Each has its own DA.live content source, mesh, and preview URL |
| **Site (in Config Service sense)** | A registered entry in `admin.hlx.page/config/{org}/sites/{site}.json`. One Demo Builder project today registers one site; multisite registers multiple |
| **Single-env assumption** | Any code path that reads/writes scalar `daLiveOrg` / `daLiveSite` / workspace instead of a list keyed by env |
| **Seam** | The boundary in current code where a future multisite refactor will need to insert per-env logic |
