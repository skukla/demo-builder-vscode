# Demo Data & Multi-Site — Implementation Roadmap

**Date**: 2026-03-25
**Status**: Implementation planning
**Companion docs**:
- `20260325-demo-data-and-multisite-design.md` (research)
- `20260325-demo-data-multisite-ux-spec.md` (UX specification)

---

## Guiding Principles

### 1. Every Milestone Is Shippable
Each milestone produces a working extension that can be released. No milestone leaves the extension in a broken or half-finished state.

### 2. Current Behavior Preserved Until Explicitly Changed
The data model changes first, but user-visible behavior stays identical until a later milestone intentionally changes it. This means we can validate the foundation before building on it.

### 3. Test Before You Build On
Each milestone has acceptance criteria. Don't start the next milestone until the current one passes. This creates natural checkpoints where we can adjust direction based on what we learn.

### 4. Feedback Loops Are Built In
After milestones that change user-facing behavior, pause for testing and feedback. The plan identifies which milestones are "feedback gates."

### 5. Defer Decisions Until Forced
Some design questions don't need answers until a specific milestone. These are flagged as "decide at milestone N" rather than decided upfront.

---

## Milestone Overview

```
M0: Foundation fixes (independent, no multi-site)
 │
M1: Data model migration (sites[] with length 1, same UX)
 │
M2: Repoless architecture (Config Service replaces fstab)
 │
M3: Merged wizard step (Storefront Configuration)
 │
 ├── FEEDBACK GATE: Test single-site creation end-to-end
 │
M4: Multi-site creation (add storefronts in wizard)
 │
M5: Multi-site pipeline (per-site execution + progress)
 │
 ├── FEEDBACK GATE: Test multi-site creation end-to-end
 │
M6: Dashboard site awareness (site picker + per-site status)
 │
M7: Site management (add/remove/reset/republish per site)
 │
M8: Configure per-site (store codes + scoped staleness)
 │
 ├── FEEDBACK GATE: Test full multi-site lifecycle
 │
M9: Store Structure step (Commerce API + mapping)
 │
M10: Commerce credentials (connectivity + SecretStorage)
 │
 ├── FEEDBACK GATE: Test store discovery + mapping
 │
M11: Commerce Data step (future, depends on Data Installer)
```

---

## Milestone Details

### M0: Foundation Fixes

**Goal**: Fix existing dashboard/configure gaps that improve single-site experience AND lay groundwork for multi-site.

**Independent of multi-site. Can ship anytime.**

| Task | What Changes | Files |
|------|-------------|-------|
| Relabel "Frontend" badge to "Storefront" for EDS projects | Badge exists but shows storefront status under "Frontend" label — mislabeled | `useDashboardStatus.ts`, `ProjectDashboardScreen.tsx` |
| Show mesh endpoint URL on dashboard | New text row below action buttons | `ProjectDashboardScreen.tsx` |
| Make MESH_ENDPOINT visually read-only in Configure | `isReadOnly` styling on field | Configure components |
| Surface config staleness more prominently | Inline indicator in dashboard, not just post-save notification | Dashboard + staleness detector |

**Acceptance criteria**:
- Dashboard shows 3 badges: Frontend, Mesh, Storefront (EDS projects)
- Mesh endpoint URL visible on dashboard without opening Configure
- MESH_ENDPOINT field clearly non-editable
- Stale storefront config shows indicator on dashboard

**Test plan**: Manual testing on existing single-site projects. No data model changes.

---

### M1: Data Model Migration

**Goal**: Change internal data model from `daLiveSite: string` to `sites: StorefrontSite[]` without changing any user-visible behavior.

**This is the riskiest milestone because it touches the most files. Everything after depends on it.**

