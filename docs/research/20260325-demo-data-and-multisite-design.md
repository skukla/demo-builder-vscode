# Demo Data & Multi-Site Feature Design Research

**Date**: 2026-03-25 (updated with repoless/multi-site findings)
**Status**: Research complete, design phase
**Author**: Steve Kukla + Claude

---

## Table of Contents

1. [Feature Vision](#1-feature-vision)
2. [Current Wizard Flow](#2-current-wizard-flow)
3. [Commerce Multi-Site Architecture](#3-commerce-multi-site-architecture)
4. [EDS/DA.live Multi-Site Patterns](#4-edsdalive-multi-site-patterns)
5. [Data Pack Integration](#5-data-pack-integration)
6. [Content as Reusable Data Entity](#6-content-as-reusable-data-entity)
7. [Gap Analysis](#7-gap-analysis)
8. [Design Synthesis](#8-design-synthesis)
9. [Confirmed Constraints](#9-confirmed-constraints)
10. [Open Questions](#10-open-questions)
11. [Sources](#11-sources)

---

## 1. Feature Vision

Three interconnected capabilities that combine into a "Demo Data" wizard step:

1. **Commerce Data Packs** — Choose which data pack to install in a Commerce backend (ACCS first, then PaaS)
2. **Content Data** — Choose which content to install into the DA.live site (content as a reusable, versioned, shareable entity)
3. **Multi-Site Experience** — Configure multi-geography and/or multi-brand storefronts with proper website/store/store view hierarchy, then manage that multi-site deployment through resets, edits, and deletion

---

## 2. Current Wizard Flow

### Step Sequence (from wizard-steps.json)

| # | Step ID | Name | Condition |
|---|---------|------|-----------|
| 1 | `welcome` | Demo Setup | Always |
| 2 | `component-selection` | Component Selection | No stack selected |
| 3 | `prerequisites` | Prerequisites | Always |
| 4 | `adobe-auth` | Adobe Authentication | `requiresMesh: true` |
| 5 | `adobe-project` | I/O Project Selection | `requiresMesh: true` |
| 6 | `adobe-workspace` | Workspace Selection | `requiresMesh: true` |
| 7 | `eds-connect-services` | Connect Services | EDS stacks |
| 8 | `eds-repository-config` | Repository Configuration | EDS stacks |
| 9 | `eds-data-source` | Content Configuration | EDS stacks |
| 7 | `settings` | Connect Commerce | Always (unconditional, repositioned after adobe-workspace) |
| 11 | `review` | Final Review | Always |
| 12 | `storefront-setup` | Publish Storefront | EDS stacks |
| 13 | `create-project` | Create Project | Always |

### Key Architectural Patterns

- **Config-driven steps**: Steps defined in JSON, not hardcoded
- **Conditional filtering**: Steps shown/hidden based on stack selection, mesh inclusion, wizard mode
- **Reactive step list**: `WIZARD_STEPS` is a `useMemo` that recomputes on state changes
- **ArchitectureModal**: Multi-step modal pattern within WelcomeStep (stack selection + block library selection)
- **Backend Call on Continue**: UI updates immediate, backend calls deferred to Continue click
- **Three wizard modes**: create, edit, import

### Natural Insertion Points for New Steps

- **Between `eds-data-source` and `review`**: For additional EDS/data configuration
- **Between ArchitectureModal steps**: New modal steps can be added to the computed step sequence
- **New condition types available**: `stackRequires`, `stackRequiresAny`, `requiresMesh`, `showWhenNoStack`, `createModeOnly`

### WizardState Key Fields

```typescript
WizardState {
  selectedPackage?: string           // Demo package ID
  selectedStack?: string             // Stack ID (eds-accs, eds-paas, etc.)
  selectedOptionalDependencies?: string[]  // Mesh, etc.
  componentConfigs?: ComponentConfigs      // Per-component env vars
  edsConfig?: EDSConfig                    // GitHub, DA.live, template source
  // ... plus auth state, caches, creation progress
}
```

---

## 3. Commerce Multi-Site Architecture

### The Three-Level Hierarchy

| Level | Owns / Controls | Key Identifiers |
|-------|----------------|-----------------|
| **Website** | Payment, shipping, base currency, tax, pricing scope, inventory stock, customer accounts | Unique `code` |
| **Store (Group)** | Root category (main menu/catalog), catalog price rules | Unique `code`, belongs to one Website |
| **Store View** | Language/locale, translations, currency display, content presentation | Unique `code`, belongs to one Store |

**Critical rule**: Configuration scope inherits downward (Global → Website → Store → Store View) with overrides at each level.

### Multi-Geography Pattern (Recommended)

**One Website per country/region.** Store Views for languages within each region.

```
Installation (Global)
├── US Website (code: us_website)
│   ├── US Store (root_category: "US Catalog")
│   │   └── US English (code: us_en)
│   ├── Base currency: USD
│   ├── Tax: US tax rules
│   └── Stock: US Warehouse Stock
│
└── EU Website (code: eu_website)
    ├── EU Store (root_category: "EU Catalog")
    │   ├── EU English (code: eu_en)
    │   ├── EU French (code: eu_fr)
    │   └── EU German (code: eu_de)
    ├── Base currency: EUR
    ├── Tax: EU VAT rules (inclusive)
    └── Stock: EU Warehouse Stock
```

**Why Websites, not Store Views, for countries**: Websites are the only level that isolates pricing scope, tax rules, payment methods, shipping methods, and inventory stocks. Using Store Views alone for country separation creates compliance exposure.

### Multi-Brand Pattern

**Separate Websites per brand** for full independence (recommended for demos):
- Independent carts, payment, shipping
- Independent customer accounts
- Separate pricing and promotions
- Different catalog structures via separate root categories

**Separate Stores under one Website** (lighter-weight):
- Shared checkout and payment
- Different catalogs via different root categories
- Best when brands share logistics

### B2B + B2C Combined

Two Websites under one installation:
- B2C Website: standard catalog, consumer pricing
- B2B Website: shared catalogs, tiered pricing, company accounts, quick order, negotiable quotes

### REST API for Store Management

All endpoints require admin Bearer token authentication.

| Entity | POST (Create) | GET (Read) | PUT (Update) |
|--------|--------------|-----------|-------------|
| Websites | `/V1/store/websites` | `/V1/store/websites`, `/V1/store/websites/{id}` | `/V1/store/websites/{id}` |
| Store Groups | `/V1/store/storeGroups` | `/V1/store/storeGroups`, `/V1/store/storeGroups/{id}` | `/V1/store/storeGroups/{id}` |
| Store Views | `/V1/store/storeViews` | `/V1/store/storeViews`, `/V1/store/storeViews/{id}` | `/V1/store/storeViews/{id}` |
| Store Configs | — | `/V1/store/storeConfigs` | — |

**ACCS note**: URL format differs (no `/rest` prefix). Write API availability for store entities on ACCS needs verification.

### Creation Sequence (Top-Down)

1. Root categories (required for Store Group assignment)
2. Websites via POST `/V1/store/websites`
3. Store Groups via POST `/V1/store/storeGroups` (references Website ID + root category ID)
4. Store Views via POST `/V1/store/storeViews` (references Store Group ID)
5. Scope-specific configuration (currency, tax, base URLs) per Website/Store View

### Recommended Demo Configurations

| Demo | Websites | Stores | Store Views | Demo Value |
|------|----------|--------|-------------|------------|
| **US + EU Multi-Geo** | 2 (us, eu) | 2 | 4 (us_en, eu_en, eu_fr, eu_de) | Geographic isolation, multi-currency, multi-tax |
| **Multi-Brand** | 2 (brand_a, brand_b) | 2 | 2 | Brand independence, separate catalogs |
| **B2B + B2C** | 2 (b2c, b2b) | 2 | 2 | Full B2B module showcase |
| **Combined Multi-Geo + Multi-Brand** | 4 (brand_a_us, brand_a_eu, brand_b_us, brand_b_eu) | 4 | 6+ | Enterprise showcase |

---

## 4. EDS/DA.live Multi-Site Patterns

### Current Implementation (Single-Site)

The Demo Builder treats each project as an **isolated, single-site entity**:

- `fstabGenerator.ts`: Generates fstab.yaml with a single root mountpoint (`/`) pointing to one DA.live org/site
- `configurationService.ts`: Registers one site with Configuration Service (1:1 repo-to-site mapping)
- `edsPipeline.ts`: Accepts a single `contentSource: { org, site }` per pipeline run
- `daLiveContentOperations.ts`: Copies all pages from one source to one target (no locale filtering)
- `edsResetService.ts`: Resets one repo + one DA.live site + one Configuration Service entry
- `cleanupService.ts`: Cleans up one GitHub repo + one DA.live site per project
- `demo-packages.json`: Each storefront has exactly one `contentSource`

### EDS Multi-Site Patterns (from Research)

#### Pattern A: Subfolder-Based (Single Site)

Content organized as `/en/`, `/de/`, `/fr/` within a single DA.live site:
- Single GitHub repo, single Configuration Service entry
- Shared nav/footer with locale-specific placeholders
- Simpler setup, best for few locales
- Fstab.yaml still uses single root mountpoint

#### Pattern B: Repoless (Separate Sites per Locale)

Each locale gets its own DA.live site and Configuration Service entry:
- All share the same GitHub repo ("repoless" pattern)
- One canonical site's org/site must match the GitHub owner/repo
- Additional sites reference the same code via Configuration Service
- Independent content management per locale

Configuration Service API for repoless:
```json
POST https://admin.hlx.page/config/{org}/sites/{site}.json
{
    "code": { "owner": "acme", "repo": "boilerplate" },
    "content": { "source": { "url": "https://content.da.live/acme/website-en/", "type": "markup" } }
}
```

#### Content Sharing

- No built-in content inheritance in DA.live
- Shared fragments (nav, footer) must be copied or referenced via URL
- Placeholder spreadsheets are per-language (stored in each locale folder)
- `helix-sitemap.yaml` generates locale-specific sitemaps with hreflang

#### Configuration Service Hierarchy

- **Organization level**: Shared settings across all sites
- **Profile level**: Reusable configuration groups (headers, indexes, metadata)
- **Site level**: Site-specific overrides

### Gap Analysis: Current vs Multi-Site

| Aspect | Current | Multi-Site Requirement | Gap |
|--------|---------|----------------------|-----|
| Content source model | Single `contentSource` per storefront | Multiple content sources (per locale/brand) | HIGH |
| Fstab generation | Single root mountpoint (`/`) | Subfolder mountpoints or repoless (no fstab) | HIGH |
| Configuration Service | 1:1 repo-to-site mapping | 1:N repo-to-sites (repoless) with profiles | HIGH |
| Content copy pipeline | All pages from one source to one target | Selective copy by locale, or multi-target | MEDIUM |
| Permissions | Org-level with per-site paths | Already compatible | LOW |
| Cleanup/reset | Single site per project | Must handle multiple sites per project | MEDIUM |
| demo-packages.json | One `contentSource` per storefront | Array of content sources or locale map | HIGH |
| Folder mapping | Only `/products/ -> /products/default` | Locale-prefixed folder mappings | MEDIUM |
| Shared content (nav/footer) | No concept of shared fragments | Central nav/footer with locale fallback | MEDIUM |

---

## 5. Data Pack Integration

### What the Data Installer API Does

The `data-installer-api-b2b` is an Adobe App Builder serverless API that provides a **configuration-driven ETL pipeline** for Adobe Commerce data. It:

1. Loads JSON "datapacks" from MongoDB (or direct payloads)
2. Transforms them using a substitution system (symbolic names → instance-specific IDs)
3. Imports/exports/deletes entities via Commerce REST and GraphQL APIs

### Supported Data Types

**Core Commerce**: products, categories, product attributes, attribute sets, customer groups, customers, cart rules, coupons, gift cards, inventory (stocks, sources, source items, stock-source links)

**B2B-specific**: shared catalogs, shared catalog company/category/product assignments, B2B companies

### Integration Surface

| API | Purpose | For Demo Builder |
|-----|---------|-----------------|
| `POST /process-datapack` | Sync processing (up to 5min) | Quick data installs |
| `POST /process-datapack-async` | Async with polling (up to 3hrs) | Large data installs |
| `GET /process-datapack-status/:id` | Poll async job | Progress tracking |
| `GET /find-datapacks` | List available datapacks | Datapack selection UI |
| `POST /get-websites-and-stores` | Get Commerce store structure | Multi-site config UI |
| `GET /get-processor-order` | Processing order | Data type selection UI |
| `GET /health-check` | Connectivity test | Pre-flight check |

### Authentication Requirements

Two-tier:
1. **API-level**: Adobe IMS Bearer token (extension already has this)
2. **Commerce-level**: `client_id`/`client_secret` or `admin_username`/`admin_password` per request

### Key Parameters for Integration

| Parameter | Source in Demo Builder |
|-----------|----------------------|
| API endpoint URL | Deployed App Builder action URL (new config) |
| IMS Bearer token | Existing `adobeAuthManager` |
| Commerce `base_url` | ACCS instance URL (new: needs to be tracked) |
| Commerce credentials | Adobe I/O project credentials (existing) |
| `datapack_name` | Demo package definition (new mapping) |
| `operation_mode` | `import` / `delete` |
| Session variables | `session_store_code`, `session_website_code`, etc. |

### Multi-Site Relevance

The Data Installer already supports session variables like `session_store_code` and `session_website_code` for targeting specific stores. For multi-site demos, the installer would be invoked multiple times with different session contexts — once per store view that needs data.

The creation of websites/stores/store views themselves could either:
- Be handled by the Data Installer (it already supports the REST APIs)
- Be handled directly by the Demo Builder extension (new service)
- Be defined as a special "store-structure" data type in a datapack

---

## 6. Content as Reusable Data Entity

### Concept

Content (DA.live pages, media, navigation, etc.) becomes a first-class, reusable entity — similar to how datapacks work for Commerce data. Content packs would be:

- **Saveable**: Export/snapshot content from an existing site
- **Versioned**: Track changes over time
- **Shareable**: Use the same content across multiple projects
- **Composable**: Mix and match content sets (e.g., Isle5 product pages + custom hero pages)

### Current Content Model

Today, content is defined per demo package storefront as a `contentSource`:
```json
"contentSource": {
    "org": "demo-system-stores",
    "site": "accs-citisignal"
}
```

Content is copied wholesale from source to target during storefront setup. No selection, no versioning, no composition.

### Proposed Content Pack Model

```
Content Pack {
  name: "CitiSignal Base Content"
  version: "1.0"
  source: { org: "demo-system-stores", site: "accs-citisignal" }
  contentTypes: [
    { type: "pages", paths: ["/", "/about", "/contact"] },
    { type: "products", paths: ["/products/*"] },
    { type: "navigation", paths: ["/nav", "/footer"] },
    { type: "media", paths: ["/media/*"] }
  ]
  locales: {
    "en": { ... },     // Base content
    "de": { ... },     // German variant
    "fr": { ... }      // French variant
  }
  patches: [...]       // Content modifications
  placeholders: {      // Locale-specific placeholders
    "en": { ... },
    "de": { ... }
  }
}
```

### Relationship to Multi-Site

Content packs would map to EDS sites in the multi-site architecture:
- **Single-site**: One content pack → one DA.live site
- **Multi-locale (subfolder)**: One content pack with locale variants → one DA.live site with `/en/`, `/de/` subfolders
- **Multi-locale (repoless)**: Multiple content packs → multiple DA.live sites sharing one repo

### Storage Options

Content pack definitions could live:
1. **In demo-packages.json** (simplest, current pattern extended)
2. **In a separate content-packs.json** (more flexible, decoupled from packages)
3. **In the Data Installer MongoDB** (shared infrastructure, enables user-created packs)
4. **In a dedicated Content Service** (future, most flexible)

---

## 7. Gap Analysis: Single-Site Assumptions Audit

A full codebase audit found **13 locations** where the code assumes one DA.live site per project. The assumption is systemic — it runs from the type definitions through the setup pipeline to project persistence.

### Layer 1: Data Model (HIGH — Must Change First)

| Location | File | What's Hardcoded |
|----------|------|-------------------|
| `WizardState` | `src/types/webview.ts:383-393` | `daLiveOrg?: string`, `daLiveSite?: string`, `selectedSite?: DaLiveSiteItem` — all scalars |
| `EDSConfig` | `src/types/webview.ts:349-445` | Single `daLiveOrg`, `daLiveSite`, `contentSource` — entire payload shape assumes one site |
| `SettingsEdsConfig` | `src/features/projects-dashboard/types/settingsFile.ts:61-72` | Single `daLiveOrg`, `daLiveSite` persisted to disk |
| Component metadata | `edsResetService.ts:126-127` | `metadata.daLiveOrg`, `metadata.daLiveSite` — component instance stores one site |

**These are the schema-level blockers.** Nothing else can change until the data model supports multiple sites.

### Layer 2: Setup Pipeline (HIGH — Must Loop Over Sites)

| Location | File | What's Hardcoded |
|----------|------|-------------------|
| `StorefrontSetupStartPayload` | `storefrontSetupHandlers.ts:51-133` | Payload carries single `daLiveOrg`, `daLiveSite` — UI can only send one |
| `StorefrontSetupPhases` | `storefrontSetupPhases.ts:200+` | Phases call `buildSiteConfigParams()` with single org/site — no loop |
| `ProjectCreationConfig.edsConfig` | `executor.ts:161-196` | Config shape forces single site through all 5 phases |

**The pipeline is linear.** Phases 2-5 (site-config, content, block-library, publish) would need to run once per site.

### Layer 3: Lifecycle (MEDIUM — Must Iterate)

| Location | File | What's Hardcoded |
|----------|------|-------------------|
| `EdsResetParams` | `edsResetService.ts:41-71` | Single `daLiveOrg`, `daLiveSite` — reset one site only |
| `CleanupService.cleanupDaLive` | `cleanupService.ts:196-200` | Cleans up one site — extra sites orphaned |
| `ProjectDeletionService` | `projectDeletionService.ts:57-183` | Extracts single site from metadata — extra sites orphaned on delete |

### Layer 4: Config Generation (MEDIUM — Per-Site Config)

| Location | File | What's Hardcoded |
|----------|------|-------------------|
| `ConfigGeneratorParams` | `configGenerator.ts:47-80` | Single `daLiveOrg`, `daLiveSite` — config.json for one site |
| `buildSiteConfigParams` | `configurationService.ts:66-74` | Builds one content source URL — registers one site |

### What's Already Multi-Site Ready (GREEN)

| Component | Why It Works |
|-----------|-------------|
| `DaLiveContentOperations` | Methods accept org/site as parameters — caller just needs to pass different values |
| `HelixService` | API key cache is keyed by `org/site` — naturally supports multiple sites |
| `DA.live permissions` | Org-level with path patterns (`/{site}/+**`) — just add more rows |
| `DA.live auth` | Token is per-org, not per-site — one auth covers all sites in an org |
| `ConfigurationService API` | PUT endpoint accepts any org/site — calling it N times creates N registrations |
| `cleanupDaLiveSites handler` | Already does batch site operations (prefix matching) |

### Refactor Pattern Summary

The refactor follows three patterns:

**Pattern 1: Scalar → Array/Map** (data model)
```
Before: daLiveSite: string
After:  sites: Array<{ siteId: string, daLiveSite: string, role: 'canonical' | 'repoless', locales?: string[] }>
```

**Pattern 2: Linear → Loop** (setup pipeline)
```
Before: phase_siteConfig(site) → phase_content(site) → phase_publish(site)
After:  for each site: phase_siteConfig(site) → phase_content(site) → phase_publish(site)
```

**Pattern 3: Single Metadata → Site Array** (persistence)
```
Before: metadata: { daLiveOrg, daLiveSite }
After:  metadata: { daLiveOrg, sites: [{ name, role, locales }] }
```

### Gap Summary Table

| Gap | Severity | Touches |
|-----|----------|---------|
| Data model locked to single site | **HIGH** | webview.ts, settingsFile.ts, component metadata |
| Setup pipeline linear (no site loop) | **HIGH** | storefrontSetupPhases.ts, storefrontSetupHandlers.ts, executor.ts |
| No repoless site registration | **HIGH** | configurationService.ts |
| No Commerce store structure discovery | **HIGH** | New service needed |
| No datapack integration | **HIGH** | New feature module (pending deployment research) |
| No Commerce instance URL tracking | **HIGH** | WizardState, project config |
| Reset/cleanup single-site only | **MEDIUM** | edsResetService.ts, cleanupService.ts, projectDeletionService.ts |
| Config.json single-site format | **MEDIUM** | configGenerator.ts (needs `multistore` section) |
| No locale-aware content copy | **MEDIUM** | daLiveContentOperations.ts |
| Content not versioned/composable | **MEDIUM** | New concept (extend demo-packages.json) |
| Permissions already compatible | **LOW** | daLiveConfigService.ts |
| Content patching not locale-aware | **LOW** | contentPatchRegistry.ts |

---

## 8. Wizard Step Audit for Multi-Site

### Step-by-Step Impact Assessment

| # | Step | Scope | Multi-Site Impact | Severity |
|---|------|-------|-------------------|----------|
| 1 | Welcome (package/stack) | Project | None — package, stack, addons, block libs are project-wide | **NONE** |
| 2 | ArchitectureModal | Project | None — stack, mesh, block libs are project-wide | **NONE** |
| 3 | Prerequisites | Machine | None — tools are machine-global | **NONE** |
| 4 | Adobe Auth | Project | None — one Adobe org per project | **NONE** |
| 5 | Adobe Project/Workspace | Project | None — one I/O project per project | **NONE** |
| 6 | Connect Services | Project | None — one GitHub user + one DA.live org per project | **NONE** |
| 7 | ~~GitHub Repo Selection~~ | ~~Project~~ | **REMOVED** — merged into Storefront Configuration | **REPLACED** |
| 8 | ~~DA.live Site Config~~ | ~~Site~~ | **REMOVED** — merged into Storefront Configuration | **REPLACED** |
| 5* | **Storefront Configuration** (NEW, merged) | Mixed | One name → repo + canonical site. [+ Add Storefront] for repoless. Content source per site. Create new or select existing. | **NEW** |
| 9 | Settings/Component Config | Mixed | **Per-site store codes** — ACCS host is project-wide, but store view code, store code, website code are per-site | **HIGH** |
| 10 | Review | Mixed | **Show all sites** — needs storefront table showing sites, store codes, content sources | **HIGH** |
| 11 | Storefront Setup | **Site** | **Loop over sites** — repo creation once, then per-site: config registration, content copy, publish | **HIGH** |
| 12 | Project Creation | Project | **Minor** — generate per-site config alongside .env | **MEDIUM** |

### What's New: Steps That Don't Exist Yet

| New Step/Feature | Where It Goes | Purpose |
|-----------------|---------------|---------|
| **Store Structure** (discovery & mapping) | After DA.live Site Config, before Settings | Fetch Commerce store structure, map store views to EDS sites/locales |
| **Commerce Data** (datapack selection) | After Store Structure, before Review | Select datapacks per store context (pending Data Installer research) |
| **Multi-site toggle** | In DA.live Site Config or ArchitectureModal | User opts in to multi-site; without it, current single-site flow unchanged |

### Proposed Wizard Flow

```
1.  Welcome (package, stack)                           ← unchanged
2.  Prerequisites                                       ← unchanged
3.  [Adobe Auth / Project / Workspace]                  ← unchanged (if mesh)
4.  Connect Services (GitHub + DA.live auth)             ← unchanged
5.  ★ Storefront Configuration (MERGED)                  ← repo + sites in one step
6.  ★ Store Structure (NEW, conditional)                 ← fetch Commerce stores, map to sites
7.  ★ Commerce Data (NEW, future, conditional)           ← datapack selection per store
8.  Settings                                             ← per-site store codes added
9.  Review                                               ← shows storefront table
10. Storefront Setup                                     ← loops over sites
11. Create Project                                       ← generates per-site config
```

**Step 5 replaces both GitHub Repo Selection (old step 8) and DA.live Site Config (old step 9).** User gives one name → repo + canonical site created. Additional repoless sites added via [+ Add Storefront].

**Step 6 (Store Structure)** shown when: Commerce backend is configured AND user has added 1+ sites. Skippable for single-site with one store view.

**Step 7 (Commerce Data)** shown when: Data Installer API is available. Future phase — blocked on deployment research.

**For single-site projects**: Step 5 is one name + one content source (simpler than today's two separate steps). Steps 6-7 auto-skip. Net result: fewer steps than current flow.

### Cleanup, Reset, and Deletion for Multi-Site Projects

**Current lifecycle** (single-site):
- **Reset**: Clear DA.live content, re-copy from source, re-register Config Service, republish
- **Delete**: Delete GitHub repo + delete DA.live site + delete Config Service entry
- **Cleanup**: Same as delete but user chooses what to clean up

**Multi-site lifecycle** (proposed):

| Operation | Scope | What Changes |
|-----------|-------|-------------|
| **Reset ALL** | Entire project | Loop over all sites: clear each DA.live site, re-copy content, re-register each Config Service entry, republish all |
| **Reset ONE site** | Single site | Clear that site's DA.live content, re-copy, re-register, republish. Other sites untouched |
| **Delete project** | Entire project | Delete GitHub repo (once), delete ALL DA.live sites (loop), delete ALL Config Service entries (loop) |
| **Remove a site** | Single site | Delete that site's DA.live content, delete its Config Service entry. Repo and other sites untouched |
| **Add a site** | Single site | Create DA.live site, register with Config Service (repoless, pointing to existing repo), copy content, publish |

**State tracking**: Each site needs its own partial state for error recovery:
```typescript
interface SitePartialState {
  siteId: string;
  configRegistered: boolean;
  contentCopied: boolean;
  published: boolean;
  error?: string;
}
```

**Dashboard changes**: The project dashboard currently shows one DA.live URL. Multi-site would show a site list with status indicators:
```
My Demo Project
├── main-site (canonical) — ✓ published — main--my-demo--skukla.aem.live
├── brand-b (repoless)   — ✓ published — main--brand-b--skukla.aem.live
└── brand-c (repoless)   — ⚠ content pending
```

---

## 8b. Post-Creation UX Audit for Multi-Site

### Impact Assessment

| Feature | Current UX | Multi-Site Change | Severity |
|---------|-----------|-------------------|----------|
| **Project Dashboard (detail)** | Single "Open Live Site" / "Open DA.live" buttons, single storefront status | Site picker or tabs; per-site status indicators; actions scoped to selected site | **HIGH** |
| **Configure UI** | Project-level env vars, single `.env` | Site selector at top; per-site store codes; save/republish scoped to one site | **HIGH** |
| **Projects Dashboard (cards)** | One status badge per card, single "Open" actions | Site count badge; aggregate status ("2 published, 1 stale"); card-level actions become ambiguous | **HIGH** |
| **Staleness Detection** | Single `edsStorefrontState` baseline per project | Per-site baseline array; per-site staleness; scoped republish prompt | **HIGH** |
| **Reset UI** | "Reset project?" confirmation, single site progress | "Reset all sites or just one?" choice; per-site progress messages | **MEDIUM** |
| **Project Deletion** | Checkbox for "Delete DA.live site?" (singular) | Checkbox list of all sites; per-site delete/keep choice; GitHub repo still singular | **MEDIUM** |
| **Edit Mode** | Project-level editing in wizard | Can't edit site-specific settings; needs site-scoped edit flow or separate "Manage Sites" | **MEDIUM** |
| **Reset Service** | Single-site orchestration | Per-site execution loop; site identifier in progress callbacks | **MEDIUM** |
| **Sidebar** | Project-level navigation (Overview, Configure, Updates) | Could add site context indicator or "Manage Sites" nav item | **LOW** |
| **Manage DA.live Sites** | Org-level batch cleanup | Show project linkage per site ("site X → project Y") | **LOW** |
| **Manage GitHub Repos** | Repo-level management | Show site count in linkage display | **LOW** |
| **Update System** | Project/component-level updates | No change needed | **NONE** |

### Key Post-Creation Design Decisions

**Decision 1: Site Scoping Pattern** — How does the user indicate which site they're working with?

| Option | Where | UX Pattern |
|--------|-------|-----------|
| **Site picker dropdown** | Top of Dashboard + Configure screens | Persistent dropdown showing current site, changes scope of entire view |
| **Site tabs** | Within Dashboard + Configure | Tab per site, visible at all times |
| **Site list with expand** | Projects Dashboard card | Click to expand, show per-site actions |

Recommendation: **Site picker dropdown** (top of detail views) + **site count badge** (on project cards). Tabs don't scale well past 3-4 sites.

**Decision 2: Reset Granularity**

| Scenario | UX |
|----------|-----|
| User has 1 site | Current experience, no change |
| User has N sites, wants to reset one | Picker: "Which site to reset?" → reset only that site |
| User has N sites, wants to reset all | "Reset All Sites" option → sequential reset with per-site progress |

**Decision 3: Configure Scope**

| Setting Type | Scope | Where Stored | Example |
|-------------|-------|-------------|---------|
| Commerce backend URL | Project | `.env` | `ACCS_GRAPHQL_ENDPOINT` |
| Customer group | Project | `.env` | `ACCS_CUSTOMER_GROUP` |
| API Mesh endpoint | Project | `.env` | `MESH_ENDPOINT` |
| Store view code | **Site** | `config.json` per site | `commerce-store-view-code` |
| Store code | **Site** | `config.json` per site | `commerce-store-code` |
| Website code | **Site** | `config.json` per site | `commerce-website-code` |

Configure UI shows project-level settings by default. When a site is selected via the dropdown, site-specific settings appear below.

**Decision 4: Adding/Removing Sites Post-Creation**

| Operation | Entry Point | Flow |
|-----------|------------|------|
| **Add a site** | Dashboard → "Add Site" button (or site picker → "+ New") | Mini-wizard: name site, select content source, map store codes → register + copy + publish |
| **Remove a site** | Dashboard → site picker → kebab → "Remove Site" | Confirm → delete DA.live content + Config Service entry. Repo untouched |

### New UX Components Needed (Post-Creation)

1. **SitePicker** — Dropdown component showing all sites in project, with status indicators, used in Dashboard and Configure
2. **SiteStatusBadge** — Per-site status (Published/Stale/Pending) shown in Dashboard and Project Cards
3. **SiteManagementPanel** — List of sites with add/remove/reset actions, accessible from Dashboard
4. **PerSiteConfigEditor** — Configure UI section that changes based on selected site (store codes, etc.)
5. **MultiSiteResetDialog** — "Reset all" vs "Reset one" choice dialog
6. **MultiSiteDeleteDialog** — Per-site checkboxes during project deletion

---

## 8c. Complete Extension UX Surface & Feature Placement

### Current UX Surfaces (5 webviews + sidebar + commands)

```
┌─────────────────────────────────────────────────────────────────┐
│  ACTIVITY BAR                                                    │
│  └─ Adobe Icon → Sidebar                                        │
│     ├─ Projects context   → navigates to Projects Dashboard     │
│     ├─ Project context    → navigates to Project Dashboard      │
│     ├─ Wizard context     → shows step progress                 │
│     └─ Configure context  → navigates to Configure              │
├──────────────────────────────────────────────────────────────────┤
│  WEBVIEW SCREENS (main content area)                             │
│                                                                  │
│  1. PROJECTS DASHBOARD (home) ─────────────────────────────────  │
│     │  Card grid of all projects                                 │
│     │  Search/filter, + New button                               │
│     │  Empty state for first-time users                          │
│     │                                                            │
│     ├──→ 2. PROJECT DASHBOARD (detail) ────────────────────────  │
│     │       │  Project name, status, port                        │
│     │       │  Action buttons: Start/Stop, Browser, Configure    │
│     │       │  EDS: Open Live Site, Open DA.live                 │
│     │       │  Mesh status, Component Browser, Logs toggle       │
│     │       │                                                    │
│     │       ├──→ 3. CONFIGURE (settings editor) ──────────────── │
│     │       │       Per-component env vars                       │
│     │       │       Save → triggers staleness detection          │
│     │       │       Deploy → republish config.json               │
│     │       │                                                    │
│     │       ├──→ RESET (dialog + progress notification)          │
│     │       └──→ DELETE (QuickPick + cleanup choices)            │
│     │                                                            │
│     └──→ 4. WIZARD (multi-step creation) ──────────────────────  │
│             │  13 steps (conditionally filtered)                  │
│             │  3 modes: create, edit, import                      │
│             │  Timeline nav in sidebar                            │
│             │                                                     │
│             └──→ On completion → Project Dashboard               │
│                                                                  │
│  5. WELCOME (webview-ui/src/welcome/) — first-time onboarding    │
├──────────────────────────────────────────────────────────────────┤
│  COMMANDS (palette)                                              │
│  ├─ Create Project          (opens wizard)                       │
│  ├─ Check for Updates       (GitHub releases)                    │
│  ├─ DA.live Bookmarklet Setup (opens browser)                    │
│  ├─ Manage DA.live Sites    (batch site cleanup)                 │
│  ├─ Manage GitHub Repos     (batch repo cleanup)                 │
│  ├─ Set Recommended Zoom    (120%)                               │
│  ├─ Reset Zoom              (100%)                               │
│  ├─ Diagnostics             (system analysis)                    │
│  └─ Reset All (Dev Only)    (clear state)                        │
├──────────────────────────────────────────────────────────────────┤
│  SETTINGS (VS Code preferences)                                  │
│  ├─ General: port, autoUpdate, autoZoom, updateChannel, logLevel │
│  ├─ Block Libraries: defaults[], custom[]                        │
│  └─ DA.live: defaultOrg, aemAuthorUrl, IMSOrgId, editorPathPrefix│
├──────────────────────────────────────────────────────────────────┤
│  OUTPUT CHANNELS                                                 │
│  ├─ "Demo Builder: Logs"    (user-facing messages)               │
│  └─ "Demo Builder: Debug"   (technical diagnostics)              │
└──────────────────────────────────────────────────────────────────┘
```

### Where Every New Feature Lives

| New Feature | UX Surface | Placement | New or Modified? |
|------------|-----------|-----------|-----------------|
| **Storefront Configuration** (merged step) | Wizard → replaces GitHub Repo Selection + DA.live Site Config | One name → repo + canonical site. [+ Add Storefront] for repoless sites | **New step (replaces 2)** |
| **Store Structure discovery** | Wizard → NEW step after DA.live Sites | New step: fetch Commerce stores, map to sites | **New step** |
| **Commerce Data selection** | Wizard → NEW step after Store Structure | New step: datapack selection per store context | **New step** (future) |
| **Per-site store codes** | Wizard → Settings step | Tabbed or scoped view per site | Modified |
| **Multi-site review** | Wizard → Review step | Storefront table with all sites + mappings | Modified |
| **Multi-site setup execution** | Wizard → Storefront Setup step | Loop phases per site, per-site progress | Modified |
| **Per-site config generation** | Wizard → Project Creation step | Generate config.json per site + multistore section | Modified |
| **Site picker** | Project Dashboard (detail) | New dropdown at top of dashboard | **New component** |
| **Per-site status** | Project Dashboard (detail) | Status indicators per site | Modified |
| **Per-site actions** | Project Dashboard (detail) | Open Live/DA.live scoped to selected site | Modified |
| **Site management panel** | Project Dashboard (detail) | New panel: list sites, add/remove | **New panel** |
| **Per-site configure** | Configure webview | Site selector + scoped env vars | Modified |
| **Per-site staleness** | Configure webview (backend) | Baseline tracking per site | Modified (backend) |
| **Multi-site reset dialog** | Reset flow (dialog) | "Reset all vs one" choice | Modified |
| **Per-site reset** | Reset flow (service) | Scope reset to selected site | Modified |
| **Multi-site delete** | Delete flow (QuickPick) | Per-site cleanup checkboxes | Modified |
| **Add site post-creation** | Project Dashboard | "Add Site" action → mini-wizard | **New flow** |
| **Remove site** | Project Dashboard → Site Management | "Remove" action per site | **New flow** |
| **Site count on cards** | Projects Dashboard (home) | Badge/indicator on project cards | Modified |
| **Aggregate status** | Projects Dashboard (home) | Per-site status in card | Modified |
| **Content source per site** | Wizard → DA.live Site Config | Content source picker per added site | Modified |
| **Multi-locale config** | Wizard → Store Structure step | Locale subfolder mapping to store views | Part of new step |
| **Brand theming** | Wizard → DA.live Site Config or new step | Theme selection per brand site | TBD |
| **Manage multi-site command** | Commands palette | New command or extend existing | TBD |

### Feature Placement by UX Surface

**Projects Dashboard (home screen)** — 2 changes:
- Project cards show site count badge
- Card status aggregates per-site status

**Project Dashboard (detail)** — 5 changes + 2 new:
- NEW: Site picker dropdown (top of view)
- NEW: Site management panel (add/remove sites)
- Modified: Status display per site
- Modified: "Open Live Site" / "Open DA.live" scoped to selected site
- Modified: Reset action scoped or asks "which site?"
- Modified: Delete action shows per-site cleanup options
- Modified: Configure navigates with site context

**Configure webview** — 3 changes:
- Site selector at top
- Per-site env var scoping (store codes)
- Per-site staleness detection + scoped republish

**Wizard** — 5 modifications + 2 new steps:
- Modified: DA.live Site Config (multi-site selection)
- NEW: Store Structure step (Commerce discovery + mapping)
- NEW: Commerce Data step (datapack selection, future)
- Modified: Settings (per-site store codes)
- Modified: Review (storefront table)
- Modified: Storefront Setup (per-site loop)
- Modified: Project Creation (per-site config)

**Sidebar** — 1 change:
- Site context indicator (optional, low priority)

**Commands** — 1 potential new:
- "Manage Sites" or extend "Manage DA.live Sites" for project-scoped site management

**Settings** — 0 changes initially:
- Existing settings are project-level; per-site settings live in project config, not VS Code settings

### Uncaptured UX Areas — Now Resolved

**1. Store Structure Step (NEW) — Detailed UX:**

This step fetches the Commerce store hierarchy and lets the user map it to their EDS sites.

```
┌──────────────────────────────────────────────────────────────┐
│  Store Structure                                              │
│                                                               │
│  Commerce Backend: [auto-filled from ACCS settings]           │
│  Status: ✓ Connected (3 websites, 4 stores, 7 store views)   │
│                                                               │
│  ┌─ Commerce Structure ─────┐  ┌─ EDS Site Mapping ─────────┐│
│  │                           │  │                             ││
│  │ ▼ Main Website            │  │ my-demo (canonical)         ││
│  │   ▼ Main Store            │  │   / → default [drag here]  ││
│  │     ☐ default  ──────────────→   /fr/ → french            ││
│  │     ☐ french   ──────────────→                             ││
│  │                           │  │                             ││
│  │ ▼ EU Website              │  │ brand-eu (repoless)         ││
│  │   ▼ EU Store              │  │   / → eu_en [drag here]    ││
│  │     ☐ eu_en    ──────────────→   /de/ → eu_de             ││
│  │     ☐ eu_de    ──────────────→                             ││
│  │     ☐ eu_fr               │  │                             ││
│  │                           │  │                             ││
│  └───────────────────────────┘  └─────────────────────────────┘│
│                                                               │
│  Unmapped store views: eu_fr                                  │
│  ⚠ Unmapped views won't have EDS storefronts                  │
│                                                               │
│  [Skip — single site, no mapping needed]                      │
└──────────────────────────────────────────────────────────────┘
```

**When shown**: Only when Commerce backend is configured (ACCS/PaaS settings present) AND the user has added 1+ sites in DA.live Site Config step.

**When skipped**: Single-site projects with no multi-site needs. User clicks "Skip" or the step auto-advances if only one store view exists.

**What it produces**: A mapping from `storeViewCode → { edsSiteId, localePath }` that drives:
- config.json generation (per-site store codes)
- config.json `multistore` section (locale paths)
- Content copy targets (which content goes to which site/locale)

**2. Content Source Per Site — Detailed UX:**

In the DA.live Site Config step, when a user adds a site, they also choose a content source:

```
Add Site:
  Site Name: [brand-eu       ]
  Content:   [CitiSignal Content  ▼]    ← dropdown of available content sources
             [  CitiSignal Content    ]   from demo-packages.json
             [  Custom (empty site)   ]   + "empty" option (no content copy)
             [  Copy from: brand-a    ]   + copy from another site in this project
```

Content sources come from the selected demo package's `contentSource` definitions. "Custom" creates an empty DA.live site. "Copy from" duplicates another site's content (useful for locale variants of the same brand).

**3. Post-Creation "Add Site" Flow:**

From Project Dashboard → Site Management Panel → "Add Site":

```
Mini-wizard (modal, 3 steps):
  1. Name & create DA.live site (reuse existing create/select UX)
  2. Map store views (subset of Store Structure step)
  3. Content source selection + copy + publish

Progress shown inline in Site Management Panel.
```

This reuses the same components from the wizard but in a lighter modal context.

**4. Post-Creation "Remove Site" Flow:**

From Project Dashboard → Site Management Panel → site kebab → "Remove":

```
Confirmation dialog:
  "Remove site 'brand-eu' from this project?"

  This will:
  ☐ Delete DA.live content (brand-eu site)
  ☐ Remove Configuration Service entry

  The GitHub repository and other sites are not affected.

  [Remove]  [Cancel]
```

**5. Per-Site CSS Theming:**

For repoless multi-brand, the shared repo needs per-site CSS. Two approaches:

| Approach | Where in UX | Implementation |
|----------|------------|----------------|
| **Auto-generated from brand colors** | DA.live Site Config step → color picker per brand | Generate `styles/themes/{site}.css` with CSS variables |
| **Manual (user provides CSS)** | Configure webview → "Theme" tab per site | User edits CSS file, extension manages file placement |

Recommendation: Start with manual (lower scope), add auto-generation later. The extension creates the theme file structure in the repo; the user customizes content.

**6. Multi-Locale Content Authoring Post-Creation:**

After a multi-locale project is created, content editing happens in DA.live (not in the extension). The extension's role is:
- **Open DA.live** button scoped to site → opens `https://da.live/{org}/{site}` for the selected site
- **Content Refresh** (future) → re-copy content from source for a specific locale/site
- **Placeholder Management** → future feature for editing locale-specific placeholder spreadsheets

No new UX surfaces needed for this — it's handled by DA.live itself. The extension just needs correct URL routing.

---

## 8d. Project Dashboard & Configure Screen Audit

### Dashboard: What Works

| Feature | Why It's Useful |
|---------|----------------|
| Dual status badges (Frontend + Mesh) | Quick health glance without clicking into anything |
| Incognito browsing for EDS | Avoids cached cookies ruining demos |
| Smart button disabling | Prevents invalid state transitions |
| Background mesh verification | Catches externally-deleted mesh |
| Authentication recovery link | Re-auth without closing dashboard |
| Smart log toggle | Remembers last channel (Logs vs Debug) |

### Dashboard: What's Confusing

| Issue | Impact |
|-------|--------|
| EDS vs non-EDS buttons swap silently | Users switching between project types get disoriented — different buttons available with no explanation |
| "Configure" does two things | Edits env vars AND triggers republish/redeploy. Post-save prompts stack up confusingly |
| Mesh endpoint URL not visible | Users must open Configure just to see their mesh URL — should be on dashboard |
| EDS storefront status not shown on dashboard | Only "Frontend" badge shown. EDS staleness invisible until user opens Configure |
| Re-auth link too subtle | Small blue link when mesh needs auth — users miss it. Needs more prominent treatment |
| Components button behavior unclear | Toggles sidebar but no visual state change on the button itself |

### Dashboard: What's Missing

| Missing Feature | Impact |
|----------------|--------|
| **Mesh endpoint display** | Users can't see deployed URL without opening Configure |
| **EDS storefront status badge** | Staleness ("config changed") not visible on dashboard — only Frontend status shown |
| **Retry after failure** | No "Retry Deploy" button after mesh fails — must close/reopen |
| **Installed components list** | Only visible via Components file browser, not on main dashboard |
| **Adobe org/workspace context** | Users don't see which Adobe context they're in |
| **Quick edit for single values** | Must open full Configure screen to change one env var |
| **What changed indicator** | After config save, no diff showing what was modified |

### Configure Screen: What Works

| Feature | Why It's Useful |
|---------|----------------|
| Two-column layout (form + navigator) | Users see structure while editing; navigator shows completion progress |
| Auto-linking COMMERCE_URL → GRAPHQL | Derives GraphQL endpoint automatically, respects user override |
| Cross-component field sharing | Edit once, updates everywhere the env var is used |
| Contextual post-save notifications | "Redeploy mesh?" / "Republish?" based on what actually changed |
| Project renaming inline | No separate command needed |
| URL normalization on blur | Trailing slashes removed automatically |
| Section completion counts | "2/3 required fields filled" per section |

### Configure Screen: What's Confusing

| Issue | Impact |
|-------|--------|
| Field ownership hidden | User doesn't know which component each field belongs to |
| MESH_ENDPOINT appears editable but isn't | Read-only field with no visual indicator — users try to edit, nothing happens |
| Block library config is elsewhere | "Go to Extension Settings" link sends users out of Configure flow |
| Post-save notification cascade | 4 different scenarios (mesh, storefront, both, other) — easy to miss or dismiss wrong one |
| Validation only after touch | User can click Save with invalid fields they haven't visited — errors appear belatedly |
| URL normalization is silent | Input changes on blur with no explanation |
| Service group ordering is arbitrary | Hardcoded order doesn't match user mental model |

### Configure Screen: What's Missing

| Missing Feature | Impact |
|----------------|--------|
| **Field dependencies** | No "if you set A, you must set B" validation (e.g., catalog API key needs endpoint) |
| **Rollback / undo** | If mesh redeploy fails after save, no way to revert to last working config |
| **Comparison view** | "What changed since last save?" not available |
| **Copy config between projects** | Export/import config for reuse across projects |
| **Config profiles** | No dev/staging/prod switching |
| **Field search/filter** | 20+ fields, no search — must scroll or use navigator |
| **Batch edit** | Can't select multiple related fields to edit together |

### Staleness Detection: How It Works Today

**Mesh staleness**: Compares current env vars + source file hashes against `project.meshState`. Shows "Config Changed" on dashboard badge.

**Storefront staleness (EDS)**: Compares current env vars against `project.edsStorefrontState.envVars`. BUT this is **invisible on the dashboard** — only shows in Configure screen post-save flow. Gap: users don't know their storefront is stale unless they open Configure.

**Post-save flow**:
1. Backend detects which subsystems changed (mesh, storefront, or both)
2. Shows notification with "Redeploy?" / "Republish?" / "Apply?"
3. User can act now or click "Later" (records decline + timestamp)
4. Status stays "stale" until user acts

### Multi-Site Impact on These Screens

**Dashboard changes needed:**

| Current | Multi-Site |
|---------|-----------|
| One "Open Live Site" button | Site picker → opens selected site's URL |
| One "Open DA.live" button | Site picker → opens selected site's DA.live URL |
| One Frontend status badge | Per-site status or aggregate ("2 published, 1 stale") |
| No EDS storefront status | Per-site storefront status badges |
| One "Configure" action | Configure with site context (which site?) |
| One "Delete" action | Delete dialog shows per-site cleanup choices |
| No site management | NEW: Site management panel (add/remove/status per site) |

**Configure changes needed:**

| Current | Multi-Site |
|---------|-----------|
| All fields project-scoped | Site selector at top; store codes scoped per site |
| Single `.env` output | Per-site config section in config.json |
| Single staleness baseline | Per-site baselines |
| "Republish?" applies to one site | "Republish site X?" or "Republish all?" |
| No site comparison | "How does this site differ from Site 1?" |

### Existing Issues Worth Fixing (Independent of Multi-Site)

These are UX improvements that should be addressed regardless of multi-site:

| Issue | Priority | Effort |
|-------|----------|--------|
| Relabel "Frontend" badge to "Storefront" for EDS projects (storefront status already shown there, just mislabeled) | MEDIUM | LOW — badge exists, just needs label change |
| Show mesh endpoint URL on dashboard | MEDIUM | LOW — data available, just not rendered |
| Make MESH_ENDPOINT visually read-only | LOW | LOW — add `isReadOnly` prop + styling |
| Move block library config into Configure screen | MEDIUM | MEDIUM — restructure config sections |
| Show validation errors before save | MEDIUM | MEDIUM — validate all fields on mount |
| Add field search/filter to Configure | LOW | MEDIUM — search across field labels |
| Surface "config changed" notifications more prominently | MEDIUM | LOW — add inline indicator |

---

## 9. Design Synthesis

### Key Design Principles (from research + user feedback)

1. **Store structure is "discover and map", not "create"** — ACCS has no API for creating stores. The UX reads what exists in Commerce and lets the user map EDS sites to store views.
2. **Open-ended store structure builder** — Not just presets. Users need to add/remove websites, stores, store views and see what's already in the backend.
3. **Repoless for multi-brand, subfolders for multi-locale** — These are the only supported EDS patterns. The UX must make this distinction clear.
4. **Extend existing content model** — Content packs build on the current `contentSource` pattern in demo-packages.json rather than introducing a new storage system.

### Proposed UX Flow

A new "Demo Data" wizard step (or sub-step sequence) between `eds-data-source` (step 9) and `settings` (step 10).

#### Recommended: Modal-Based (ArchitectureModal Pattern)

Keep the timeline clean with a single "Demo Data" step. A multi-step modal handles complexity:

```
Welcome → Prerequisites → [Auth] → Connect Services → Repo Config → Content Config
  → ★ DEMO DATA (new step, opens modal) → Settings → Review → Setup → Create Project
```

**Modal Sub-Steps:**

**Step 1: Store Structure (Discover & Map)**
- Connect to Commerce backend (uses existing credentials or prompts for Commerce URL)
- Fetch existing websites/stores/store views via GET `/V1/store/websites`, `/V1/store/storeGroups`, `/V1/store/storeViews`
- Display current structure as an interactive tree
- User maps each store view to an EDS site (brand) + locale subfolder
- User can add placeholder entries for stores they plan to create in the backoffice
- Validation: warns if expected store views don't exist yet, with guidance

**Step 2: Content Selection (Per Site/Locale)**
- For each EDS site defined in Step 1, select a content source
- Content sources come from demo-packages.json (extended with locale variants)
- Shows which content packs are available per locale
- Preview of what content will be installed

**Step 3: Commerce Data (Per Store Context)**
- Select datapack(s) to install per store context
- Data types shown with dependencies (e.g., "products" requires "categories")
- Session variables auto-populated from Step 1 mapping (store codes, website codes)
- Estimated processing time shown

For **single-site projects** (no multi-site needed), the modal defaults to the current behavior: one site, one content source, one datapack. The user can skip straight through.

### Store Structure UX: Detailed Design

Since ACCS requires manual store creation, the UX is about **discovery, mapping, and validation**:

```
┌─────────────────────────────────────────────────────┐
│  Store Structure                                     │
│                                                      │
│  Commerce Backend: https://accs-instance.example.com │
│  [Refresh]                                           │
│                                                      │
│  ┌─ Current Structure (from Commerce API) ─────────┐ │
│  │                                                   │ │
│  │  ⊞ Main Website (main_website)                   │ │
│  │    ⊞ Main Store (main_store)                     │ │
│  │      ☐ Default View (default)     → [Map to EDS] │ │
│  │      ☐ French View (french)       → [Map to EDS] │ │
│  │                                                   │ │
│  │  ⊞ EU Website (eu_website)                       │ │
│  │    ⊞ EU Store (eu_store)                         │ │
│  │      ☐ EU English (eu_en)         → [Map to EDS] │ │
│  │      ☐ EU German (eu_de)          → [Map to EDS] │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                      │
│  EDS Site Mapping:                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Site: main--repo--org.aem.live (canonical)        │ │
│  │   /     → default (Main Website > Default View)   │ │
│  │   /fr/  → french (Main Website > French View)     │ │
│  │                                                   │ │
│  │ Site: eu--repo--org.aem.live (repoless)           │ │
│  │   /en/  → eu_en (EU Website > EU English)         │ │
│  │   /de/  → eu_de (EU Website > EU German)          │ │
│  └───────────────────────────────────────────────────┘ │
│                                                      │
│  [+ Add EDS Site]  [+ Add Locale to Site]            │
│                                                      │
│  ⚠ Store views not yet created in Commerce will be   │
│    highlighted. Create them in the backoffice first.  │
└─────────────────────────────────────────────────────┘
```

### Execution Phases (Revised)

#### Phase 1: Foundation (No Multi-Site Yet)
- Track Commerce instance URL in project config
- Add Commerce store structure discovery (GET endpoints)
- Add Data Installer API client service (pending deployment research)
- Add basic datapack selection to wizard (single store, single content source)
- Integrate data installation into the setup pipeline

#### Phase 2: Store Structure Discovery & Mapping
- Store Structure discovery UI (fetch + display tree from Commerce)
- Store-to-EDS-site mapping UI (which store views go to which EDS site)
- Validation against live Commerce backend
- Store code propagation to config.json (per-site config generation)
- Multistore config section in config.json for locale subfolders

#### Phase 3: Multi-Site EDS (Repoless)
- Repoless site registration in Configuration Service (N sites, shared code)
- Multi-target content copy pipeline
- Per-site config.json generation with correct store codes
- Per-site content source selection
- CSS theme per brand site

#### Phase 4: Multi-Site Content
- Extend content source model for locale variants
- Per-locale content selection and copy
- Locale-aware placeholder spreadsheets
- Locale-specific navigation and footer

#### Phase 5: Content Packs & Lifecycle
- Content pack definition format (extending demo-packages.json)
- Multi-site reset (iterate over all sites)
- Multi-site cleanup/deletion
- Per-site content editing in edit mode

### Storefront Setup Pipeline Changes

| Phase | Current (fstab) | New (all repoless) |
|-------|----------------|-------------------|
| repository | Create GitHub repo | Same (one repo for all sites) |
| storefront-code | Push fstab.yaml, blocks, inspector | ~~fstab removed~~ Push blocks, per-brand theme CSS, inspector |
| code-sync | Verify sync | Same |
| site-config | Push fstab + register 1 site | Register N sites via Config Service (1 canonical + N-1 repoless) |
| content | Copy from 1 source → 1 target | Copy N sources → N targets (per brand × per locale) |
| **commerce-data** | — | NEW (future): Install datapack(s) via Data Installer API |
| block-library | Create block library in 1 site | Create block library in N sites |
| publish | Publish 1 site | Publish N sites |

**Key pipeline simplification**: The `storefront-code` phase no longer generates or pushes fstab.yaml. Content source mapping moves entirely to the `site-config` phase via Configuration Service PUT. This means the `site-config` phase is now the single source of truth for how code and content connect.

### Config.json Changes for Multi-Site

Current config.json puts store codes under `public.default`. Multi-locale needs a `multistore` section:

```json
{
  "public": {
    "default": {
      "commerce-endpoint": "https://...",
      "commerce-store-view-code": "default",
      "commerce-store-code": "main_store",
      "commerce-website-code": "main_website"
    }
  },
  "multistore": {
    "/fr": {
      "commerce-store-view-code": "french",
      "commerce-store-code": "main_store",
      "commerce-website-code": "main_website"
    }
  }
}
```

For multi-brand (repoless), each brand site has its **own** config.json with its own default values. No multistore section needed if the brand has only one locale.

---

## 9. Confirmed Constraints

### ACCS Store Structure: Manual Only
**ACCS has no API for creating websites, stores, or store views.** Users must create these via the Commerce Admin backoffice. This means the Demo Builder's store structure UX is about **discovering and mapping** existing store structures, not creating them programmatically.

**Implications:**
- The UX should query `/V1/store/websites`, `/V1/store/storeGroups`, `/V1/store/storeViews` to read what exists
- Users configure how their EDS sites map to existing store views
- The extension validates that required store views exist before proceeding
- Documentation/guidance should tell users what to create in the backoffice beforehand

### EDS Multi-Site: Separate Sites Per Brand, Subfolders Per Locale
**Multi-brand requires separate DA.live sites in a repoless setup.** Multi-locale within a brand uses subfolders. These are distinct concerns that cannot be mixed.

| Scenario | EDS Pattern | DA.live Sites | Config Service Registrations |
|----------|-------------|--------------|------------------------------|
| Single site, single locale | Current (no change) | 1 | 1 |
| Single site, multi-locale | Subfolders (`/en/`, `/de/`) | 1 | 1 (multistore config) |
| Multi-brand, single locale | Repoless | N (one per brand) | N |
| Multi-brand, multi-locale | Repoless + subfolders | N (one per brand) | N (each with multistore) |

**Architecture:**
```
GitHub Repository (ONE, shared):
  owner/repo
  ├── blocks/         (shared across all brands)
  ├── styles/themes/  (per-brand CSS via variables)
  └── scripts/        (shared JS)

Configuration Service (ONE per brand):
  PUT /config/{org}/sites/{brand-a}.json
    code:    { owner, repo }                          ← shared code
    content: { source: { url: "...da.live/.../brand-a/" } }  ← brand-specific content

DA.live Content (ONE per brand):
  org/brand-a/           org/brand-b/
  ├── nav                ├── nav           (independent per brand)
  ├── footer             ├── footer
  ├── en/                ├── en/           (locale subfolders within brand)
  │   └── products/      │   └── products/
  └── de/                └── fr/

Resulting URLs:
  main--brand-a--org.aem.live  →  www.brand-a.com
  main--brand-b--org.aem.live  →  www.brand-b.com
```

**Key rules:**
- One canonical site's org/site MUST match the GitHub owner/repo
- Additional sites are "repoless" — they reference the same code but have their own content
- Each site gets its own config.json (Commerce store codes, endpoints, etc.)
- Each site has independent nav, footer, and content
- Code changes to the shared repo propagate to all sites automatically

### DECISION: All Projects Use Repoless Architecture (No fstab.yaml)

**Decision**: Every project — single-site or multi-site — uses the Configuration Service (repoless) instead of fstab.yaml. This eliminates the dual-architecture problem and makes multi-site a natural extension of single-site.

**Rationale**:
- fstab.yaml is a Helix 4 holdover; Configuration Service is Helix 5 native
- Adding a second site to a project becomes a simple Config Service PUT, not a migration
- Eliminates an entire file from the setup pipeline (fstab generation + push)
- Extension is still in beta with a controlled user base — good time to simplify

**What changes**:
- GitHub Repo Selection + DA.live Site Config merge into one **"Storefront Configuration"** step
- User gives one name → extension creates repo + canonical DA.live site from it
- fstab.yaml generation is removed from the pipeline
- Setup pipeline registers via Configuration Service instead of pushing fstab
- Additional sites are just more Config Service PUTs (repoless)

**Migration for existing projects**: Soft migration (Option A). New projects go repoless from day one. Existing projects keep fstab until user resets or edits, at which point they're converted to Config Service registration.

**Files eliminated/changed**:
- `fstabGenerator.ts` — no longer needed for new projects (keep for migration reads)
- `storefrontSetupPhases.ts` — fstab push phase replaced with Config Service registration
- `edsResetService.ts` — reset re-registers via Config Service instead of re-pushing fstab

### Canonical Site Must Match GitHub Repo Name
The canonical site's `org/site` **must** match the GitHub `owner/repo`. This is a hard requirement — Code Sync uses it to map GitHub webhook push events to Configuration Service entries and propagate CDN cache invalidation.

**What breaks without it**: Code pushes won't sync to the Code Bus, and CDN invalidation won't propagate to repoless sites. Serving existing cached content may continue, but code updates silently fail.

**Implication for Demo Builder**: When the user creates a GitHub repo (e.g., `skukla/my-demo`), the canonical DA.live site **must** be named `my-demo` in org `skukla`. Additional repoless sites can have any name (`brand-a`, `brand-b`, etc.). The extension should enforce this: the first/canonical site name is auto-derived from the repo name, not user-chosen.

**Workaround**: The canonical site doesn't need to be the site users access. It can be an "administrative" site. All user-facing sites can be repoless with custom names. But the canonical site must exist with matching names.

### Config.json Is Already Multi-Site Ready (Partially)
The current `configGenerator.ts` already accepts parameterized store codes (`storeViewCode`, `storeCode`, `websiteCode`). For multi-site, each site's config.json would use different values for these fields. The generator doesn't need fundamental changes — it just needs to be called once per site with different parameters.

However, the current config.json template puts store codes under `public.default` as a single set of headers. Multi-locale requires the `multistore` section documented in Adobe's Commerce Storefront docs, which maps locale paths to different store view codes.

---

## 10. Open Questions

### Resolved

- [x] ~~Can ACCS create websites/stores/store views via REST API?~~ **NO.** Users must create via backoffice. UX is "discover and map", not "create".
- [x] ~~Repoless vs subfolder for multi-locale EDS?~~ **Both, for different purposes.** Repoless for multi-brand (separate DA.live sites). Subfolders for multi-locale within a brand.
- [x] ~~Can multi-brand work from a single DA.live site?~~ **NO.** Each brand must be a separate DA.live site. One site = one config.json, one nav, one footer, one domain.
- [x] ~~Should content packs be stored in a new system?~~ **No.** Extend existing demo-packages.json (immediate sense).
- [x] ~~Store structure creation via Data Installer or new service?~~ **Neither for ACCS.** Read-only discovery via Commerce REST API. Users create manually.

### Still Open — Data Installer
- [ ] How is the Data Installer API deployed? (Shared instance? Per-project? Per-org?)
- [ ] What authentication flow does the extension need for the Data Installer?
- [ ] Can datapacks be scoped to specific store views (session variables)?
- [ ] What's the typical processing time for a standard demo datapack?
- [ ] Are there pre-built datapacks for common demo scenarios (B2B, multi-geo)?

### Still Open — Commerce
- [ ] Are root categories pre-created in demo instances, or do we need to create them?
- [ ] What Commerce credentials does the extension have access to? (client_id/secret from I/O project?)
- [ ] How does multi-site affect the API Mesh endpoint configuration?
- [ ] Can we read store structure from ACCS via the same REST API as PaaS? (GET endpoints)

### Still Open — Content
- [ ] What content sources exist today beyond the 5 demo packages?
- [ ] Do locale-specific content variants exist for any current demo packages?
- [ ] How do content patches work across locales?
- [ ] Is there a standard structure for multi-locale DA.live content (folder naming, nav per locale, etc.)?

### Still Open — UX
- [ ] Should multi-site be an advanced option (hidden by default) or first-class choice?
- [ ] How do we handle the complexity of multi-site for first-time users?
- [ ] Should there be preset "templates" (US+EU, Multi-Brand) alongside the open-ended builder?
- [ ] How does multi-site affect the Review step and timeline?
- [ ] How does the user provide Commerce backend URL? (New field in wizard? From I/O project? From env?)

### Still Open — Architecture
- [ ] How does this feature interact with the existing mesh optional feature?
- [ ] What project state changes are needed to track multi-site configuration?
- [ ] How does the canonical site requirement affect the current repo creation flow?
- [ ] Should brand-specific CSS themes be auto-generated or user-provided?

---

## 11. Sources

### Adobe Commerce Documentation
- [Site, Store, and View Scope](https://experienceleague.adobe.com/en/docs/commerce-admin/start/setup/websites-stores-views)
- [Best Practices for Sites, Stores, Store Views](https://experienceleague.adobe.com/en/docs/commerce-operations/implementation-playbook/best-practices/planning/sites-stores-store-views)
- [Multiple Websites or Stores - Config Guide](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/multi-sites/ms-overview)
- [Set Up Multiple Websites in Admin](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/multi-sites/ms-admin)
- [Store Structure](https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/site-store/stores)
- [B2B Introduction](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/introduction)
- [Shared Catalogs](https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/shared-catalogs/catalog-shared)
- [MSI Stocks and Sources](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/sources-stocks)
- [REST API Reference (PaaS)](https://developer.adobe.com/commerce/webapi/reference/rest/paas/)
- [REST API Reference (ACCS/SaaS)](https://developer.adobe.com/commerce/webapi/reference/rest/saas/)
- [Content Localization](https://experienceleague.adobe.com/developer/commerce/storefront/merchants/quick-start/content-localization/)
- [Multistore Setup](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/multistore-setup/)

### EDS/DA.live Documentation
- [Repoless - One codebase, many sites](https://www.aem.live/docs/repoless)
- [Configuration Service Setup](https://www.aem.live/docs/config-service-setup)
- [Multi Site Management with AEM Authoring](https://www.aem.live/developer/repoless-multisite-manager)
- [Multilingual Sites with Edge Delivery](https://www.aem.live/blog/future-proof-multilingual-website-edge-ensemble)
- [Organizing Source Code - Helix 5](https://www.aem.live/blog/organizing-source-code-ensemble)
- [DA.live Documentation](https://docs.da.live/)
- [DA.live Permissions](https://docs.da.live/administrators/guides/permissions)
- [AEM Config Service (DA.live)](https://docs.da.live/administrators/reference/aem-config-service)

### Industry / Community
- [Building Multi-Country eCommerce on Adobe Commerce](https://www.navigatecommerce.com/blog/post/building-multi-country-ecommerce-adobe-commerce)
- [Adobe Commerce Multi-Store Multi-Territory](https://objectsource.co.uk/adobe-commerce-multi-store-multi-territory-multi-currency-capabilities/)
- [How Adobe Commerce Supports Multi-Brand Operations](https://www.agentosupport.com/blog/how-does-adobe-commerce-support-multi-brand-multi-shop-front-operations/)
- [Adobe Commerce ACCS Guide](https://aureatelabs.com/blog/adobe-commerce-as-a-cloud-service-accs-guide/)
- [Brand-Specific Repoless EDS Sites](http://experience-aem.blogspot.com/2025/11/aem-edge-delivery-create-brand-specific-repoless-eds-sites.html)
