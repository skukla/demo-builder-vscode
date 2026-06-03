# Federated two-instance demos — each SC manages their piece via their own Demo Builder

**Filed:** 2026-06-02
**Status:** **Leading direction** (per discovery — pending `/rptc:plan`). This is the **operator/delivery model** for the [commerce connection kit](./2026-06-02-commerce-connection-kit.md) (which is the *integration mechanism*).

## The model

Each SC runs **their own copy** of the Demo Builder extension, authenticated to **their own** Adobe org, managing **their piece** of a shared demo. The two halves integrate through a portable **contract** (the connection kit), not shared state — microservices-style federation.

- **Commerce SC's instance** → provisions the commerce backend (ACCS + API Mesh + Catalog Service) and **publishes their DA.live storefront** in their org (today's flow, assumed always present). Its public config *is* the connection source.
- **AEM SC's instance** → scaffolds the AEM `aem-boilerplate-xcom` storefront in their org + **discovers** the connection from the Commerce SC's published storefront URL → their storefront renders the shared commerce data, authored/governed in their AEM Sites.
- **The shared demo** = the same commerce data behind two independently-owned storefronts, each driven by its SC in their own environment.

## Why this is the most feasible of the options explored

1. **Each instance stays single-org → no multi-IMS refactor.** This is the architecture the extension already has (`adobeOrg/adobeProject/adobeWorkspace`, singular) — run twice, not rebuilt.
2. **Each SC works entirely within their own access/entitlement → dissolves the "human-access ceiling."** Neither SC needs membership in the other's org. (That was the real limit of the centralized "one operator switches orgs" model.)
3. **No hand-off needed — the values are published, and discovery already exists.** A deployed storefront serves its `config.json` publicly (the browser fetches it to render), and `x-api-key`/`Magento-Environment-Id` are **public read keys**. So the AEM side just *reads* the Commerce SC's published storefront config — extending the extension's existing store discovery (`commerceStoreDiscovery.ts`, `useStoreDiscovery.ts`, `handleDiscoverStoreStructure`). No file, no shared secret.
4. **The kit payload already exists** — `configGenerator.ts` output (endpoints + `x-api-key` + environment-id + store headers); runtime composition is cross-org-clean (ACCS-first).

## What it delivers

- Each SC **independently builds, manages, and iterates** their half — fully within their own access.
- "**Extend usage to AEM SCs**" realized the simplest possible way: the AEM SC just uses **their own copy** of the extension.
- The AEM SC connects by **pointing at the Commerce demo's URL** — the extension discovers the rest. No file passes between people.
- (Optional) a lightweight **shared demo descriptor** (brand / name / linkage) so both halves recognizably belong to one demo.

## Build pieces (incremental; mostly existing machinery)

- **Commerce side:** *nothing new* — building/publishing the DA.live storefront (today's flow) is what publishes the connection values.
- **AEM side:** "Discover from URL" (fetch the Commerce storefront's published config, extract the commerce subset — extends existing store discovery) · "Apply" (write to the AEM storefront's config service) · "Scaffold `xcom`" (template-copy — reuses repo-from-template) · **guide** the manual AEM steps (Code Sync, Cloud Manager site, IMS roles, UE enablement).
- **Optional:** a shared demo descriptor (brand / name / linkage).

## Operator topology: federated vs centralized

- **Federated (this):** two operators, one org each. Matches the two-SC reality; least refactor.
- **Centralized (multi-IMS, one project):** one operator with access to many orgs; N IMS wizard steps; heavier (multi-IMS-context state + `aio` context-switching refactor). A future option *if* one person ever needs to orchestrate everything.
- Same contract underneath → **not competing bets.** Federated first; centralized is the heavier later evolution.

## Honest limits (don't design these away)

- **Always fresh — no staleness.** Discovery reads the *live* published config, so there's no snapshot to go stale; if the Commerce SC repoints the backend, re-discovery picks it up. (This is why discovery beat the export/import file — see the connection-kit doc.)
- **No shared *secret*:** the connection values are public read keys, so there's no deliberate key-sharing step.
- **Dependency:** the Commerce SC must have a **published storefront** for discovery to read — assumed always true (they publish at least a DA.live storefront).
- **No live shared *state*** between instances beyond the published config; each half evolves independently.
- **Coherence = shared *data*, not shared *content***: each storefront is authored independently.

## Existing seams to build on

- `src/features/eds/services/commerceStoreDiscovery.ts` + `src/features/components/ui/hooks/useStoreDiscovery.ts` + `handleDiscoverStoreStructure` — the discovery primitive to extend (read a published storefront's config).
- `src/features/eds/services/configGenerator.ts` + `config-template.json` — the connection-value shape (what to extract/apply).
- Project-creation repo-from-template machinery — to scaffold `xcom` on the AEM side.

## For the plan

- The **discover + apply** flow: fetch the Commerce storefront's published config, extract the commerce subset, write it to the AEM storefront's config service.
- The **AEM-side scaffold + guide** flow (`xcom` template-copy + the manual AEM steps the extension can only guide).
- Optional **shared demo descriptor**.
- Where the "connect to a commerce demo" surface lives (Configure, dashboard, or both).