| Task | What Changes | Files |
|------|-------------|-------|
| Define new types | `StorefrontSite`, `StoreSiteMapping`, `LocaleMapping`, extended `EDSConfig` | `src/types/webview.ts`, new `src/types/storefrontSites.ts` |
| Migrate WizardState | `daLiveSite` → `sites[0]` adapter layer | `useWizardState.ts`, `wizardHelpers.ts` |
| Migrate EDSConfig | Add `sites[]`, keep old fields as computed getters for backward compat | `webview.ts` |
| Migrate SettingsEdsConfig | Project persistence reads/writes `sites[]` | `settingsFile.ts` |
| Migrate component metadata | `metadata.daLiveSite` → `metadata.sites[0]` | `edsResetService.ts`, `cleanupService.ts` |
| Migrate setup handlers | Read from `sites[0]` instead of `daLiveSite` | `storefrontSetupHandlers.ts`, `storefrontSetupPhases.ts` |
| Migrate cleanup/delete | Read from `sites[0]` instead of `daLiveSite` | `cleanupService.ts`, `projectDeletionService.ts` |
| Migrate config generator | Read from `sites[0]` | `configGenerator.ts` |
| Migrate staleness detector | Baseline keyed by `sites[0].id` | `storefrontStalenessDetector.ts` |
| Add migration logic | Existing projects auto-migrate on load: `{ daLiveSite: "x" }` → `{ sites: [{ daLiveSite: "x", role: "canonical" }] }` | State loading code |

**Acceptance criteria**:
- All existing tests pass (with updated mocks/fixtures)
- Create a new project → works identically to before
- Load an existing project → auto-migrated, works identically
- Reset an existing project → works identically
- Delete an existing project → cleanup works identically
- `sites[]` always has exactly 1 entry for single-site projects

**Test plan**:
- Full test suite passes
- Manual: create project, verify state file has `sites[]` format
- Manual: load pre-migration project, verify auto-migration
- Manual: reset, delete, configure on migrated project

**Risk mitigation**: Keep old `daLiveSite` field as a computed getter (`get daLiveSite() { return this.sites[0]?.daLiveSite }`) during transition. Remove once all consumers are migrated.

---

### M2: Repoless Architecture

**Goal**: Replace fstab.yaml with Configuration Service registration for new projects. Existing projects continue to work.

| Task | What Changes | Files |
|------|-------------|-------|
| Add Config Service site registration to pipeline | `site-config` phase calls PUT instead of/alongside fstab push | `storefrontSetupPhases.ts` |
| Remove fstab generation for new projects | Skip fstab.yaml creation in `storefront-code` phase | `storefrontSetupPhases.ts` |
| Update reset to use Config Service | Re-register via PUT instead of re-pushing fstab | `edsResetService.ts` |
| Keep fstab support for existing projects | Detection: if fstab.yaml exists in repo, use legacy path | `storefrontSetupPhases.ts` |
| Update cleanup to delete Config Service entry | Delete site config on project deletion | `cleanupService.ts` |

**Acceptance criteria**:
- New project: no fstab.yaml in repo, site registered via Config Service
- New project: storefront loads correctly (content source from Config Service)
- Existing project with fstab: still works, no changes
- Reset new project: re-registers via Config Service
- Delete new project: Config Service entry removed

**Test plan**:
- Create new project → verify no fstab.yaml, verify Config Service registration
- Load content on new project's `.aem.live` URL → content resolves
- Reset new project → content re-copied, Config Service re-registered
- Create project with old extension version, load with new → fstab still works

**Decision deferred**: Config Service profile support (not needed until multi-site).

---

### M3: Merged Wizard Step

**Goal**: Combine GitHub Repo Selection + DA.live Site Config into single "Storefront Configuration" step.

| Task | What Changes | Files |
|------|-------------|-------|
| Create StorefrontConfigStep component | New step with unified name → repo + site | New `StorefrontConfigStep.tsx` |
| Implement "one name, two resources" UX | User types name, sees derived repo + site | `StorefrontConfigStep.tsx` |
| Implement content source selection | Dropdown from demo package `contentSource` | `StorefrontConfigStep.tsx` |
| Implement create new / use existing toggle | Reuse patterns from current steps | `StorefrontConfigStep.tsx` |
| Update wizard-steps.json | Remove `eds-repository-config` + `eds-data-source`, add `storefront-config` | `wizard-steps.json` |
| Update WizardContainer | Remove old cases, add new case | `WizardContainer.tsx` |
| Update WizardStep type | Add new step ID, deprecate old IDs | `webview.ts` |
| Update ReviewStep | Show unified storefront section | `ReviewStep.tsx` |

