# Multi-Locale Storefront — Implementation Plan (Phase 1)

## Provenance

- **Captured**: 2026-05-19 from `/rptc:research` sessions on multisite/multi-locale
- **Status**: Draft plan — iterating before implementation begins
- **Research base**: [`docs/research/2026-05-19-multisite-multillocale-research.md`](../../docs/research/2026-05-19-multisite-multillocale-research.md) — underlying research artifact this plan refines
- **Architecture seam**: [ADR-003: Multisite Architecture Seam](../../docs/architecture/adr/003-multisite-architecture-seam.md) — accepted; documents where the single-environment assumption is encoded so this plan can scope concretely
- **Superseded predecessors** (deleted 2026-05-23 on migration to backlog): 2026-03-25 design / implementation-roadmap / UX-spec series in `docs/research/`. Git history preserves them
- **Moved to backlog**: 2026-05-23

---

## Scope Decisions (User-Confirmed)

| Question | Answer |
|---|---|
| When to configure locales | Both (wizard at creation time + dashboard "Add locale" action) |
| Backend types | PaaS + ACCS, with optional ACO addon (ACO is a catalog service layer on top of PaaS/ACCS, not a standalone backend) |
| DA.live locale content | Copy default locale as placeholder; store-switcher fully provisioned |
| Store switcher | Demo Builder provisions it |

---

## What Gets Built

### Wizard — Business Structure Step (Repurposed `settings` Step)

The existing `settings` step is repurposed as **"Business Structure"** — a broader container that owns the full question of how a Commerce instance maps to brands and regions. The step ID stays `settings` (no changes to `wizard-steps.json` or `stepFiltering.ts`); only the display label changes. `ConnectStoreStepContent.tsx` grows two new progressive sections.

The name "Business Structure" is intentionally scoped to hold the full hierarchy across both phases:
- One brand, one locale
- One brand, multiple locales (Phase 1)
- Multiple brands, each with their own locales (Phase 2)

A subtitle grounds the abstract name in context: *"Connect your Commerce backend and configure the regions and brands your storefront serves."*

**Step structure (four sections, progressively unlocked):**

1. **Connection** — endpoint URL, client ID, client secret → triggers store discovery
2. **Primary Store** — website → store group → store view (same cascading pickers as today; gate: `storeSelectionComplete`). When the ACO addon is active, two additional fields appear after the store view is selected: primary ACO Catalog View ID (UUID from ACO admin) and primary scope locale code (e.g., `en-US`). These feed the `default` block in `config.json`.
3. **Regions & Locales** *(new — Phase 1)* — unlocks after primary store view selected
4. **Additional Brands** *(reserved — Phase 2)* — repoless multi-brand, not built in Phase 1

**Section 3 — Regions & Locales:**

A single "Serve customers in multiple languages or regions?" prompt appears after the primary store view is chosen. If the user selects Yes, a checkbox list of remaining discovered store views appears (from the already-cached `CommerceStoreStructure`). Store discovery always runs against the base backend (PaaS or ACCS) regardless of whether ACO is selected — ACO is a catalog layer on top, not a replacement backend.

**Auto-resolution from discovery cache:** Each store view in `CommerceStoreStructure` carries its parent store group and parent website. When the user checks a store view, `storeCode` and `websiteCode` resolve automatically — no additional picker needed. The user sees only the store view and the URL path.

Each checked locale row renders fields appropriate to the project's addon selection:

**Base backend only (PaaS or ACCS, no ACO addon):**
Each locale row shows the store view code (read-only, from discovery) and an editable URL path (pre-filled with the store view code). `storeCode` and `websiteCode` are resolved silently from the cache. Config generation emits `Magento-Store-View-Code`, `Magento-Store-Code`, and `Magento-Website-Code` headers per locale path.

**Base backend + ACO addon:**
Each locale row shows the store view code (read-only), an ACO Catalog View ID field (UUID from ACO admin — cannot be auto-discovered, must be pasted), and an editable URL path. The relationship is 1:1: each Commerce store view syncs to one ACO Catalog Source, which backs one or more ACO Catalog Views. Showing the store view code alongside the UUID field helps the user identify which Catalog View to look up in ACO admin. Config generation emits `ac-view-id` and `ac-scope-locale` headers per locale path (note: `ac-scope-locale`, not `ac-source-locale`).

