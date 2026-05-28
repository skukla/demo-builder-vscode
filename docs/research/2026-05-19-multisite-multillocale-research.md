# Multisite & Multi-Locale Research

**Captured**: 2026-05-19
**Origin**: `/rptc:research` session — deep investigation into multisite/multi-locale implementation options for Demo Builder, covering EDS/Helix patterns, Commerce backend capabilities, and codebase structural mapping.
**Status**: Research deliverable. Scope questions resolved separately; implementation via `/rptc:feat` cycles against the phases below.

---

## Context

Before implementing multisite or multi-locale support, this session investigated six scenarios the user identified:

1. Multiple website/store/store view combinations in the Commerce backend
2. Multiple storefront projects on DA.live (multiple brands/locales)
3. Multiple storefront repositories in GitHub (multiple brands/locales)
4. Multiple locales if ACO is included
5. Multiple locales/languages/store views in Commerce backend
6. Multiple locales in a single DA.live storefront (store switcher)

Research used three parallel agents: codebase structural mapping, EDS/Helix multisite web research, and Commerce multisite/multi-locale web research.

---

## The Platform Reality

### Two Independent Axes

**Axis 1 — How many EDS/storefront deployments?**

- **One EDS site, multiple locale paths** (`/en/`, `/fr-ca/`, `/de/`) — the standard localization pattern. One GitHub repo, one DA.live site, one Config Service registration, one aem.live URL. Locale is a path prefix and a different `config.json` header block per path. This is what the Commerce storefront template's store-switcher block is built for.
- **Multiple EDS sites, one GitHub repo** ("Repoless") — one canonical repo shared across N EDS registrations, each pointing to a different DA.live site. Used for separate brands or independent deployments that share code. Each site gets its own preview URL (`main--{site-name}--{org}.aem.page`).

**Axis 2 — How many Commerce store views?**

- **Commerce PaaS**: one instance, multiple store views (language/locale presentation), one GraphQL endpoint, different `Magento-Store-View-Code` header per path. Store view codes must exactly match DA.live folder names.
- **ACO**: one tenant, multiple Catalog Sources + Catalog Views, same GraphQL endpoint, different `AC-View-ID` + `AC-Source-Locale` headers per path.

These axes are independent. A single EDS site with three locale paths (`/en/`, `/fr-ca/`, `/de/`) maps to three store views on one Commerce instance — no extra GitHub repos, no extra DA.live sites, no extra EDS registrations.

---

## What Demo Builder Can and Cannot Control

| Capability | Possible? | Notes |
|---|---|---|
| Generate multi-locale `config.json` (path-keyed header blocks) | **Yes** | Pure config generation change |
| Configure PDP folder mappings per locale in Config Service | **Yes** | POST per locale path |
| Create locale folders in DA.live | **Yes** | DA.live content API |
| Provision store-switcher content per locale | **Yes** | DA.live content copy |
| Create Commerce PaaS store views via REST API | **No** | GET-only API; admin UI only |
| Create ACO catalog views | **No** | UI-only in ACO admin; no provisioning API |
| Deploy additional repoless EDS sites (same repo, new brand) | **Yes** | One PUT to Config Service + new DA.live site |
| Dynamic mesh headers for multi-store-view | **Yes** | Mesh config change — forward headers dynamically |

---

## The Six Scenarios Assessed

| Scenario | Verdict |
|---|---|
| Multiple website/store/store view combos in Commerce backend | Can READ existing hierarchy (already implemented). Cannot CREATE via API. |
| Multiple storefront projects on DA.live | Yes — repoless pattern: multiple DA.live sites, one GitHub repo |
| Multiple storefront repos in GitHub | Not recommended by Adobe; Repoless eliminates this need |
| Multiple locales if ACO is included | Config generation only — Demo Builder writes `AC-View-ID` / `AC-Source-Locale` headers per path. User must provide View IDs (ACO catalog views are UI-only). |
| Multiple locales/languages/store views in Commerce backend | Config generation only — Demo Builder writes the correct Magento header block per path. Store views must pre-exist in Commerce Admin. |
| Multiple locales in a single DA.live storefront (store switcher) | **Fully possible** — native Commerce storefront template pattern. Demo Builder can provision locale folders, config, and store-switcher content. |

---

## EDS/Helix Technical Reference

### Repoless Multisite

- "Repoless" = one GitHub repo drives multiple aem.live sites via the AEM Config Service
- Each site needs one PUT to `admin.hlx.page/config/{org}/sites/{site}.json`:
  ```json
  {
    "version": 1,
    "code": { "owner": "{github-org}", "repo": "{canonical-repo}" },
    "content": {
      "source": {
        "url": "https://content.da.live/{org}/{site}/",
        "type": "markup"
      }
    }
  }
  ```