**Acceptance criteria**:
- Wizard shows single "Storefront Configuration" step instead of two
- User enters one name → repo + DA.live site created with matching names
- Content source dropdown works with all demo packages
- "Use Existing" mode shows site list (from DA.live) and repo list (from GitHub)
- Review step shows unified storefront info
- Project creation succeeds end-to-end

**Test plan**:
- Create project with each demo package → all work
- Create project with "Use Existing" repo → works
- Create project with "Create New" → repo + site names match
- Back navigation → state preserved

### ── FEEDBACK GATE ──

**Pause here.** Test single-site creation thoroughly with the new architecture:
- All demo packages work
- Reset works on new architecture
- Existing projects still work
- No regressions in wizard flow

**Adjust before proceeding if**:
- The merged step UX is confusing
- Config Service registration is unreliable
- Canonical site naming is too restrictive

---

### M4: Multi-Site Creation

**Goal**: Enable [+ Add Storefront] in the wizard for creating multi-site projects.

| Task | What Changes | Files |
|------|-------------|-------|
| Add [+ Add Storefront] button to StorefrontConfigStep | Appears after primary site is configured | `StorefrontConfigStep.tsx` |
| Implement additional site form | Create new / use existing, content source, any name | `StorefrontConfigStep.tsx` |
| Implement site list in right column | Shows configured sites, remove button (except primary) | `StorefrontConfigStep.tsx` |
| Mark additional sites as `role: 'repoless'` | Automatic — only first site is canonical | State logic |
| Update Settings step for per-site store codes | Table view when >1 site | `ComponentConfigStep.tsx` |
| Update ReviewStep for multi-site | Storefront table showing all sites | `ReviewStep.tsx` |
| Update state handling | `sites[]` can have length > 1 | All wizard state code |

**Acceptance criteria**:
- Can add 2+ storefronts in wizard
- First = canonical, additional = repoless
- Content source selectable per site
- Settings step shows per-site store code table
- Review step shows all sites
- Can remove added sites (except primary)
- Single-site flow unchanged if user doesn't click [+ Add]

**Test plan**:
- Create single-site project → identical to M3
- Create 2-site project → both sites appear in state
- Create 3-site project → all three in state
- Remove a site → removed from state, others unaffected
- Review step → shows all configured sites

---

### M5: Multi-Site Pipeline

**Goal**: Setup pipeline executes per-site for site-specific phases.

| Task | What Changes | Files |
|------|-------------|-------|
| Wrap site-specific phases in loop | Config registration, content copy, block library, publish → per site | `storefrontSetupPhases.ts` |
| Add per-site progress tracking | "Registering site 2 of 3 (brand-eu)..." | `StorefrontSetupStep.tsx`, progress callbacks |
| Register repoless sites via Config Service | PUT with `code.owner/repo` pointing to shared repo | `configurationService.ts` |
| Content copy per site | Copy from each site's `contentSource` to its DA.live site | `storefrontSetupPhases.ts` |
| Block library per site | Create block library in each DA.live site | `storefrontSetupPhases.ts` |
| Publish per site | Publish each site to CDN | `storefrontSetupPhases.ts` |
| Per-site error handling | If one site fails, continue others, show per-site status | `StorefrontSetupStep.tsx` |
| Generate per-site config.json | Each repoless site gets its own config | `configGenerator.ts` |
| Update partial state tracking | Track per-site completion for cleanup on cancel | `storefrontSetupHandlers.ts` |

**Acceptance criteria**:
- 2-site project: both sites created, registered, content copied, published
- Each site has its own `.aem.live` URL and it loads correctly
- Progress shows per-site detail
- If site 2 fails, site 1 is still complete
- Cancel mid-pipeline cleans up completed sites
- Config.json pushed with correct store codes per site