```
Without ACO addon:
  [✓] French Canada    store view: fr_ca    path: /fr-ca/
       └── storeCode: ca-store, websiteCode: base  (resolved from cache, not shown to user)

With ACO addon:
  [✓] French Canada    store view: fr_ca    ACO Catalog View ID: [______]    path: /fr-ca/
       └── storeCode: ca-store, websiteCode: base  (resolved from cache, not shown to user)
```

**Intent-first UX:** users answer "who do you want to serve?" — not "configure your locale headers." Store view codes, store codes, and website codes are all pre-populated from discovery; the only freeform inputs are the URL path (pre-filled) and ACO Catalog View IDs (paste-only, shown only when ACO is active).

**Discovery refresh:** A "Refresh" link at the top of the checkbox list re-runs store discovery against the live backend and merges the results with any existing selections. A "Last checked: X ago" timestamp shows when discovery data was last fetched. Selections already made are preserved across a refresh — a newly discovered store view appears as an unchecked row alongside existing checked ones.

**Manual fallback:** A collapsed "Don't see your store? Add manually" section below the list provides freeform entry for cases where discovery is incomplete, fails, or the user wants to configure a locale before the store view exists in Commerce Admin. Fields: store view code (required), URL path (pre-filled from store view code), storeCode (optional, auto-resolved from discovery if available), websiteCode (optional, auto-resolved), and ACO Catalog View ID (when ACO addon active). Manual entries are validated identically to discovered entries and stored in the same `additionalLocales` shape. The fallback is visually secondary — a small link below the list, not a peer to the checkbox experience.

**URL path validation:** Inline validation on the URL path field covers three cases: (1) duplicate path — error, blocks Continue; (2) invalid format (must start and end with `/`, no special characters) — error, blocks Continue; (3) pattern divergence from existing locale paths (e.g., others use `/en-us/` but user enters `/fr/`) — warning, does not block. The warning reads: "Other locales use a different path format. Make sure your paths are consistent."

**ACO completion state (wizard):** If the user checks a locale but leaves the ACO Catalog View ID blank, a soft warning appears on the Section 3 summary before Continue: "No ACO Catalog View ID for French Canada. Add it from the Locales tab after setup." This does not block wizard completion — the locale is provisioned with its DA.live folder and config.json path block, but the `ac-view-id` header is omitted until the UUID is supplied.

**Phase 2 extension:** Section 4 ("Additional Brands") slots into the same step later without structural changes. "Business Structure" holds its meaning at both the locale level and the brand level.

### Dashboard — "Add Locale" Action (Post-Creation)

A new "Locales" tile on the per-project dashboard ActionGrid navigates to the Configure screen's Locales tab (`activeView='locales'`). The Locales tab runs the same provisioning logic as the wizard path but against the live project state. The kebab menu on the projects home screen card also gains a "Manage Locales" item for EDS projects.

### Configure Screen — Locales Tab

A third tab ("Locales") added beside "Configuration" and "AI Setup" in `ConfigureScreen.tsx`. This is the primary post-creation locale management surface.

**Contents:**
- Completion summary header: "X of Y locales complete" — shown when ACO addon is active and any locale is missing a Catalog View ID. Drives a quick visual scan without opening each row.
- List of provisioned locales, one row per locale:
  - Folder path (e.g., `/fr-ca/`)
  - Store view code (always shown — from base PaaS/ACCS backend)
  - ACO Catalog View ID (shown only when ACO addon is active):
    - Configured: shown truncated with a copy icon
    - Missing: amber "ACO not configured" badge — tapping opens the inline edit form
  - Publish status badge (published / stale / not published)
  - "Edit" action — opens inline form to update URL path, ACO Catalog View ID, or scope locale without removing and re-adding the locale. Saving calls `republishStorefrontConfig()`.
  - "Remove" action (deletes DA.live locale folder, removes path block from `config.json`)
- "Add Locale" button — inline form or modal containing the same discovery-first UI as the wizard's Section 3 (checkbox list + refresh + manual fallback), scoped to store views not yet provisioned
- "Republish Config" button — regenerates `config.json` and calls `republishStorefrontConfig()`
- Right column `NavigationPanel` shows locale list with status dots (green = complete, amber = ACO not configured)

**Discovery in the Add Locale form:** Store views are fetched from cached `storeDiscoveryData`. A "Refresh stores" link re-runs discovery and updates the list without clearing other form state. Manual fallback ("Add manually") is available here as in the wizard Section 3.