- Preview URL formula: `https://main--{site-name}--{github-org}.aem.page`
- The site name in Config Service determines the subdomain, not the repo name
- Adobe explicitly discourages multiple repos per brand — Repoless replaces that pattern

### Multi-Locale Within One EDS Site

Path-based locale is the standard pattern:
```
/en/
/en-ca/
/fr-ca/
/de/
```

The `config.json` uses path-keyed overrides that merge with the default:
```json
{
  "public": {
    "default": {
      "commerce-endpoint": "...",
      "headers": {
        "all": { "Store": "default" },
        "cs": { "Magento-Store-View-Code": "default", ... }
      }
    },
    "/fr-ca/": {
      "headers": {
        "all": { "Store": "fr-ca" },
        "cs": {
          "Magento-Store-Code": "ca-store",
          "Magento-Store-View-Code": "fr-ca",
          "Magento-Website-Code": "base"
        }
      }
    }
  }
}
```

**Critical constraint**: "Store view codes in Adobe Commerce Admin must exactly match the folder names created in DA.live."

PDP folder mappings per locale require a separate Config Service POST per locale path:
```json
{
  "/en/products/": "/en/products/default",
  "/fr-ca/products/": "/fr-ca/products/default"
}
```

### Store Switcher

Adobe ships a built-in `store-switcher` block in the Commerce storefront template. Each locale folder must contain a `store-switcher` document listing available stores as a bulleted list. Links within the document use `#nolocal` to prevent automatic link rewriting. No locale switcher ships in CitiSignal by default — storefronts implementing multi-locale must provision the store-switcher content.

### DA.live Multi-Site

Two patterns:

**Pattern A — Single DA.live site, locale subfolders** (preferred for path-based multi-locale):
```
content.da.live/acme/mysite/en/
content.da.live/acme/mysite/fr/
content.da.live/acme/mysite/de/
```

**Pattern B — Separate DA.live sites per locale** (for repoless multi-brand or independent governance):
```
content.da.live/acme/mysite-en/
content.da.live/acme/mysite-fr/
content.da.live/acme/mysite-de/
```

DA.live does not support MSM Live Copy for document-based authoring (DA). MSM is available only with AEM Sites authoring.

---

## Commerce Technical Reference

### PaaS Store Hierarchy

Hierarchy: Global → Website → Store (group) → Store View

- Website: payment methods, shipping, catalog pricing, separate cart
- Store group: root category, separate category tree
- Store view: language/locale, currency display — no separate inventory

Multiple brands = multiple Websites on one PaaS instance. Store view creation requires Commerce Admin UI — the REST API exposes GET-only endpoints for the store hierarchy.

GraphQL endpoint: single URL (`/graphql`), store view selected via headers:
- `Store`: store view code (all core requests)
- `Magento-Store-View-Code`: for Catalog Service (SaaS) requests
- `Magento-Store-Code`, `Magento-Website-Code`: for multi-brand context

### ACO / Optimizer

One tenant per subscription. Multi-locale uses Catalog Sources + Catalog Views:
- Each store view synced from PaaS becomes a separate Catalog Source in ACO
- Catalog Views combine source + policies + price book
- Multiple brands → multiple Catalog Views from one base catalog

GraphQL endpoint: `https://{region}.api.commerce.adobe.com/{tenantId}/graphql` (same URL for all locales).
Headers per request:
- `AC-View-ID`: catalog view UUID
- `AC-Source-Locale`: e.g., `en-US`, `fr-CA`
- `AC-Price-Book-ID`: optional

**Catalog views must be created in ACO admin UI — no provisioning API exists.**

### API Mesh and Multi-Locale

One mesh handles multiple store views. For PaaS, the mesh forwards `Magento-Store-View-Code` dynamically instead of hardcoding it. For ACO, it forwards `AC-View-ID` and `AC-Source-Locale`. A single mesh deployment serves all locale paths — no per-locale mesh deployment needed.

---

## Current Codebase — Single-Env Assumptions

Every major structure assumes one active store scope. Key fields:

| Location | Field(s) | Assumption |
|---|---|---|
| `Project.adobe` | `organization`, `projectId`, `workspace` | One Adobe I/O workspace |
| `Project.commerce` | `instance.url`, `storeView`, `storeCode`, `websiteCode` | One store view |
| `Project.meshState` | `endpoint`, `envVars` | One mesh, one endpoint |
| `Project.componentInstances[EDS_STOREFRONT].metadata` | `githubRepo`, `daLiveOrg`, `daLiveSite` | One GitHub repo, one DA.live site |
| `EDSConfig` (wizard) | `daLiveOrg`, `daLiveSite`, `storeViewCode` | One per field |
| `WizardCommerceConfig` | `storeCode`, `storeView`, `url` | One store view chosen |
| `configGenerator.ts` params | `storeViewCode`, `storeCode`, `websiteCode` | One store scope per config.json |
| `SiteRegistrationParams` | `org`, `site`, `codeOwner`, `codeRepo` | One GitHub repo ↔ one DA.live site |
| `config-template.json` | `public.default` block | Single environment block only |
| `demo-packages.json configDefaults` | `ADOBE_COMMERCE_STORE_VIEW_CODE`, etc. | One default per brand |