**Test plan**:
- Create 2-site project → both sites live at their `.aem.live` URLs
- Create 3-site project → all three work
- Simulate failure on site 2 → site 1 complete, site 3 attempted, error shown for site 2
- Cancel during site 2 setup → site 1 cleaned up (or kept, based on partial state)

### ── FEEDBACK GATE ──

**Pause here.** Test multi-site creation end-to-end:
- Multiple sites with different content sources
- Verify each site loads independently
- Verify config.json per site has correct store codes
- Verify the UX is understandable (is the wizard confusing with multiple sites?)

**Adjust before proceeding if**:
- Per-site progress is hard to follow
- Config Service registration fails for repoless sites
- Content copy to multiple targets is too slow
- The wizard flow needs restructuring

---

### M6: Dashboard Site Awareness

**Goal**: Project dashboard shows per-site information and allows site-scoped actions.

| Task | What Changes | Files |
|------|-------------|-------|
| Add SitePicker component | Dropdown at top of dashboard (hidden for single-site) | New `SitePicker.tsx` |
| Scope "Open Live Site" to selected site | Button opens selected site's `.aem.live` URL | `ProjectDashboardScreen.tsx` |
| Scope "Open DA.live" to selected site | Button opens selected site's DA.live URL | `ProjectDashboardScreen.tsx` |
| Show per-site storefront status | Storefront badge reflects selected site's status | `ProjectDashboardScreen.tsx` |
| Add site count to project cards | "2 storefronts" indicator on cards | `ProjectCard.tsx` |

**Acceptance criteria**:
- Multi-site project: site picker visible, switching changes URLs
- Single-site project: no picker shown
- "Open Live Site" opens correct URL for selected site
- Storefront status badge reflects selected site
- Project card shows site count for multi-site projects

**Test plan**:
- Open multi-site project → picker shows all sites
- Switch sites → URLs change, status badge changes
- Open single-site project → no picker, works as before

---

### M7: Site Management

**Goal**: Users can add/remove/reset/republish individual sites after creation.

| Task | What Changes | Files |
|------|-------------|-------|
| Create SiteManagementPanel | List of sites with per-site actions | New `SiteManagementPanel.tsx` |
| Add "Manage Sites" action to dashboard | Opens site management panel | `ProjectDashboardScreen.tsx` |
| Implement per-site reset | Clear + re-copy + re-register + republish for one site | `edsResetService.ts`, `edsResetUI.ts` |
| Implement per-site republish | Regenerate config.json + publish for one site | `storefrontRepublishService.ts` |
| Implement "Remove Site" | Delete DA.live content + Config Service entry | `cleanupService.ts` |
| Implement "Add Site" (post-creation) | Mini-wizard modal: name → content → progress | New `AddSiteModal.tsx` |
| Update project deletion | Per-site cleanup checkboxes | `projectDeletionService.ts` |
| Update "Reset All" flow | Choice: reset one or all, per-site progress | `edsResetUI.ts` |

**Acceptance criteria**:
- Can reset one site without affecting others
- Can republish one site's config without affecting others
- Can remove a repoless site (not primary)
- Can add a new repoless site to an existing project
- Delete project shows per-site cleanup options
- "Reset All" resets every site sequentially

**Test plan**:
- Reset one site → only that site's content replaced
- Republish one site → only that site's config.json updated
- Remove a site → DA.live content gone, Config Service entry gone, other sites unaffected
- Add a site → new site registered, content copied, published
- Delete project with mixed checkbox selections → correct sites cleaned up

---

### M8: Configure Per-Site

**Goal**: Configure screen supports per-site store codes and scoped staleness.

| Task | What Changes | Files |
|------|-------------|-------|
| Split Configure into project + storefront sections | "Project Settings" (shared) above "Storefront Settings" (per-site) | `ConfigureScreen.tsx` |
| Show per-site store code fields | Collapsible section per site with store view/store/website codes | `ConfigureScreen.tsx` |
| Per-site staleness detection | Baseline per site, detect which sites changed | `storefrontStalenessDetector.ts` |
| Scoped republish notifications | "Site 'brand-eu' config changed. Republish?" | Configure save handler |
| Update navigator | Show per-site completion in right column | Configure navigator |

