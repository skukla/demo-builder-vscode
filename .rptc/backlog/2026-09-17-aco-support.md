---
id: PL-60
kind: feature
area: platform
needs: []
value: high
status: backlog
---

# Finish Adobe Commerce Optimizer (ACO) support

Filed 2026-09-17 by the owner. The extension carries ACO code that was built for a plan
that never finished; this item finishes it. `AB-14` (ERP prices on an ACO storefront)
waits on it, and `EDS-1` (multisite) specifies ACO catalog views per locale.

## What is already there, and why none of it runs (surveyed 2026-09-17)

- **The add-on.** `adobe-commerce-aco` in `stacks.json` `addonDefinitions`, offered on
  `eds-paas` and `eds-accs`; in `components.json` with `providesServices`
  `catalog-service` and `live-search` and four credentials (`ACO_API_URL`,
  `ACO_API_KEY`, `ACO_TENANT_ID`, `ACO_ENVIRONMENT_ID`; `ACO_API_KEY` is a secret key).
  No wizard control adds it: `useProjectBuilder`'s `onAddonsChange` has no UI caller. The
  one package that requires it is hidden and coming soon; the shipped ones exclude it.
  An agent can add it through `configure_project`.
- **Storefront config.** `configGenerator.ts` has an `'aco'` case that emits
  `AC-View-ID` and `AC-Price-Book-ID` headers, as placeholders. It never runs:
  `mapBackendToEnvironmentType` is given the backend id, which is never the add-on. The
  add-on has no `configFlags`, so `injectAddonConfigFlags` adds nothing for it.
- **Data.** `toolManager.ts` writes the ACO credentials for the `commerce-demo-ingestion`
  tool and has `executeAcoIngestion` (`import:aco`) and `executeAcoCleanup`
  (`delete:aco`). Nothing calls the import; the cleanup runs only when a backend type of
  `aco` is set, and nothing sets it. `skipTools` is set from the add-on and read nowhere.
- **Configure.** A service group exists for the ACO fields; the configure-field-grouping
  research found it never renders, and editing ACO credentials after creation is an open
  question (`.rptc/complete/2026-08-11-project-level-facts-stored-per-component.md`).
- **Not there at all:** an ACO source in the API Mesh, any ACO API client, any creation of
  catalog views or price books, and any App Builder integration that reads the add-on.

## Earlier thinking to start from

- `.rptc/research/demo-template-architecture/research.md`: PaaS, PaaS + ACO, and ACCS as
  three models, with catalog and pricing in ACO for the second.
- `.rptc/complete/backend-matrix-or-logic/`: where the add-on came from, as a placeholder.
- `.rptc/research/project-builder-ux/research.md` and
  `.rptc/complete/project-builder-ux-rewrite/commerce-v6.md`: ACO is chosen under
  Commerce → Catalog, offered only where the package allows it (the v6/v7 prototypes show
  it).
- `.rptc/research/data-installer/spike-01-live-api.md`: the Data Installer service has an
  ACO datapack family (metadata, categories, products, price books, prices) behind its own
  pipeline; `.rptc/complete/data-installer-plan/overview.md` deferred it.
- `EDS-1` and `docs/research/2026-05-19-multisite-multillocale-research.md`: catalog view
  id and scope locale per store view; catalog views are created in ACO's own screens, with
  no provisioning API. Its Cycle A lists four ACO config fixes as prerequisites: add
  `configFlags`, fix the environment mapping, drop `all.Store` from ACO headers, and emit
  ACO analytics fields.
- `.rptc/research/multitenant-prerender-evaluation/research.md`: a live ACO storefront
  reads an ACO-native GraphQL endpoint.

## What finishing it takes (to be planned)

1. The choice: ACO under Commerce → Catalog in the wizard, and in Configure afterwards,
   with its credentials and catalog view id.
2. The storefront config: real ACO endpoint and headers when the add-on is on, and a test
   that the path is reachable.
3. Data: ACO datapacks through the Data Installer, or the bundled ingestion tool, with
   removal. (The 2026-06-15 cleanup notes that `ToolManager` is hard-coded to ACO and
   should not be reused as a general class; it says nothing against it for ACO.)
4. The mesh, if an ACO storefront needs one.
5. Integrations that write catalog data (the ERP's prices, `AB-14`) told whether the
   project uses ACO.
6. Reversal for everything above, and the dead code either wired or deleted.