**Save handler:** Adding, editing, or removing a locale calls `republishStorefrontConfig()` — the existing function that regenerates `config.json`, pushes to GitHub, and publishes to CDN.

### Config Generation — Path-Keyed Header Blocks

`configGenerator.ts` accepts `additionalLocales?: LocaleConfig[]`. Each entry produces a path-keyed block in `config.json`.

**PaaS/ACCS output per locale:**
```json
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
```

**ACO default block (complete):**

ACO requires `adobe-commerce-optimizer: true` in the default block as the master switch for drop-in components. The `all.Store` header is omitted — ACO routing uses `ac-view-id`, not the Magento store header. The `commerce-core-endpoint` points to the PaaS/ACCS base backend for transactional operations (cart, checkout, account), which ACO does not serve.

```json
"default": {
  "adobe-commerce-optimizer": true,
  "commerce-endpoint": "https://na1.api.commerce.adobe.com/{tenantId}/graphql",
  "commerce-core-endpoint": "https://{paas-host}/graphql",
  "headers": {
    "cs": {
      "ac-view-id": "{defaultCatalogViewId}",
      "ac-scope-locale": "en-US"
    }
  }
}
```

**ACO output per locale:**

Only the locale-specific overrides are needed in each path block. Note the correct header name is `ac-scope-locale` (not `ac-source-locale`).

```json
"/fr-ca/": {
  "headers": {
    "cs": {
      "ac-view-id": "<uuid-from-aco-admin>",
      "ac-scope-locale": "fr-CA"
    }
  }
}
```

**ACO transactional layer:** Cart, checkout, and account calls go to `commerce-core-endpoint` (PaaS/ACCS) using standard Magento store view headers. A multi-locale ACO storefront maintains two parallel header patterns — ACO headers for catalog paths (`cs`), Magento headers for transactional paths.

**ACO analytics block:** ACO uses entirely different analytics fields (`environment-id`, `view-id`, `locale`, `store-view-currency-code`, `storefront-template`) instead of PaaS fields (`store-id`, `store-name`, `website-id`, etc.). `configGenerator.ts` must emit the correct analytics block per environment type.

### DA.live Provisioning — Locale Folders + Store Switcher

The EDS pipeline (`edsPipeline.ts`) gains a new `locale-setup` operation inserted between `content-copy` and `eds-settings`. For each additional locale it:

1. Creates the locale folder path in DA.live (e.g., `/fr-ca/`)
2. Copies the default locale's content tree into that folder as a placeholder
3. Writes a `store-switcher` document in the locale folder listing all active locales with `#nolocal` links

When a locale is added post-creation (from the Locales tab), steps 1–3 run against the live project, then `republishStorefrontConfig()` re-syncs `config.json` to CDN. Every existing locale folder's store-switcher document is also updated to include the new locale.

### Config Service — Per-Locale PDP Path Mappings

After site registration (Phase 3), one POST per locale for the PDP path mapping:
```
/en/products/ → /en/products/default
/fr-ca/products/ → /fr-ca/products/default
```

### Mesh Config — Dynamic Header Forwarding

**PaaS/ACCS projects:** Instead of hardcoding `"Magento-Store-View-Code": "citisignal_us"`, the mesh config uses dynamic context forwarding so all locale paths flow through a single mesh deployment. This requires a research spike at implementation time to confirm the exact header forwarding syntax for the API Mesh version in use.

**ACO projects:** API Mesh is not required for catalog reads. The ACO GraphQL endpoint (`https://{region}.api.commerce.adobe.com/{tenantId}/graphql`) is a direct public endpoint — the storefront connects to it without a mesh proxy. A mesh would only be needed for custom transformations or to proxy transactional PaaS/ACCS calls alongside ACO catalog calls. No ACO-specific mesh template exists or is needed.

### State Shape (Additive, Backward Compatible)