**Acceptance criteria**:
- Project settings (Commerce URL, etc.) shown once
- Store codes shown per site in collapsible sections
- Changing one site's store code → only that site marked stale
- "Republish brand-eu" option (not forced to republish all)
- Single-site projects: no visible change from current

**Test plan**:
- Edit store code for site 2 → site 2 stale, site 1 unchanged
- Republish site 2 → site 2 published, site 1 untouched
- Edit project-level setting → all sites potentially stale

### ── FEEDBACK GATE ──

**Pause here.** Test full multi-site lifecycle:
- Create multi-site project
- Edit per-site settings in Configure
- Reset one site
- Add a new site
- Remove a site
- Delete project with mixed cleanup

**Adjust before proceeding if**:
- Per-site Configure UX is confusing
- Staleness detection per site has edge cases
- The number of UX surfaces touching multi-site is overwhelming

---

### M9: Store Structure Step

**Goal**: New wizard step that fetches Commerce store hierarchy and maps store views to EDS sites.

| Task | What Changes | Files |
|------|-------------|-------|
| Create CommerceStoreService | Fetches websites/stores/store views via REST API | New service |
| Create StoreStructureStep component | Dual-pane: Commerce tree + EDS site mapping | New step component |
| Implement store view → site assignment | Drag/assign interaction | `StoreStructureStep.tsx` |
| Implement locale path assignment | Second+ store view in same site gets `/locale/` path | `StoreStructureStep.tsx` |
| Auto-populate store codes from mapping | Settings step pre-fills from mapping | State flow |
| Add multistore section to config.json | Locale paths → store view codes | `configGenerator.ts` |
| Make step skippable | "Skip" button → configure later | `StoreStructureStep.tsx` |
| Add "Refresh Store Structure" to Configure | Re-fetch from Commerce in post-creation | `ConfigureScreen.tsx` |

**Acceptance criteria**:
- Step fetches live store hierarchy from Commerce backend
- User can assign store views to EDS sites
- Locale paths auto-generated for 2nd+ store view per site
- config.json includes correct `multistore` section
- Step skippable (not blocking)
- Can re-fetch in Configure screen after creation

**Test plan**:
- Connect to Commerce instance → tree displays correctly
- Assign store views → mapping saved correctly
- Skip step → project creates without mapping
- config.json → multistore section matches mapping

---

### M10: Commerce Credentials

**Goal**: Extension can authenticate against Commerce REST API for store discovery.

| Task | What Changes | Files |
|------|-------------|-------|
| Implement credential detection | Check existing env vars for admin credentials | New service |
| Implement PaaS admin token flow | POST `/V1/integration/admin/token` | New service |
| Implement ACCS OAuth flow | Client credentials → Bearer token (if I/O creds available) | New service |
| Create credential prompt UI | "Connect to Commerce" form (shown when creds missing) | `StoreStructureStep.tsx` |
| Store credentials in SecretStorage | Encrypted, per-project | New service |
| Add "Test Connection" button | Verify credentials before proceeding | `StoreStructureStep.tsx` |

**Acceptance criteria**:
- PaaS with admin creds in .env → auto-connects
- ACCS with I/O creds → attempts OAuth, connects if valid
- No creds → credential form shown, user enters, "Test Connection" works
- Credentials cached in SecretStorage → not re-prompted on next visit
- Invalid credentials → clear error message

**Test plan**:
- PaaS project with admin creds → Store Structure auto-loads tree
- ACCS project → OAuth flow → tree loads (or clear error if OAuth fails)
- Project with no creds → form shown, enter creds, test, proceed
- Reopen Store Structure → credentials cached, auto-connects

### ── FEEDBACK GATE ──

**Pause here.** Test store discovery and mapping:
- Verify Commerce REST API works for both PaaS and ACCS
- Verify store view mapping produces correct config.json
- Verify the UX flow from wizard through to working storefront

**Adjust before proceeding if**:
- ACCS doesn't support the store REST endpoints
- Credential management is too complex
- Store mapping UX needs simplification

---

### M11: Commerce Data Step (Future)