The deepest seam is `Project.adobe.workspace` (scalar) + `Project.componentInstances[EDS_STOREFRONT].metadata` (one DA.live site tuple). `configGenerator.ts` produces one `config.json` with one store header set — this is the primary output that must become multi-locale.

---

## Proposed Phasing

### Phase 1 — Multi-Locale Single Storefront

**User value**: The wizard lets you select multiple store views. Demo Builder generates a `config.json` with per-locale path headers, creates locale folders in DA.live, configures PDP path mappings per locale in Config Service, and provisions store-switcher content in each locale folder.

**Demo Builder changes:**

1. **Wizard: multi-select store views** — the store view picker becomes a checkbox list. User picks one default + any additional locale views.
2. **Config generation** — `configGenerator.ts` gains `additionalLocales?: LocaleConfig[]`. Each locale produces a path-keyed block in `config.json`.
3. **Config Service: per-locale PDP folder mappings** — one POST per locale for `/en/products/` → `/en/products/default`.
4. **DA.live: locale folder creation** — create `/en/`, `/fr-ca/` etc. during content provisioning.
5. **Mesh config: dynamic header forwarding** — instead of hardcoding `Magento-Store-View-Code`, the mesh config uses dynamic context forwarding so all locale paths work through one mesh deployment.
6. **State shape** — `Project.commerce.instance` gains `additionalStoreViews?: StoreViewConfig[]` (additive, backward compatible).

**Effort**: Medium. Wizard change is the most visible; config generation and DA.live locale provisioning extend existing patterns.

---

### Phase 2 — Repoless Multi-Brand (additional EDS sites)

**User value**: After creating a primary project, the user adds a "second brand" that reuses the same GitHub repo, creates a new DA.live site, and registers it with Config Service. Each brand gets its own preview URL and independent content.

**Demo Builder changes:**

1. **Project state: `additionalSites` array** — alongside the primary `componentInstances[EDS_STOREFRONT]`, a new `additionalSites: Array<{ daLiveOrg, daLiveSite, siteName }>`.
2. **Provisioning loop** — setup phases 2/3 loop over additional sites: DA.live site creation + Config Service registration pointing to the same GitHub repo.
3. **Dashboard: multi-site panel** — shows each registered EDS site with preview URL and content link.
4. **Reset: multi-site aware** — reset iterates over all registered sites.

**Effort**: Large. State migration and dashboard changes are the biggest lift.

---

### Not in Scope (Confirmed)

- Creating Commerce store views via REST API (GET-only)
- Creating ACO catalog views (UI-only in ACO admin)
- Commerce backend tenant provisioning (Tier E per production-readiness roadmap)
- Multiple GitHub repos per project (Repoless eliminates this need)

---

## Open Scope Questions (Resolved Separately)

These questions were presented to the user for answers before implementation planning:

1. **Store view selection UX** — wizard at creation time vs. add later from project dashboard
2. **PaaS vs ACO locale config for Phase 1** — PaaS only (simpler) vs. both (ACO requires user to paste `AC-View-ID` UUIDs from the ACO admin)
3. **DA.live locale folder content** — empty folders, copy default locale content, or copy-and-placeholder translated content
4. **Store-switcher block provisioning** — Demo Builder responsibility vs. template already ships it

---

## References

### Official Documentation
- [AEM EDS Repoless pattern](https://www.aem.live/docs/repoless)
- [Repoless multisite manager](https://www.aem.live/developer/repoless-multisite-manager)
- [AEM Config Service setup](https://www.aem.live/docs/config-service-setup)
- [EDS translation and localization](https://www.aem.live/docs/translation-and-localization)
- [Future-proof multilingual EDS](https://www.aem.live/blog/future-proof-multilingual-website-edge-ensemble)
- [DA.live FAQ](https://docs.da.live/about/faq)
- [Commerce storefront multistore setup](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/multistore-setup/)
- [Commerce storefront configuration reference](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/commerce-configuration/)
- [Commerce localization tasks](https://experienceleague.adobe.com/developer/commerce/storefront/merchants/quick-start/content-localization-commerce-tasks/)
- [ACO catalog view](https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/catalog-view)
- [ACO Connector overview](https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/overview)
- [Commerce GraphQL headers](https://developer.adobe.com/commerce/webapi/graphql/usage/headers/)
- [ACCS API Mesh best practices](https://developer.adobe.com/graphql-mesh-gateway/mesh/best-practices/commerce-cloud-service/)
- [Commerce multiple websites overview](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/multi-sites/ms-overview)