```typescript
// Additive fields on Project.commerce.instance — existing storeView scalar stays unchanged

// Discovery metadata:
storeDiscoveryTimestamp?: number;   // Unix ms — when discovery last ran; drives "Last checked: X ago" label and cache invalidation decisions

// Primary locale ACO fields (present only when adobe-commerce-aco addon is active):
primaryCatalogViewId?: string;  // UUID from ACO admin — feeds ac-view-id in config.json default block
primaryScopeLocale?: string;    // e.g., "en-US" — feeds ac-scope-locale in default block

// Additional locales (Phase 1 multi-locale):
additionalLocales?: Array<{
  folderPath: string;         // e.g., "/fr-ca/" — DA.live folder name; must match the config.json path key
  storeViewCode: string;      // from discovery or manual entry — always present (PaaS or ACCS base backend)
  storeCode: string;          // auto-resolved from CommerceStoreStructure cache, or manually entered
  websiteCode: string;        // auto-resolved from CommerceStoreStructure cache, or manually entered
  source: 'discovered' | 'manual';  // tracks whether the entry came from discovery or the manual fallback
  // Present only when ACO addon is active:
  catalogViewId?: string;     // UUID from ACO admin — 1:1 with storeViewCode; absent = amber "ACO not configured" state
  scopeLocale?: string;       // e.g., "fr-CA" — maps to ac-scope-locale header
}>
```

`storeViewCode`, `storeCode`, and `websiteCode` are populated from store discovery against the base PaaS/ACCS backend, or from manual entry when the fallback path is used. `storeCode` and `websiteCode` auto-resolve from `CommerceStoreStructure` for discovered entries — the user never types them. `catalogViewId` and `scopeLocale` are populated only when the `adobe-commerce-aco` addon is active; a missing `catalogViewId` triggers the amber incomplete state in the Locales tab. `storeDiscoveryTimestamp` is updated on every successful discovery run (wizard connection + Locales tab refresh). Existing single-locale projects continue to work as-is. No migration required.

---

## Guided UX Approach

The Business Structure step answers a single question: **"Who do you want to serve?"** Every technical selection across Commerce, EDS, and ACO flows from the user's answer.

### One Intent → Three Systems

When a user selects a region to serve, Demo Builder configures all three layers automatically:

| User intent | Commerce backend | EDS Storefront | ACO (if active) |
|---|---|---|---|
| "French Canada" | `fr_ca` store view (from discovery cache); `storeCode` and `websiteCode` auto-resolved | `/fr-ca/` path block in `config.json` + DA.live folder + store-switcher doc | Catalog View UUID → `ac-view-id` in `/fr-ca/` block |
| "German Germany" | `de_de` store view (from discovery cache); `storeCode` and `websiteCode` auto-resolved | `/de/` path block in `config.json` + DA.live folder + store-switcher doc | Catalog View UUID → `ac-view-id` in `/de/` block |

Discovery runs against the base PaaS/ACCS backend and returns the full three-level hierarchy. The available store views become the option list. The user checks which ones to serve — no hierarchy navigation, no code entry.

### Unified Selection Surface

Section 3 condenses all technical choices into a single checkbox list. Each row expands to show only the fields the user must provide:

```
┌─────────────────────────────────────────────────────────────────┐
│  Select the regions you want to serve   Last checked: 2m ago ↺  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☑  English (US)                              [primary]        │
│     path: /en/                                                  │
│                                                                 │
│  ☐  French (Canada)                                             │
│     path: /fr-ca/ [editable]                                    │
│     ACO Catalog View ID: [________________________] ← paste    │
│     Where to find this ↗  (store view: fr_ca)                  │
│                                                                 │
│  ☐  German (Germany)                                            │
│     path: /de/ [editable]                                       │
│     ACO Catalog View ID: [________________________]             │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  ▸ Don't see your store? Add manually                           │
│  ─────────────────────────────────────────────────────────────  │
│  What gets set up for each region you add:                      │
│    ✓  Storefront headers configured in config.json              │
│    ✓  Content folder created in your DA.live site               │
│    ✓  Store switcher set up for visitors                        │
└─────────────────────────────────────────────────────────────────┘
```

The `↺` refresh icon re-runs store discovery and updates the list, preserving existing selections. "Last checked: X ago" tells the user how fresh the data is.

The "Add manually" row expands to a small form: store view code, URL path (pre-filled), and ACO Catalog View ID (when ACO active). It is collapsed by default so it doesn't compete with the primary discovery-driven experience.

**Minimal user inputs:**
- **URL path** — pre-filled from the store view code; editable if a different slug is preferred (e.g., `/fr-ca/` → `/fr/`); validated for format, uniqueness, and pattern consistency
- **ACO Catalog View ID** — paste-only field, shown only when ACO addon is active; the irreducible friction point (ACO admin is the only source of truth)