**Blocked on**: Data Installer deployment research with creator.

**Goal**: Wizard step for selecting datapacks to install into Commerce backend.

Details in UX spec. Implementation depends on Data Installer API surface.

---

## Dependency Graph

```
M0 (foundation fixes)
 │  no dependencies, can start immediately
 │
M1 (data model)
 │  depends on: nothing (but should follow M0)
 │
M2 (repoless)
 │  depends on: M1
 │
M3 (merged step)
 │  depends on: M2
 │
 ├── FEEDBACK GATE
 │
M4 (multi-site creation)    M6 (dashboard site awareness)
 │  depends on: M3            │  depends on: M1
 │                             │
M5 (multi-site pipeline)     M7 (site management)
 │  depends on: M4             │  depends on: M6 + M5
 │                             │
 ├── FEEDBACK GATE ────────────┤
 │                             │
M8 (configure per-site)      M9 (store structure)
 │  depends on: M7             │  depends on: M4
 │                             │
 ├── FEEDBACK GATE             M10 (commerce credentials)
 │                              │  depends on: M9
 │                              │
 │                              ├── FEEDBACK GATE
 │                              │
 └──────────────────────────────┴── M11 (commerce data, future)
```

**Parallelizable work**:
- M0 can happen anytime (independent)
- M6 (dashboard site awareness) can start after M1, in parallel with M2-M5
- M9 (store structure) can start after M4, in parallel with M6-M8

---

## Decision Registry

Decisions that can be deferred until a specific milestone:

| Decision | Decide At | Options |
|----------|-----------|---------|
| Config Service profile support | M5 | Use profiles for shared config across sites, or duplicate per site |
| Content source options for additional sites | M4 | Package content only, or also "empty" and "copy from other site" |
| Per-site CSS theming mechanism | M5 | Auto-generated from colors, manual file, or none initially |
| Store mapping interaction pattern | M9 | Drag-and-drop, dropdown assignment, or click-to-assign |
| ACCS OAuth flow viability | M10 | Works, needs different approach, or ACCS store API not available |
| config.json storage strategy for repoless | M5 | One config.json per site in repo, or served from Config Service public config |
| Edit mode site management | M7 | Full wizard re-entry, or lightweight "Manage Sites" only |
| Migration: force or soft | M2 | Auto-migrate on load, or migrate on user action only |
| Block library per site vs shared | M5 | Same block library in all sites (shared repo), or per-site libraries |

---

## Estimated Scope Per Milestone

| Milestone | New Files | Modified Files | Estimated Tests | Risk |
|-----------|-----------|---------------|----------------|------|
| M0 | 0 | 3-4 | 5-10 | Low |
| M1 | 1-2 | 12-15 | 30-50 | **High** (most files touched) |
| M2 | 0 | 4-5 | 15-20 | Medium |
| M3 | 1 | 4-5 | 20-30 | Medium |
| M4 | 0 | 3-4 | 15-20 | Low |
| M5 | 0 | 3-4 | 20-30 | Medium |
| M6 | 1-2 | 3-4 | 10-15 | Low |
| M7 | 2-3 | 4-5 | 25-35 | Medium |
| M8 | 0 | 3-4 | 15-20 | Medium |
| M9 | 2-3 | 2-3 | 20-30 | Medium |
| M10 | 2-3 | 1-2 | 15-20 | **High** (API uncertainty) |
| M11 | TBD | TBD | TBD | Unknown |

---

## What To Build First

**Recommended starting order**:

1. **M0** — Quick wins, independent, improves existing UX
2. **M1** — High risk, get it right early. Foundation for everything.
3. **M2 + M3** — Together, these deliver the repoless + merged step. First feedback gate.
4. **M4 + M5** — Multi-site creation. Second feedback gate.
5. **M6 + M7** — Post-creation management. Third feedback gate.
6. **M8** — Configure per-site.
7. **M9 + M10** — Store structure. Can be deferred if Commerce API access proves difficult.

Each group (1, 2, 3-4, 5-6, 7-8, 9-10) can be a **separate planning and implementation cycle** using the existing `/rptc:feat` workflow.
