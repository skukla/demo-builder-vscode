# Demo Data & Multi-Site — UX Specification

**Date**: 2026-03-25
**Status**: Design specification (pre-implementation)
**Companion**: `20260325-demo-data-and-multisite-design.md` (research)

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Data Model](#2-data-model)
3. [Creation Flow — Wizard](#3-creation-flow--wizard)
4. [Post-Creation — Project Dashboard](#4-post-creation--project-dashboard)
5. [Post-Creation — Configure](#5-post-creation--configure)
6. [Post-Creation — Site Management](#6-post-creation--site-management)
7. [Lifecycle Operations](#7-lifecycle-operations)
8. [Migration — Existing Projects](#8-migration--existing-projects)
9. [State & Persistence](#9-state--persistence)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Design Principles

### Progressive Disclosure
Single-site projects see no multi-site complexity. The [+ Add Storefront] button is the only hint that more is possible. Everything multi-site is opt-in.

### One Name, Two Resources
User gives one project name. The extension creates both the GitHub repo and the canonical DA.live site from it. No naming mismatch possible.

### Configuration Service as Single Source of Truth
All projects use the Configuration Service (repoless architecture). No fstab.yaml. Content source, code source, and site config all live in the Config Service.

### Discover and Map, Don't Create
Commerce store structure (websites, stores, store views) is created by the user in the Commerce Admin backoffice. The extension discovers what exists and lets the user map it to EDS sites.

### Per-Site Scoping with Project Context
Settings that apply to all sites (Commerce backend URL, mesh endpoint, customer group) are project-scoped. Settings that vary per site (store view code, store code, website code) are site-scoped. The UI makes this distinction clear.

### Full Lifecycle Support
Everything the user configures during creation can be viewed, edited, reset, and redeployed after creation. No "creation-only" settings.

---

## 2. Data Model

### Core Types

```typescript
/** A single EDS storefront site within a project */
interface StorefrontSite {
  id: string;                    // Unique within project (e.g., 'primary', 'brand-eu')
  name: string;                  // Display name
  daLiveSite: string;            // DA.live site name
  role: 'canonical' | 'repoless';
  isNew: boolean;                // true = created during setup
  contentSource?: {              // Where to copy content from
    org: string;
    site: string;
    indexPath?: string;
  };
  resetSiteContent?: boolean;    // Overwrite existing content
  storeMapping?: StoreSiteMapping;  // Commerce store → EDS mapping
  status?: SiteStatus;           // Published, Stale, Pending, Error
}

/** Maps Commerce store views to locale paths within an EDS site */
interface StoreSiteMapping {
  defaultStoreViewCode: string;  // Store view for root path /
  locales?: LocaleMapping[];     // Additional locale paths
}

interface LocaleMapping {
  path: string;                  // e.g., '/fr/', '/de/'
  storeViewCode: string;         // Commerce store view code
  storeCode?: string;            // Commerce store code (if different from default)
  websiteCode?: string;          // Commerce website code (if different from default)
}

type SiteStatus = 'pending' | 'published' | 'stale' | 'error';

/** Extended EDSConfig — replaces current single-site model */
interface EDSConfig {
  daLiveOrg: string;             // All sites in same org
  githubOwner: string;           // GitHub repo owner
  repoName: string;              // GitHub repo name (= canonical site name)
  sites: StorefrontSite[];       // All sites in this project
  // Convenience: primary site = sites.find(s => s.role === 'canonical')
}

/** Per-site section of config.json */
interface SiteConfigJson {
  siteId: string;
  commerceEndpoint: string;      // From project-level config
  storeViewCode: string;         // Site-specific
  storeCode: string;             // Site-specific
  websiteCode: string;           // Site-specific
  multistore?: Record<string, {  // Locale path → store codes
    storeViewCode: string;
    storeCode?: string;
    websiteCode?: string;
  }>;
}

/** Commerce store structure (read from backend) */
interface CommerceStoreStructure {
  websites: CommerceWebsite[];
}

interface CommerceWebsite {
  id: number;
  code: string;
  name: string;
  stores: CommerceStore[];
}

interface CommerceStore {
  id: number;
  code: string;
  name: string;
  websiteId: number;
  rootCategoryId: number;
  storeViews: CommerceStoreView[];
}

interface CommerceStoreView {
  id: number;
  code: string;
  name: string;
  storeId: number;
  websiteId: number;
  isActive: boolean;
}
```

### Project-Scoped vs Site-Scoped Settings

| Setting | Scope | Where Stored |
|---------|-------|-------------|
| Commerce backend URL | Project | `.env` |
| Commerce GraphQL endpoint | Project | `.env` |
| Mesh endpoint | Project | `.env` |
| Customer group | Project | `.env` |
| API key | Project | `.env` |
| Environment ID | Project | `.env` |
| AEM Assets enabled | Project | `.env` |
| **Store view code** | **Site** | `config.json` per site |
| **Store code** | **Site** | `config.json` per site |
| **Website code** | **Site** | `config.json` per site |
| **Locale path mappings** | **Site** | `config.json` `multistore` section |
| **Content source** | **Site** | Configuration Service registration |

---

## 3. Creation Flow — Wizard

### Step 1: Welcome (unchanged)

Package selection, architecture modal, block libraries, mesh toggle. All project-scoped.

### Step 2: Prerequisites (unchanged)

Tool checking. Machine-scoped.

### Steps 3-5: Adobe Auth (unchanged, conditional on mesh)

Adobe I/O authentication, project/workspace selection. Project-scoped.

### Step 6: Connect Services (unchanged)

GitHub OAuth + DA.live bookmarklet auth. Project-scoped.

### Step 7: Storefront Configuration (NEW — replaces steps 8+9)

**Purpose**: Create/select GitHub repo and DA.live sites in a single step.

**Layout**: Two-column. Left = interactive form. Right = storefront summary.

#### First-Time View (No Sites Added Yet)

```
┌──────────────────────────────────────────────────────────────────┐
│  Storefront Configuration                                        │
│                                                                   │
│  ┌─ Left Column ──────────────────────┐ ┌─ Right Column ────────┐│
│  │                                     │ │                       ││
│  │  Storefront Name                    │ │  Storefronts          ││
│  │  [my-demo                      ]   │ │                       ││
│  │  ℹ Creates GitHub repo and          │ │  No storefronts yet.  ││
│  │    DA.live site with this name.     │ │  Enter a name to      ││
│  │                                     │ │  get started.         ││
│  │  GitHub:  skukla/my-demo            │ │                       ││
│  │  DA.live: acme/my-demo              │ │                       ││
│  │                                     │ │                       ││
│  │  Content Source                     │ │                       ││
│  │  [CitiSignal Content          ▼]   │ │                       ││
│  │                                     │ │                       ││
│  │  ☐ Overwrite content if site exists │ │                       ││
│  │                                     │ │                       ││
│  └─────────────────────────────────────┘ └───────────────────────┘│
│                                                                   │
│  GitHub: ✓ Connected as skukla                                    │
│  DA.live: ✓ Connected to org acme                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Behavior**:
- User types storefront name → repo name and DA.live site name auto-derive
- Content source dropdown populated from selected demo package's `contentSource`
- Validation: lowercase alphanumeric + hyphens, starts with letter
- "Overwrite content" checkbox shown only when selecting an existing DA.live site
- Continue enabled when: name is valid + content source selected

#### After Primary Site Added (Multi-Site Available)

```
┌──────────────────────────────────────────────────────────────────┐
│  Storefront Configuration                                        │
│                                                                   │
│  ┌─ Left Column ──────────────────────┐ ┌─ Right Column ────────┐│
│  │                                     │ │                       ││
│  │  Add Another Storefront             │ │  Storefronts (1)      ││
│  │                                     │ │                       ││
│  │  ○ Create New  ○ Use Existing       │ │  ✓ my-demo            ││
│  │                                     │ │    primary · repo     ││
│  │  Site Name                          │ │    CitiSignal Content ││
│  │  [brand-eu                     ]   │ │                       ││
│  │  DA.live: acme/brand-eu             │ │                       ││
│  │                                     │ │                       ││
│  │  Content Source                     │ │                       ││
│  │  [CitiSignal Content          ▼]   │ │                       ││
│  │  [  CitiSignal Content          ]   │ │                       ││
│  │  [  Empty (no content)          ]   │ │                       ││
│  │  [  Copy from: my-demo          ]   │ │                       ││
│  │                                     │ │                       ││
│  │  [Add Storefront]  [Cancel]         │ │                       ││
│  │                                     │ │                       ││
│  └─────────────────────────────────────┘ └───────────────────────┘│
│                                                                   │
│  [+ Add Another Storefront]                                       │
└──────────────────────────────────────────────────────────────────┘
```

**Behavior**:
- [+ Add Another Storefront] appears after primary site is configured
- Additional sites can be "Create New" (any name) or "Use Existing" (pick from DA.live site list)
- Content source options include: package content sources, "Empty", or "Copy from [other site in project]"
- Additional sites are automatically `role: 'repoless'`
- Right column shows growing list of configured sites
- Sites can be removed from right column (except primary)
- Continue enabled when: at least 1 site configured

#### "Use Existing" Mode

```
│  ○ Create New  ● Use Existing          │
│                                         │
│  🔍 [Search sites...              ]    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ brand-a          2 days ago     │   │
│  │ brand-b          5 days ago     │   │
│  │ test-site        1 week ago     │   │
│  └─────────────────────────────────┘   │
```

Reuses the existing site listing UX from the current DataSourceConfigStep.

### Step 8: Store Structure (NEW — conditional)

**Purpose**: Fetch Commerce store hierarchy and map store views to EDS sites/locales.

**When shown**: When Commerce backend settings exist (ACCS or PaaS configured) AND at least one site is configured. Auto-skipped if only one site and one store view — nothing to map.

**Layout**: Two-column. Left = Commerce tree (read-only). Right = EDS site mapping (interactive).

```
┌──────────────────────────────────────────────────────────────────┐
│  Store Structure                                                  │
│                                                                   │
│  Commerce Backend: https://accs.example.com  [Refresh]            │
│  ✓ Connected — 2 websites, 3 stores, 5 store views               │
│                                                                   │
│  ┌─ Commerce Store Hierarchy ────────┐ ┌─ EDS Site Mapping ─────┐│
│  │                                    │ │                         ││
│  │  ▼ Main Website (base)            │ │  my-demo (primary)      ││
│  │    ▼ Main Store (main)            │ │  ┌─────────────────────┐││
│  │      • default  ─────── Assign ──────→ /  default            │││
│  │      • french   ─────── Assign ──────→ /fr/  french          │││
│  │                                    │ │  └─────────────────────┘││
│  │  ▼ EU Website (eu)                │ │                         ││
│  │    ▼ EU Store (eu_store)          │ │  brand-eu (repoless)    ││
│  │      • eu_en    ─────── Assign ──────→ /  eu_en              │││
│  │      • eu_de    ─────── Assign ──────→ /de/  eu_de           │││
│  │      ○ eu_fr    (unassigned)       │ │                         ││
│  │                                    │ │                         ││
│  └────────────────────────────────────┘ └─────────────────────────┘│
│                                                                   │
│  ⚠ 1 unassigned store view: eu_fr                                 │
│  Unassigned views won't have EDS storefronts.                     │
│                                                                   │
│  [Skip — I'll configure this later]                               │
└──────────────────────────────────────────────────────────────────┘
```

**Behavior**:
- On mount: fetches store structure via Commerce REST API (GET `/V1/store/websites`, `/V1/store/storeGroups`, `/V1/store/storeViews`)
- Left column shows Commerce hierarchy as read-only tree
- Each store view has an "Assign" action (dropdown or drag) to map it to an EDS site + locale path
- Right column shows EDS sites from Step 7, with assigned store views
- First store view assigned to a site becomes that site's root path (`/`). Subsequent ones get locale paths (`/fr/`, `/de/`)
- Unassigned store views shown with warning (informational, not blocking)
- "Skip" button available — user can configure later via post-creation Configure screen
- Continue enabled always (mapping is optional)

**What it produces**:
- `StoreSiteMapping` per site → drives config.json generation
- `multistore` section in config.json for locale paths
- Store view codes propagated to per-site settings

### Step 9: Commerce Data (NEW — future, conditional)

**Purpose**: Select datapacks to install into Commerce backend per store context.

**When shown**: When Data Installer API is available and configured.

**Status**: Blocked on Data Installer deployment research. Placeholder in wizard flow.

**Conceptual UX**:
```
┌──────────────────────────────────────────────────────────────────┐
│  Commerce Data                                                    │
│                                                                   │
│  Select data to install into your Commerce backend.               │
│                                                                   │
│  Available Datapacks:                                             │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ☑ CitiSignal Demo Data (v2.1)        ~3 min             │     │
│  │   Products, categories, customers, cart rules            │     │
│  │                                                          │     │
│  │ ☐ B2B Data Pack (v1.0)               ~5 min             │     │
│  │   Shared catalogs, companies, B2B customers              │     │
│  │                                                          │     │
│  │ ☐ Multi-Geo Data (v1.0)              ~2 min             │     │
│  │   EU website config, EU store views, locale products     │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Data will be installed after storefronts are published.          │
└──────────────────────────────────────────────────────────────────┘
```

### Step 10: Settings (modified)

**Purpose**: Collect component env vars. Modified to show per-site store codes.

**Layout**: Current two-column layout with navigator. Modified with site scoping.

**Changes from current**:

If project has 1 site:
- No visible change. Store view code, store code, website code shown as regular fields.

If project has N sites:
- Store code fields become a per-site table:

```
  Store Codes (per storefront)
  ┌────────────────┬──────────────┬──────────────┬──────────────┐
  │ Storefront     │ Store View   │ Store Code   │ Website Code │
  ├────────────────┼──────────────┼──────────────┼──────────────┤
  │ my-demo        │ default      │ main         │ base         │
  │ brand-eu       │ eu_en        │ eu_store     │ eu           │
  └────────────────┴──────────────┴──────────────┴──────────────┘

  ℹ Values auto-populated from Store Structure mapping.
    Edit here to override.
```

- Values auto-populated from Store Structure step (if completed)
- Editable for manual override
- Project-wide settings (Commerce URL, mesh endpoint, etc.) shown above as before

### Step 11: Review (modified)

**Changes from current**:

```
┌──────────────────────────────────────────────────────────────────┐
│  Review                                                           │
│                                                                   │
│  ┌─ Project Configuration ─────────────────────────────────────┐ │
│  │  Project: my-demo                                            │ │
│  │  Package: CitiSignal · EDS + ACCS                            │ │
│  │  Block Libraries: Isle5, Demo Team Blocks                    │ │
│  │  API Mesh: Included                                          │ │
│  │  Adobe I/O: My Org > My Project > Stage                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Storefronts ───────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  ┌─ my-demo (primary) ─────────────────────────────────────┐ │ │
│  │  │  GitHub: skukla/my-demo                                  │ │ │
│  │  │  DA.live: acme/my-demo                                   │ │ │
│  │  │  Content: CitiSignal Content                              │ │ │
│  │  │  Store: default (Main Website > Main Store)               │ │ │
│  │  │  Locales: /fr/ → french                                   │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │  ┌─ brand-eu (repoless) ───────────────────────────────────┐ │ │
│  │  │  DA.live: acme/brand-eu                                   │ │ │
│  │  │  Content: CitiSignal Content                              │ │ │
│  │  │  Store: eu_en (EU Website > EU Store)                     │ │ │
│  │  │  Locales: /de/ → eu_de                                    │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Commerce Data ─────────────────────────────────────────────┐ │
│  │  (Future: selected datapacks shown here)                     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Step 12: Storefront Setup (modified)

**Changes**: Pipeline executes per-site for site-specific phases.

```
┌──────────────────────────────────────────────────────────────────┐
│  Publishing Storefronts                                           │
│                                                                   │
│  ┌─ Repository ──────────────────────── ✓ Complete ─────────────┐│
│  │  Created skukla/my-demo                                       ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─ Storefront Code ────────────────── ✓ Complete ──────────────┐│
│  │  Installed blocks, inspector SDK                              ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─ Code Sync ──────────────────────── ✓ Complete ──────────────┐│
│  │  Verified code synchronization                                ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─ Storefronts (2 sites) ─────────── ● In Progress ───────────┐│
│  │                                                                ││
│  │  my-demo (primary)                                             ││
│  │    ✓ Site registered                                           ││
│  │    ✓ Content copied                                            ││
│  │    ✓ Block library created                                     ││
│  │    ✓ Published                                                 ││
│  │                                                                ││
│  │  brand-eu (repoless)                                           ││
│  │    ✓ Site registered                                           ││
│  │    ● Copying content...                                        ││
│  │    ○ Block library                                             ││
│  │    ○ Publish                                                   ││
│  │                                                                ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─ Commerce Data ──────────────────── ○ Pending ───────────────┐│
│  │  (Future: datapack installation progress)                     ││
│  └───────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**Pipeline structure**:
1. Repository (once): Create GitHub repo from template
2. Storefront Code (once): Push blocks, inspector, theme CSS
3. Code Sync (once): Verify synchronization
4. **Per-site loop**:
   - Register site with Configuration Service
   - Copy content from source to DA.live site
   - Create block library in DA.live site
   - Publish site (preview + live)
5. Commerce Data (once, future): Install datapacks

**Error handling per site**: If one site fails, others continue. Failed site shown with error + retry option. User can retry individual sites or skip.

### Step 13: Create Project (minor changes)

Generates:
- `.env` (project-wide settings)
- Per-site config.json with correct store codes + multistore section
- Project metadata with `sites[]` array

---

## 4. Post-Creation — Project Dashboard

### Layout with Site Picker

```
┌──────────────────────────────────────────────────────────────────┐
│  my-demo                                                          │
│  CitiSignal · EDS + ACCS                                          │
│                                                                   │
│  ┌──────────────────────────────────┐                             │
│  │ Storefront: my-demo (primary) ▼  │  ← Site picker (if >1 site)│
│  └──────────────────────────────────┘                             │
│                                                                   │
│  ┌─ Status ─────────┐ ┌─ Mesh ──────────┐ ┌─ Storefront ──────┐ │
│  │ Frontend          │ │ API Mesh         │ │ EDS               │ │
│  │ ● Running :3000   │ │ ✓ Deployed       │ │ ✓ Published       │ │
│  └───────────────────┘ └─────────────────┘ └───────────────────┘ │
│                         ↑ project-scoped     ↑ site-scoped       │
│                                                                   │
│  ┌─ Actions ────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  [Open Live Site]   [Author in DA.live]   [Logs]              │ │
│  │       ↑ opens selected site's URL                             │ │
│  │                                                               │ │
│  │  [Configure]        [Deploy Mesh]         [Dev Console]       │ │
│  │                                                               │ │
│  │  [Manage Sites]     [Components]          [Delete]            │ │
│  │       ↑ NEW                                                   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Mesh Endpoint: https://edge-mesh.adobeio-static.net/...          │
│  ↑ NEW: visible on dashboard                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Site picker behavior**:
- Hidden for single-site projects (no picker shown, no multi-site UX)
- Shown for multi-site projects as a dropdown at top of dashboard
- Changing selection updates: Open Live Site URL, Open DA.live URL, Storefront status badge
- Does NOT change: Frontend status, Mesh status (project-scoped)

**New "Storefront" status badge** (shown for all EDS projects):
- Published: storefront config matches what's live
- Stale: config changed since last publish
- Pending: not yet published
- Error: last publish failed

**New "Manage Sites" button**: Opens Site Management Panel (see Section 6).

**New "Mesh Endpoint" display**: Shows deployed mesh URL on dashboard (currently only in Configure).

---

## 5. Post-Creation — Configure

### Layout with Site Context

```
┌──────────────────────────────────────────────────────────────────┐
│  Configure Project                                                │
│  my-demo                                                          │
│                                                                   │
│  ┌──────────────────────┐ ┌─ Navigator ─────────────────────────┐│
│  │                       │ │                                     ││
│  │  PROJECT SETTINGS     │ │  Project Settings                   ││
│  │  ──────────────────   │ │    ✓ Adobe Commerce (3/3)           ││
│  │                       │ │    ✓ API Mesh (1/1)                 ││
│  │  Adobe Commerce       │ │    ✓ AEM Assets (2/2)              ││
│  │  ┌─────────────────┐ │ │                                     ││
│  │  │ ACCS Endpoint    │ │ │  Storefront Settings                ││
│  │  │ [https://...]    │ │ │    ● my-demo (3/3)                  ││
│  │  │                  │ │ │    ○ brand-eu (1/3)                  ││
│  │  │ Customer Group   │ │ │                                     ││
│  │  │ [General     ▼]  │ │ │                                     ││
│  │  └─────────────────┘ │ │                                     ││
│  │                       │ │                                     ││
│  │  STOREFRONT SETTINGS  │ │                                     ││
│  │  ──────────────────   │ │                                     ││
│  │                       │ │                                     ││
│  │  ┌─ my-demo ────────┐│ │                                     ││
│  │  │ Store View Code   ││ │                                     ││
│  │  │ [default      ]   ││ │                                     ││
│  │  │ Store Code        ││ │                                     ││
│  │  │ [main         ]   ││ │                                     ││
│  │  │ Website Code      ││ │                                     ││
│  │  │ [base         ]   ││ │                                     ││
│  │  └───────────────────┘│ │                                     ││
│  │                       │ │                                     ││
│  │  ┌─ brand-eu ────────┐│ │                                     ││
│  │  │ Store View Code   ││ │                                     ││
│  │  │ [eu_en        ]   ││ │                                     ││
│  │  │ Store Code        ││ │                                     ││
│  │  │ [eu_store     ]   ││ │                                     ││
│  │  │ Website Code      ││ │                                     ││
│  │  │ [eu           ]   ││ │                                     ││
│  │  └───────────────────┘│ │                                     ││
│  │                       │ │                                     ││
│  │  [Close]     [Save]   │ │                                     ││
│  └───────────────────────┘ └─────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**Key changes from current Configure**:
1. **Two sections**: "Project Settings" (shared) and "Storefront Settings" (per-site)
2. **Storefront Settings shows all sites** as collapsible sections (not tabs — all visible for comparison)
3. **Navigator** shows per-site completion status
4. **Save triggers per-site staleness detection**: "Site 'brand-eu' config changed. Republish?"
5. **Republish is per-site**: User can republish one site without affecting others

**Post-save flow**:
- Detect which sites changed (compare per-site baselines)
- Show notification: "Configuration saved. 1 of 2 storefronts need republishing."
- Buttons: "Republish brand-eu" / "Republish All" / "Later"

---

## 6. Post-Creation — Site Management

### Site Management Panel (from Dashboard → "Manage Sites")

```
┌──────────────────────────────────────────────────────────────────┐
│  Manage Storefronts                                    [+ Add]    │
│                                                                   │
│  ┌─ my-demo ───────────────────────────────────────── primary ──┐│
│  │  DA.live: acme/my-demo                                        ││
│  │  Store: default (Main Website > Main Store > Default View)    ││
│  │  Locales: /fr/ → french                                       ││
│  │  Status: ✓ Published                                          ││
│  │  URL: main--my-demo--skukla.aem.live                          ││
│  │                                                                ││
│  │  [Open Live]  [Open DA.live]  [Reset]  [Republish]            ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─ brand-eu ──────────────────────────────────────── repoless ─┐│
│  │  DA.live: acme/brand-eu                                       ││
│  │  Store: eu_en (EU Website > EU Store > EU English)            ││
│  │  Locales: /de/ → eu_de                                        ││
│  │  Status: ⚠ Stale (config changed)                             ││
│  │  URL: main--brand-eu--skukla.aem.live                         ││
│  │                                                                ││
│  │  [Open Live]  [Open DA.live]  [Reset]  [Republish]  [Remove]  ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│  Note: Primary storefront cannot be removed.                      │
│  To change the primary storefront, delete and recreate project.   │
└──────────────────────────────────────────────────────────────────┘
```

**Per-site actions**:

| Action | What It Does |
|--------|-------------|
| **Open Live** | Opens `main--{site}--{org}.aem.live` in browser |
| **Open DA.live** | Opens `https://da.live/{org}/{site}` for content authoring |
| **Reset** | Clears DA.live content, re-copies from source, re-registers Config Service, republishes |
| **Republish** | Regenerates config.json for this site and publishes to CDN |
| **Remove** | Deletes DA.live content + Config Service entry. Repo untouched. Only for repoless sites. |

### Add Site Flow (from "+" button)

Modal dialog, 3 steps:

**Step 1: Name & Source**
```
┌─────────────────────────────────────────────────┐
│  Add Storefront                          Step 1  │
│                                                   │
│  ○ Create New  ○ Use Existing                     │
│                                                   │
│  Site Name: [brand-west            ]              │
│  DA.live: acme/brand-west                         │
│                                                   │
│  Content Source: [CitiSignal Content      ▼]      │
│                                                   │
│  [Next]  [Cancel]                                 │
└─────────────────────────────────────────────────┘
```

**Step 2: Store Mapping (optional)**
```
┌─────────────────────────────────────────────────┐
│  Add Storefront                          Step 2  │
│                                                   │
│  Map store views to this storefront:              │
│                                                   │
│  Default: [us_west          ▼]                    │
│           (US West Website > West Store)          │
│                                                   │
│  [+ Add Locale]                                   │
│                                                   │
│  [Add Storefront]  [Skip Mapping]  [Back]         │
└─────────────────────────────────────────────────┘
```

**Step 3: Progress**
```
┌─────────────────────────────────────────────────┐
│  Add Storefront                          Step 3  │
│                                                   │
│  ✓ Created DA.live site                           │
│  ✓ Registered with Configuration Service          │
│  ● Copying content...                             │
│  ○ Publishing                                     │
│                                                   │
│  [Close] (enabled when complete)                  │
└─────────────────────────────────────────────────┘
```

---

## 7. Lifecycle Operations

### Reset

| Scenario | Trigger | Dialog | Operation |
|----------|---------|--------|-----------|
| **Single-site project** | Dashboard → Reset | "Reset my-demo?" | Reset one site (current behavior, adapted for Config Service) |
| **Multi-site, reset one** | Manage Sites → site → Reset | "Reset brand-eu? Other storefronts not affected." | Reset only that site |
| **Multi-site, reset all** | Dashboard → Reset | "Reset all storefronts? (2 sites)" with option to select which | Reset each site sequentially |

**Per-site reset operation**:
1. Clear DA.live content for site
2. Re-copy content from source
3. Re-register Configuration Service entry
4. Reinstall block library in DA.live site
5. Republish site

**Progress**: "Resetting brand-eu... Step 3/5: Copying content"

### Republish

| Scenario | Trigger | Operation |
|----------|---------|-----------|
| **Config changed** | Configure → Save → "Republish?" | Regenerate config.json for affected site(s), push to GitHub, publish to CDN |
| **Manual republish** | Manage Sites → site → Republish | Same as above but for explicit single site |
| **Republish all** | Configure → Save → "Republish All" | Regenerate + publish for all sites |

### Delete Project

```
┌─────────────────────────────────────────────────────┐
│  Delete "my-demo"?                                   │
│                                                       │
│  This will delete the local project files.            │
│                                                       │
│  Also clean up external resources?                    │
│                                                       │
│  ☑ Delete GitHub repository (skukla/my-demo)          │
│                                                       │
│  ☑ Delete DA.live storefronts:                        │
│     ☑ my-demo (primary)                               │
│     ☑ brand-eu (repoless)                             │
│                                                       │
│  ☑ Remove Configuration Service entries               │
│                                                       │
│  [Delete]  [Cancel]                                   │
└─────────────────────────────────────────────────────┘
```

**Behavior**:
- GitHub repo deletion: single checkbox (one repo per project)
- DA.live sites: individual checkboxes per site (user might want to keep some)
- Configuration Service: follows DA.live selection (if site deleted, config entry deleted)
- Respects `cleanupBehavior` setting (ask / deleteAll / localOnly)

### Edit Mode

Edit mode re-opens the wizard with existing project data. Multi-site changes:
- Storefront Configuration step shows existing sites (read-only list) with [+ Add] for new ones
- Store Structure step shows current mappings with option to re-map
- Settings step shows current per-site store codes with option to edit
- Changes applied on "Save" → triggers per-site republish for affected sites

**Cannot change in edit mode**:
- Primary site name (would break canonical ↔ repo link)
- GitHub repo name (would break everything)

**Can change in edit mode**:
- Add/remove repoless sites
- Change content sources per site
- Change store view mappings
- Change per-site store codes
- Change project-level settings

---

## 8. Commerce API Access — Credential Gap

### The Problem

The Store Structure step needs to call Commerce REST APIs (`GET /V1/store/websites`, etc.) to discover the existing hierarchy. These APIs require admin-level authentication. The extension doesn't currently have the credentials to make these calls in all scenarios.

### Current Credential Inventory

| Credential | Available When | Could Be Used For |
|-----------|---------------|-------------------|
| `ACCS_GRAPHQL_ENDPOINT` | ACCS projects (user enters in Settings) | Derives Commerce base URL |
| `ADOBE_COMMERCE_URL` | PaaS projects (user enters in Settings) | Commerce base URL |
| `ADOBE_COMMERCE_ADMIN_USERNAME` + `PASSWORD` | PaaS projects with tool manager component | `POST /V1/integration/admin/token` → Bearer token for REST API |
| Adobe I/O credentials (client_id/secret) | Only when mesh is included (Adobe Auth steps) | OAuth2 client_credentials → Bearer token for ACCS REST API |
| Adobe IMS token | Always (for DA.live) | NOT valid for Commerce REST API |

### Gap Analysis

| Backend | Can We Access Store REST API? | What's Missing |
|---------|------------------------------|---------------|
| **PaaS with tool manager** | ✓ Yes | Admin username/password already collected |
| **PaaS without tool manager** | ✗ No | No admin credentials available |
| **ACCS with mesh** | ? Maybe | I/O credentials exist, but need to verify OAuth flow works for store APIs |
| **ACCS without mesh** | ✗ No | No Commerce credentials at all |

### Proposed Solutions

**Option A: Always collect Commerce admin credentials**
- Add `COMMERCE_ADMIN_URL` + auth fields to a new "Commerce Connection" section in the wizard
- Works for both PaaS and ACCS
- Downside: more fields for the user to fill in, even for simple projects

**Option B: Collect credentials only when Store Structure step is shown**
- Store Structure step has a "Connect to Commerce" sub-step before showing the tree
- User provides admin credentials only when they want to use this feature
- Credentials stored in SecretStorage (not .env)
- Downside: adds friction to the Store Structure step

**Option C: Use existing credentials when available, prompt when not**
- PaaS with tool manager: use existing admin username/password
- ACCS with mesh: attempt OAuth with I/O credentials
- Otherwise: show "Connect to Commerce backend" prompt with credential fields
- Most flexible, least friction for users who already have credentials

**Recommendation**: Option C. The extension already has credentials in many scenarios. Only prompt when they're missing. The Store Structure step starts with a connectivity check and prompts for credentials if needed.

### Store Structure Step — Connectivity Flow

```
Step loads:
  1. Check: do we have Commerce credentials?
     ├─ PaaS + admin username/password in .env → try GET /V1/store/websites
     ├─ ACCS + I/O credentials → try OAuth → GET /V1/store/websites
     └─ Neither → show "Connect to Commerce" form
  2. If connection succeeds → show store hierarchy tree
  3. If connection fails → show error + "Enter credentials" form
  4. If user skips → step is optional, continue without mapping
```

### Credential Form (shown when needed)

```
┌──────────────────────────────────────────────────────┐
│  Connect to Commerce Backend                          │
│                                                       │
│  Commerce URL                                         │
│  [https://accs.example.com              ]             │
│  ℹ Auto-filled from project settings                  │
│                                                       │
│  Authentication                                       │
│  ○ Admin Credentials (PaaS)                           │
│    Username: [admin          ]                        │
│    Password: [••••••••       ]                        │
│                                                       │
│  ○ OAuth Client (ACCS)                                │
│    Client ID:     [from I/O project   ]               │
│    Client Secret: [••••••••           ]               │
│                                                       │
│  [Test Connection]                                    │
│                                                       │
│  ✓ Connected — 2 websites, 3 stores, 5 store views    │
└──────────────────────────────────────────────────────┘
```

### Post-Creation: Re-Fetching Store Structure

The same connectivity logic applies in:
- **Configure screen** → "Refresh Store Structure" button in Storefront Settings section
- **Manage Sites** → "Add Storefront" modal → Step 2 (Store Mapping) uses same tree
- **Edit mode** → Store Structure step re-fetches on load

Credentials are cached in SecretStorage (encrypted, per-project) so the user doesn't re-enter them every time.

---

## 9. Migration — Existing Projects

### Detection

On project load, check if project uses fstab.yaml (old) or Configuration Service (new):
- If `fstab.yaml` exists in repo AND no Config Service registration found → legacy project
- If Config Service registration exists → modern project

### Soft Migration (Automatic on Reset/Edit)

When user resets or edits a legacy project:
1. Read fstab.yaml to extract DA.live org/site
2. Register site with Configuration Service (same code/content sources)
3. Delete fstab.yaml from repo
4. Update project metadata to new `sites[]` format
5. Continue with normal operation

**User sees**: "Upgrading project to new storefront architecture..." in progress notifications. No manual action required.

### No Migration (Just Works)

Legacy projects continue to work as-is. The extension supports both paths during the transition:
- fstab-based projects: read fstab for DA.live info, use existing pipeline
- Config Service projects: use new pipeline

The dual-path code is removed once all known projects have migrated.

---

## 10. State & Persistence

### WizardState Changes

```typescript
// REMOVED
edsConfig.daLiveSite: string;
edsConfig.selectedSite: DaLiveSiteItem;
edsConfig.resetSiteContent: boolean;

// ADDED
edsConfig.sites: StorefrontSite[];

// UNCHANGED
edsConfig.daLiveOrg: string;
edsConfig.githubOwner: string;  // renamed from separate field
edsConfig.repoName: string;     // renamed from separate field
```

### Project Persistence (settings.json)

```json
{
  "edsConfig": {
    "daLiveOrg": "acme",
    "githubOwner": "skukla",
    "repoName": "my-demo",
    "sites": [
      {
        "id": "primary",
        "name": "my-demo",
        "daLiveSite": "my-demo",
        "role": "canonical",
        "storeMapping": {
          "defaultStoreViewCode": "default",
          "locales": [
            { "path": "/fr/", "storeViewCode": "french" }
          ]
        },
        "status": "published"
      },
      {
        "id": "brand-eu",
        "name": "brand-eu",
        "daLiveSite": "brand-eu",
        "role": "repoless",
        "storeMapping": {
          "defaultStoreViewCode": "eu_en",
          "locales": [
            { "path": "/de/", "storeViewCode": "eu_de" }
          ]
        },
        "status": "published"
      }
    ]
  }
}
```

### Per-Site Staleness Baselines

```typescript
// Current (single baseline)
project.edsStorefrontState: { envVars: Record<string, string> }

// New (per-site baselines)
project.edsStorefrontStates: Record<string, {
  siteId: string;
  envVars: Record<string, string>;
  lastPublished?: string;  // ISO timestamp
}>
```

---

## 11. Implementation Phases

### Phase 0: Foundation Fixes (Independent of Multi-Site)

Fix existing gaps that improve single-site AND lay groundwork:
- Relabel "Frontend" badge to "Storefront" for EDS projects (storefront status already shown there, just mislabeled)
- Show mesh endpoint on dashboard
- Make MESH_ENDPOINT visually read-only in Configure
- Move block library config into Configure screen
- Surface config staleness more prominently

### Phase 1: Repoless Architecture

Migrate from fstab.yaml to Configuration Service for ALL new projects:
- Replace `fstabGenerator.ts` usage with Config Service registration in pipeline
- Merge GitHub Repo Selection + DA.live Site Config into Storefront Configuration step
- One name → repo + canonical site
- Update pipeline phases (remove fstab push, add Config Service registration)
- Soft migration support for existing projects
- Data model: `daLiveSite: string` → `sites: StorefrontSite[]` (with single site)

### Phase 2: Multi-Site Creation

Enable multiple sites in the wizard:
- [+ Add Storefront] in Storefront Configuration step
- Additional sites as repoless Config Service entries
- Per-site content source selection
- Per-site execution in Storefront Setup pipeline
- Per-site progress tracking
- Review step shows storefront table

### Phase 3: Store Structure & Per-Site Config

Connect EDS sites to Commerce store views:
- Store Structure step (fetch Commerce hierarchy, map to sites)
- Per-site store codes in Settings step
- config.json `multistore` section for locale paths
- Per-site config.json generation
- Configure screen with per-site store code editing

### Phase 4: Multi-Site Lifecycle

Full post-creation management:
- Site picker on Dashboard
- Manage Sites panel (add/remove/reset/republish per site)
- Per-site staleness detection and republish
- Multi-site reset (per-site or all)
- Multi-site delete with per-site cleanup options
- Edit mode with site management

### Phase 5: Commerce Data (Future)

Depends on Data Installer research:
- Commerce Data wizard step
- Datapack selection per store context
- Data installation in pipeline
- Data reset/re-install

### Phase Summary

| Phase | What | Depends On | New Steps | Modified Steps |
|-------|------|-----------|-----------|----------------|
| 0 | Dashboard/Configure fixes | Nothing | 0 | 2 |
| 1 | Repoless architecture | Phase 0 | 1 (merged) | 3 |
| 2 | Multi-site creation | Phase 1 | 0 | 3 |
| 3 | Store structure + per-site config | Phase 2 | 1 | 2 |
| 4 | Multi-site lifecycle | Phase 3 | 0 | 5 |
| 5 | Commerce data | Phase 4 + Data Installer | 1 | 1 |