The "Where to find this" link opens a deep-link to the ACO admin Catalog Views list. The store view code shown inline (e.g., "store view: fr_ca") gives the user enough context to locate the correct UUID without switching documentation pages.

**ACO UUID as irreducible friction.** ACO Catalog View IDs cannot be discovered via API — they exist only in the ACO admin UI. This is the one field Demo Builder cannot prefill or auto-resolve. Every other field in the locale row is either read from discovery or auto-derived. If the user doesn't have the UUID at wizard time, they can skip it and supply it later from the Locales tab — the locale is provisioned without the `ac-view-id` header and surfaces an amber "ACO not configured" state until the UUID is added.

### What the User Never Sees

The guided approach absorbs the following technical complexity:

| System | Absorbed complexity |
|---|---|
| Commerce backend | Three-level hierarchy resolution (website → store group → store view); `storeCode` and `websiteCode` auto-resolved from the discovery cache — never entered manually |
| EDS config | `config.json` path-keyed block structure and header names (`Magento-Store-View-Code`, `Magento-Store-Code`, `Magento-Website-Code`); `adobe-commerce-optimizer: true` master switch; dual `commerce-endpoint` / `commerce-core-endpoint` pattern for ACO |
| EDS provisioning | DA.live folder creation and content copy; store-switcher document provisioning and `#nolocal` link wiring; Config Service PDP path mapping POSTs per locale |
| ACO headers | Distinction between ACO catalog headers (`ac-view-id`, `ac-scope-locale`) and PaaS transactional headers (`Store`, `Magento-Store-View-Code`); header routing by path prefix; analytics block field differences between ACO and PaaS |

The wizard never exposes Commerce hierarchy levels, config file structure, header names, DA.live path conventions, or the separation between catalog and transactional headers. Demo Builder's job is to translate "serve French Canada" into correct configuration across all three layers.

---

## UX Touchpoints

Every surface touched by multi-locale implementation. Zero net-new screens — all changes insert into existing surfaces.

### 1. Project Creation Wizard

| What changes | Type | Key file |
|---|---|---|
| `settings` step repurposed as "Business Structure" — display label change only, step ID unchanged | Rename label | `wizard-steps.json` |
| `ConnectStoreStepContent.tsx` Section 2: ACO Catalog View ID + scope locale fields appear after primary store view selection when ACO addon is active | Extend existing component | `ConnectStoreStepContent.tsx` |
| `ConnectStoreStepContent.tsx` gains Section 3 (Regions & Locales) after primary store view selected | Extend existing component | `ConnectStoreStepContent.tsx` |
| Section 3: checkbox list of discovered store views; `storeCode`/`websiteCode` auto-resolved from `CommerceStoreStructure` cache | New UI within existing step | `ConnectStoreStepContent.tsx` |
| Section 3: "Last checked: X ago ↺" refresh action — re-runs discovery and merges results without clearing selections | New UI within existing step | `ConnectStoreStepContent.tsx` |
| Section 3: "Don't see your store? Add manually" collapsed fallback — store view code + URL path + ACO UUID (when active) | New UI within existing step | `ConnectStoreStepContent.tsx` |
| Section 3: ACO Catalog View ID field per locale row (shown only when `adobe-commerce-aco` addon active); skippable with soft warning on Continue | New UI within existing step | `ConnectStoreStepContent.tsx` |
| Section 3: URL path inline validation — duplicate, format, and pattern-divergence checks | New validation within existing step | `ConnectStoreStepContent.tsx` |
| `storefront-setup` pipeline gains `locale-setup` operation | Extend pipeline | `edsPipeline.ts` |
| `StorefrontSetupPartialState` gains `localeFoldersCreated: string[]` + `storeSwitcherWritten` for cancel cleanup | Extend type | `storefrontSetupHandlers.ts` |

**Pipeline insertion point:**
```
EDS Pipeline (edsPipeline.ts)
  content-clear
  content-copy          ← existing
  [NEW] locale-setup    ← create locale folders + store-switcher docs
  block-library
  eds-settings
  cache-purge
  content-publish
  library-publish
```

### 2. Per-Project Dashboard

| What changes | Type | Key file |
|---|---|---|
| Status header row adds one `StatusCard` badge per locale (e.g., "fr-CA: published") | Extend existing | `ProjectDashboardScreen.tsx` |
| ActionGrid gains a "Locales" tile (navigates to Configure → Locales tab) | Add one tile | `useDashboardActions.ts` |

### 3. Configure Screen

| What changes | Type | Key file |
|---|---|---|
| New "Locales" third tab beside Configuration and AI Setup | New tab component | `ConfigureScreen.tsx` + new `LocalesTab.tsx` |
| "Add Locale" form with discovery-first checkbox list, refresh action, and manual fallback — same UX as wizard Section 3 | New within tab | `LocalesTab.tsx` |
| "Edit" action per locale row — updates URL path, ACO Catalog View ID, or scope locale inline without remove/re-add | New within tab | `LocalesTab.tsx` |
| Completion summary header: "X of Y locales fully configured" (shown when ACO active and any locale is missing a UUID) | New within tab | `LocalesTab.tsx` |
| Amber "ACO not configured" badge per locale row when `catalogViewId` is absent and ACO addon is active | New within tab | `LocalesTab.tsx` |

### 4. Projects Home Screen (Card Grid)

| What changes | Type | Key file |
|---|---|---|
| Card body adds locale summary line below brand/stack text ("3 locales: en-US, fr-CA, de-DE") | Extend existing | `ProjectCard.tsx` |
| Kebab menu adds "Manage Locales" item for EDS projects | Extend existing | `ProjectActionsMenu.tsx` |

### 5. Import / Export

| What changes | Type | Key file |
|---|---|---|
| `SettingsFile` schema version bump (1 → 2) + `locales?: LocaleConfig[]` field | Extend schema | `settingsFile.ts` |
| Serialize/deserialize `additionalLocales` on export/import | Extend serializer | `settingsSerializer.ts` |
| v1 import handled gracefully (no `locales` = single-locale, backward compatible) | Extend importer | `settingsSerializer.ts` |

### 6. Reset Flow

| What changes | Type | Key file |
|---|---|---|
| Reset pipeline loops over all provisioned locales (re-copy content, re-write store-switcher) | Extend pipeline | `edsResetService.ts` |
| Optional VS Code `QuickPick` multi-select: choose which locales to reset (default: all) | Optional new UI | `edsResetUI.ts` |

### 7. Delete Flow

No change for Phase 1. Locale folders live inside the single DA.live site and are deleted with it. Phase 2 (repoless multi-brand, separate DA.live site per locale) would add cleanup checkboxes.

### 8. Sidebar Navigation

| What changes | Type | Key file |
|---|---|---|
| "Locales" nav item added to per-project nav list (EDS projects only, shown when `additionalLocales.length > 0`) | Extend nav items | `SidebarNav.tsx` / nav items helper |

---

## Implementation Steps

| Step | What | Effort | Cycle |
|---|---|---|---|
| 1 | State types: `additionalLocales` on `Project.commerce.instance`, `LocaleConfig` type (with `source` field); `primaryCatalogViewId` + `primaryScopeLocale` for ACO default block; `storeDiscoveryTimestamp` | Small | A |
| 2 | `configGenerator.ts` — multi-locale path-keyed block generation (PaaS/ACCS + ACO); omit `ac-view-id` block when `catalogViewId` absent | Small–Medium | A |
| 3 | Wizard: Section 3 checkbox list from discovery + URL path inline validation (duplicate, format, pattern-divergence) | Medium | A |
| 4 | Wizard: discovery refresh action ("Last checked: X ago ↺") — re-runs store discovery, merges results, preserves selections; updates `storeDiscoveryTimestamp` | Small | A |
| 5 | Wizard: "Add manually" collapsed fallback — store view code, URL path, storeCode, websiteCode, ACO UUID (when active); `source: 'manual'` on state entry | Small | A |
| 6 | Wizard: ACO Catalog View ID field per locale row (when addon active); soft warning on Continue if UUID blank | Small | A |
| 7 | `edsPipeline.ts`: `locale-setup` operation (DA.live folder creation + content copy) | Medium | B |
| 8 | DA.live: store-switcher document write + update-on-add across all locale folders | Medium | B |
| 9 | Config Service: per-locale PDP folder mappings POST | Small | B |
| 10 | `StorefrontSetupPartialState` locale tracking + cancel cleanup for locale folders | Small | B |
| 11 | Mesh config: dynamic header forwarding (research spike required) | Medium | C |
| 12 | `LocalesTab.tsx`: locale list with completion status dots, completion summary header, "Add Locale" form (discovery + refresh + manual fallback), "Edit" action, "Remove" action, publish status, amber ACO badge | Medium | D |
| 13 | Configure screen: add Locales tab + `activeView='locales'` support | Small | D |
| 14 | Dashboard: Locales tile + per-locale status badges in header row | Small | D |
| 15 | Projects home: locale summary line on card + "Manage Locales" kebab item | Small | D |
| 16 | Import/Export: `locales` field in `SettingsFile` + serialization | Small | D |
| 17 | Sidebar: "Locales" nav item for EDS projects | Small | D |
| 18 | Reset: multi-locale aware pipeline + optional per-locale QuickPick | Small | D |

**`/rptc:feat` grouping:**
- **Cycle A prerequisites** — Three P0 ACO config generation fixes required before multi-locale ACO work can build correctly:
  1. Add `"configFlags": { "adobe-commerce-optimizer": true }` to the `adobe-commerce-aco` addon entry in `components.json` — the `injectAddonConfigFlags()` path already handles injection; it just has no data for ACO today
  2. Fix `mapBackendToEnvironmentType()` / `extractConfigParams()` to detect the ACO addon via `project.selectedAddons` and switch to `EnvironmentType.aco` — the `'adobe-commerce-aco'` case in the switch is currently unreachable because the function receives the backend component ID, not the addon ID
  3. Remove `all.Store` from ACO header generation in `generateHeaders()` — ACO routing uses `ac-view-id` only; the `Store` header is a PaaS/ACCS concern
  4. Correct the ACO analytics block in `configGenerator.ts` — emit `environment-id`, `view-id`, `locale`, `store-view-currency-code`, `storefront-template` instead of the PaaS `store-id`/`website-id` fields
- **Cycle A** — Steps 1–4: types + config generation + wizard locale selection
- **Cycle B** — Steps 5–8: DA.live provisioning pipeline + store-switcher + Config Service mappings
- **Cycle C** — Step 9: mesh spike + dynamic header forwarding
- **Cycle D** — Steps 10–16: all post-creation UI surfaces (Locales tab, dashboard, cards, import/export, sidebar, reset)

---

## Open Questions (Pending Iteration)

*To be refined in conversation before Cycle A begins.*

---

## Not in Scope

- Creating Commerce store views via REST API (GET-only; admin UI only)
- Creating ACO Catalog Sources or Catalog Views (UI-only in ACO admin — these must exist before the wizard runs)
- Commerce backend tenant provisioning
- Multiple GitHub repos per project (Repoless eliminates this need)
- Phase 2 (repoless multi-brand, separate DA.live site per locale) — separate planning effort

## ACO Architecture Notes (Awareness)

These are not implementation tasks but inform how the system works and where its limits are:

- **One ACO tenant serves all brands and locales.** No per-brand or per-locale ACO instance is needed. Locale differentiation is handled entirely through Catalog Views and headers.
- **Data flow:** PaaS store view → ACO Catalog Source (1:1 sync) → ACO Catalog View (the serving layer the storefront queries). One Catalog View per locale is the minimum; multiple brands in one locale can share a Catalog View using `AC-Policy-*` runtime headers.
- **Transactional split:** ACO handles catalog only (product listing, PDP, search). Cart, checkout, and account continue hitting the PaaS/ACCS `commerce-core-endpoint`. Multi-locale ACO storefronts maintain two parallel header patterns in `config.json`.
- **Platform limits (relevant for planning):** 50 Catalog Sources per ACO instance; 100 Catalog Variations base (Catalog Views × Price Books). A 5-locale × 3-brand setup with separate price books per brand = 45 variations — within limits. These are not Demo Builder concerns but customers planning large deployments should be aware.
- **DA.live and store-switcher are backend-agnostic.** The locale folder structure, `#nolocal` store-switcher pattern, and Config Service PDP path mappings are identical for PaaS and ACO projects.

---

## Kickoff prompt

```
/rptc:feat "Execute the multi-locale storefront Phase 1 plan at
.rptc/backlog/2026-05-19-multisite-multilocale.md. Re-confirm the
user-approved scope decisions with the maintainer first (the plan was
last edited 2026-05-19 — verify ACO-on-PaaS/ACCS specifics and the
store-switcher provisioning approach before implementation begins).
Implement the wizard Business Structure step redesign first, then
per-locale config generation. Standing rule: do not encode new
single-environment assumptions — see ADR-003 for the documented seam.
Phase 2 (repoless multi-brand, separate DA.live site per locale) is
out of scope for this cycle."
```
