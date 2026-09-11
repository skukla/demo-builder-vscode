# Using a storefront a colleague built

**Date:** 2026-09-11
**Type:** Codebase research (seams and risks), then a user-flow design shaped with the owner
**Status:** RESEARCH DONE, DESIGN AGREED with the owner 2026-09-11 (§9–§11); next: promote EDS-13a/13c to a plan
**Question:** Today an SC can only build a project on a storefront that ships in
`demo-packages.json`. SCs want to build on a storefront a colleague made and shared.
What does that touch, what could break, and what should the SC's experience be?

Branch: `feature/colleague-storefront` (worktree from `origin/develop` at `22d41eb74`).

---

## 1. What a "storefront" is to this extension today

A storefront is not a repo. It is a row under a demo package in
`src/features/components/config/demo-packages.json`, keyed by stack id, with these fields
(`src/types/demoPackages.ts:122`):

| Field | What it drives | Required? |
|---|---|---|
| `source` (git url, branch, shallow) | The headless (Next.js) clone. EDS ignores it in practice: the repo is generated from `templateOwner/templateRepo` instead | Yes, by the schema |
| `templateOwner` / `templateRepo` | EDS: `POST /repos/{owner}/{repo}/generate` to create the SC's repo (`githubRepoOperations.ts:100`), and `git fetch` + `read-tree` on reset (`:542`) | EDS create refuses without them (`storefrontSetupPhases.ts:403`); reset refuses too (`edsResetParams.ts:294`) |
| `contentSource` (DA.live org, site, indexPath) | Content is read from the PUBLIC CDN `https://main--{site}--{org}.aem.live` plus its `full-index.json`, then written into the SC's DA.live site through `admin.da.live` (`daLiveContentCopy.ts:346`) | EDS content copy needs it |
| `accountContentSource` | Second overlay copy of `/customer/*` from the canonical B2B content site | Optional |
| `codePatches` + `codePatchSource` | Thin-layer patches (ADR-006) fetched from `skukla/eds-demo-patches`; also pins reset to that ledger's last-known-good commit | Optional; presence marks the storefront "thin-layer" |
| `contentPatches` + `contentPatchSource` | HTML edits during content copy | Optional |
| `brandAssets` | Files vendored raw from a source repo + a marker-bounded `head.html` snippet | Optional |
| `byomOverlayUrl` | Config Service `content.overlay` for PDP routing | Optional |
| `requiresMesh` | Locks or offers the mesh row in Integrations | Optional |

The PACKAGE around it carries `configDefaults` (website/store/store-view codes that prefill
the Commerce area), `configFlags` (injected into the storefront's `config.json`, ADR-009),
`addons`, `hidden`, `featured`, `status`, and the brand `name`/`icon` the Welcome card shows.

Block libraries are a separate registry (`block-libraries.json`) with `nativeForPackages` /
`onlyForPackages` audiences keyed by package id.

### Two facts that shape everything below

**The package id is a runtime key into the shipped catalog, not just a creation-time
choice.** The project manifest stores `selectedPackage` + `selectedStack` and, by design,
NOT the storefront fields (`src/types/settingsFile.ts:58`: "derived from selectedPackage +
selectedStack via demo-packages.json, not stored per-project"). The reason is stated in
`storefrontSetupConfigRehydration.ts:17`: "a package can change what it patches between
releases and existing projects pick it up on their next run". So every later operation looks
the id up again in the bundled JSON. The lookups I found (production code only):

| Site | What it needs from the catalog | What happens for an id the catalog does not know |
|---|---|---|
| `edsResetParams.ts:202` `resolveStorefrontConfig` | templateOwner/Repo, contentSource, patches, brandAssets | Reset refuses: "Template configuration missing" |
| `storefrontSetupConfigRehydration.ts:80` | patches, overlay, accountContentSource, brandAssets | Warns, proceeds with none (edit mode / republish) |
| `configGenerator.ts:472` | `configFlags` | No flags injected (B2B nav silently absent, see memory on `commerce-b2b-enabled`) |
| `showDashboard.ts:223` | package `name` | Dashboard shows no package name |
| `componentSummaryUtils.ts:95` | package `name` | Projects list shows no package name |
| `agentsMdSections.ts:636` | package name and shape for AGENTS.md | Generic AGENTS.md |
| `storefrontNameMigrationForProject.ts:121` | storefront config | Migration cannot resolve |
| `executorComponentLoading.ts:149` | storefront for stack | Creation fails: "No storefront found for stack" |
| `edsResetRepoHelper.ts:54` | block-library audience by package id | Libraries with `onlyForPackages` skipped |
| `WizardContainer.tsx:105,170` | selectable + own package (webview bundle imports the JSON directly) | Card list is compile-time |
| `createProjectTool.ts:416`, `discoveryTools.ts:99` (MCP) | selectable packages | Agent cannot name the storefront |

Twenty-one production files import the catalog or a loader over it. The loader is one
module, `src/features/components/services/demoPackageLoader.ts`, whose `loadDemoPackages`
already says it returns a Promise "to support future async loading scenarios (e.g., remote
config)". Nine of the eleven sites above go through a loader or an injectable `packages`
parameter; two (`configGenerator.ts:45`, `componentSummaryUtils.ts:94`) import the JSON
directly.

**Creation from a colleague's repo has two external preconditions the SC cannot change.**

1. GitHub only generates a repo from a repo marked **"Template repository"** in its settings.
   The extension calls exactly that endpoint (`githubRepoOperations.ts:100`). A colleague's
   ordinary repo returns an error there. Reset does not care (it fetches any repo).
2. The DA.live content is read from the **published** `aem.live` host of the colleague's site
   and its `full-index.json` (or the storefront's `indexPath`). Unpublished pages are
   invisible to the copy, and a site with no published index fails the copy outright unless
   the SC's DA.live token also belongs to the colleague's org (the list API is tried first,
   see §3d). The SC's token is what WRITES into their own site.

The colleague's repo also records its content source itself: every EDS repo carries
`fstab.yaml` with `mountpoints: /: https://content.da.live/{org}/{site}/`
(`fstabGenerator.ts:73`). That is a discovery path a URL-only door can use.

## 2. What already exists for "bring your own"

Three doors in this codebase already let an SC supply something not in a shipped registry.
The new feature should look like one of them, not invent a fourth shape.

| Door | Where the SC enters it | Validation | Stored where | Reaches create via |
|---|---|---|---|---|
| **Custom App Builder integration** | Integrations area, "Build custom" flow, `CustomStage.tsx`: one GitHub URL field + optional name | `parseGitHubUrl` (host must be github.com), charset asserts in `buildCustomIntegrationEntry` (`appBuilderComponentCatalogLoader.ts:249`), duplicate guard | Project manifest `appBuilderComponentSources` keyed by instance id | The loader SYNTHESISES a catalog entry from the URL; a URL matching an authored entry inherits its capabilities (the "seed" model) |
| **Custom block library** | VS Code settings (user scope), then checkboxes in the Storefront area (`BlockLibrariesStepContent.tsx:91`) | (agent C findings) | Settings + project manifest `customBlockLibraries` | Same installer as shipped libraries |
| **Existing GitHub repo / existing DA.live site** | Storefront area, `RepoSelectionInline.tsx` "choose existing" | `checkRepoReadinessHandler` / `repoStorefrontReadiness.ts` | Project metadata `githubRepo`, `daLiveSite` | Skips repo generation; content copy still comes from the PACKAGE's `contentSource` |

The custom-integration door is the closest cousin: an arbitrary GitHub URL becomes a
first-class catalog entry at runtime, persisted per project, and every downstream consumer
reads the synthesized entry exactly as it reads an authored one.

## 3. Seam map (every place the feature can touch)

(Filled from the three traces; see §3a–§3c.)

### 3a. Creation path

**Selection.** `WelcomeStep.tsx:85` `handlePackageSelect` is the only package door. It
writes `selectedPackage` and `packageConfigDefaults`, and clears every derived selection
(stack, backend, mesh, block libraries, API picks). The storefront is never picked
directly: it is `pkg.storefronts[selectedStack]`, resolved in two places that share one
mapper, `buildEdsConfigFromStorefront` (`edsConfigFromStorefront.ts:37`, called from
`WelcomeStep.tsx:194` and `useProjectBuilder.ts:124`). The mapper copies eleven fields into
`edsConfig`; `source` and `requiresMesh` are read elsewhere (`wizardHelpers.ts:504`,
`useProjectBuilder.ts:97`).

**Storefront area.** `StorefrontStep.tsx` reads only `pkg.id` (to filter block libraries by
audience). `RepoSelectionInline.tsx` lists repos the signed-in GitHub account can PUSH to
(`githubRepoOperations.ts:260`, `affiliation: owner,collaborator`, filtered on
`permissions.push`). There is no URL field. Picking an existing repo makes it the
DESTINATION only: `templateOwner/templateRepo` and `contentSource` still come from the
package (`RepoSelectionInline.tsx:260`), content is still copied from the package's site,
and the DA.live site name is locked to the repo name.

**Wire.** `wizardHelpers.ts:526` `buildProjectEdsConfig` puts nine storefront fields on the
creation payload. `brandAssets` and `byomOverlayUrl` are NOT on it; they arrive only via
`storefront-setup-start` + `rehydratePackageDerivedConfig`
(`storefrontSetupConfigRehydration.ts:33`), whose key list in turn omits
`templateOwner`, `templateRepo` and `contentSource`. Two half-lists that together cover
the eleven fields.

**Pipeline** (`storefrontSetupPhases.ts`, then `edsPipeline.ts`):

| Step | Reads | Behaviour for a colleague's storefront |
|---|---|---|
| Guard `:403` | `templateOwner`+`templateRepo` | Hard fail for EVERY repo mode, even existing-repo-no-reset |
| Phase 1 new repo `storefrontSetupPhase1.ts:360` | template → `createFromTemplate` | Needs the GitHub template flag on the colleague's repo |
| Phase 1 existing+reset `:297` | template → `resetToTemplate` (git fetch) | Works for any repo |
| Phase 1 pin `:152` | `codePatchSource`+`codePatches` | No-op without both (logged) |
| Phase 2 fstab `storefrontSetupPhase2.ts:174` | SC's `daLiveOrg`/`daLiveSite` only | No storefront field |
| Phase 2 block libraries `:113` | `packageId` audience filter, `blockLibraryLoader.ts:117` | Libraries with `onlyForPackages` are hidden for an unknown id; the rest install |
| Phase 2 inspector tagging `inspectorHelpers.ts:60` | per-package overrides by id | Falls back to defaults |
| Phase 2 smart-404, Quick Edit | `byomOverlayUrl` | Setting wins over catalog |
| Phase 3 Config Service `configServiceRegistration.ts:88` | repo, `daLiveOrg`, `byomOverlayUrl` | No storefront field |
| `copy-content` `edsPipeline.ts:664` | `contentSource` (+`indexPath`), `accountContentSource`, `contentPatches` | Skips itself when `contentSource` is absent; throws only if asked to copy with none |
| `block-library` `:488` | `component-definition.json` from `templateOwner/templateRepo` when no collections installed (`:531`) | Reads the COLLEAGUE's repo: correct |
| `block-code-patches` `:709`, `brand-assets` `:727` | optional | No-ops when absent |
| `executorEdsPhase.ts:296` | `templateRepo === 'boilerplate-b2b-template'` (hardcoded) | B2B advisory silent for a colleague's B2B-based repo |
| `executorEdsPhase.ts:72` `populateEdsMetadata` | writes `templateOwner`, `templateRepo`, `lastSyncedCommit`, `lkgSource` onto the EDS component instance | **Template identity IS persisted per project here** |

That last row matters: the manifest does not store the storefront row, but the EDS
component instance metadata already carries `templateOwner`/`templateRepo`, and the UPDATE
path reads it from there (`templateUpdateChecker.ts:83`, `templateSyncService.ts:105`) while
the RESET path ignores it and re-derives from the catalog (`edsResetParams.ts:202`). Two
doors, two sources of truth for the same fact, today. A colleague's storefront would get
update checks for free and reset refusals for nothing, which is the kind of two-surface
disagreement `architecture-duplication-scan` exists for.

**Headless (Next.js) stacks** never touch GitHub or DA.live: `wizard-steps.json` gates the
storefront step on `requiresGitHub`/`requiresDaLive`, and the only consumer of
`storefront.source` is the git clone (`executorComponentLoading.ts:73`,
`componentInstallation.ts:104` validates URL and ref charset, `--depth=1` when shallow).
For EDS stacks `edsConfig.repoUrl` replaces `source` entirely (`:57`). A colleague's headless
storefront is therefore a one-field feature (a git URL), while EDS is the whole seam map.

**Agent surface.** `createProjectTool.ts:276` already accepts `templateOwner`,
`templateRepo`, `contentSource` on its input and dispatches `storefront-setup-start` with
the package id for rehydration; `cloudResourceTools.ts:122` creates a repo from an
ARBITRARY template the agent names. The MCP side is closer to "bring your own" than the
wizard is.

### 3b. After creation

What the project persists: `selectedPackage`, `selectedStack` (manifest, `base.ts:99`;
a backup copy in `recentProjectsManager.ts:111`; the settings export), and on the EDS
component instance `templateOwner`, `templateRepo`, `lastSyncedCommit`, `lkgSource`
(`executorEdsPhase.ts:88`, typed at `eds/services/types.ts:611`). Unknown ids pass through
`normalizePackageId` untouched (`projectFileLoader.ts:40`).

| Door | Lookup | For a package id the catalog does not know |
|---|---|---|
| Reset, both dashboard doors + MCP `reset_eds_project` | `extractResetParams` → `resolveStorefrontConfig` (`edsResetParams.ts:195`, `:294`) | **Hard fail** "Template configuration missing" |
| `refresh_block_library` (`refreshBlockLibraryHeadless.ts:84`) | same `extractResetParams` | **Hard fail**, though it only needs repo coordinates |
| Reset block libraries (`edsResetRepoHelper.ts:54`) | `onlyForPackages` by id | Restricted libraries silently skipped |
| Reset inspector tagging (`inspectorHelpers.ts:60`) | `packageOverrides` by id | Silent default rules |
| Republish (`storefrontRepublishService.ts:210`) → `configGenerator.ts:462` | `configFlags` by id | **Silent**: `config.json` rewritten wholesale on every create/reset/republish (ADR-009) with no flags, so the colleague's own B2B flags are discarded and never re-expressed. This is the exact silence ADR-009 was written for |
| `.env`/config regeneration (`envFileGenerator.ts:385`) | same generator | same silent drop |
| Edit-mode rebuild (`storefrontSetupConfigRehydration.ts:76`) | `getStorefrontForStack` | Returns input unchanged **with no log** (the warn fires only when ids are missing, not when the lookup misses); patches, brand assets and overlay vanish. Its own docstring records the 2026-07-29 incident of this shape |
| Edit-mode wizard (`WizardContainer.tsx:159`) | `getPackageById` | Nothing appended: Configure shows no brand and has no storefront |
| Rebuild frontend source (`executorComponentLoading.ts:146`) | `pkg.storefronts[stack].source` | Throws only if `edsConfig.repoUrl` is also absent |
| Name migration (`storefrontNameMigrationForProject.ts:113`), site-config repair (`repairSiteConfigForProject.ts:92`) | `byomOverlayUrl` | Runs without overlay, wrapped in try/catch |
| Update checker (`templateUpdateChecker.ts:113`), template sync (`templateSyncService.ts:93`) | **instance metadata**, not the catalog | **Works** if metadata was written; silently no check if not |
| Staleness, republish params, sync service, `componentUpdater` | env vars / instance metadata | Package-independent |
| Dashboard subtitle (`showDashboard.ts:209`), projects-list card (`componentSummaryUtils.ts:85`) | package `name` | Hidden field / stack only (degrades correctly) |
| AGENTS.md (`agentsMdSections.ts:634`) | package `name` | Falls back to the raw id (`?? packageId`, the one graceful pattern) |
| AI bundle gates (`skillsWriter`, `aiToolingGate`, `mcpConfigWriter`) | project SHAPE (`isEdsProject`, mesh presence) | Unaffected |
| Sample data (`executorSampleDataPhase.ts:37`) | `project.datapack`, explicit | Unaffected |
| MCP `list_demo_packages` (`discoveryTools.ts:88`), `create_project` (`createProjectTool.ts:416`) | catalog | Closed list; `create_project` rejects "Unknown package". Meanwhile `create_site` (`cloudResourceTools.ts:123`) accepts any template. The two agent doors disagree about whether templates are open |
| B2B advisory (`executorEdsPhase.ts:296`) | `templateRepo === 'boilerplate-b2b-template'` literal | Silent for a colleague's B2B-based repo |

Tests that pin the catalog: `tests/templates/demo-packages-data.test.ts:103` (exactly 5
packages, exact id set, 10 storefronts), `demoPackageLoader-logic.test.ts:167`,
`demo-packages-bodea.test.ts`, `config-interface-contracts.test.ts`,
`manifest-mirrors.test.ts`, and `tests/sop/no-config-leaf-mocks.test.ts:78` (the JSON may
not be `jest.mock`ed; fixtures are injected). Docs that list packages: `docs/CHANGELOG.md`,
`docs/architecture/component-system.md`, ADRs 001/003/005/006/007/008/009.

### 3c. Registries, schemas, tests, docs that pin the catalog

- **Schema** `demo-packages.schema.json`: a storefront requires only `name`, `description`,
  `source`; nothing sets `additionalProperties: false`; `hidden`, `byomOverlayUrl` and
  `patches` are read by code but absent from the schema (they pass only because extras are
  allowed). A colleague's storefront validated against this schema would pass with nothing
  the EDS path actually needs.
- **Tests** that pin the catalog: `tests/templates/demo-packages-data.test.ts:79` (Ajv over
  the real JSON, asserts exactly 5 packages), `demo-packages-schema.test.ts`, and the
  generic `config-contracts.test.ts:23` sweep (every `*.schema.json` under `src/`).
- **Block libraries** `block-libraries.json`: 4 entries, each with `nativeForPackages` /
  `defaultForPackages` / `onlyForPackages` keyed by package id and (for 3 of 4) a
  `contentSource` for block-doc pages. Custom libraries from settings get none of this.
- **Settings vocabulary** (`package.json` `contributes.configuration`, mirrored in
  `settingsTools.ts:52`): `blockLibraries.custom` (array of GitHub URLs, the live precedent),
  `appBuilderComponents.custom` (declared, **no runtime consumer**: dead), `byom.overlayUrl`
  (setting overrides the catalog value), `daLive.*`, `accsDiscovery.services`.
- **Welcome cards** (`BrandGallery.tsx`): `status: 'coming-soon'` is the only flag with a
  visual treatment; `featured` is written in the JSON and read by nothing; `hidden` is
  filtered by `getSelectablePackages` and re-appended for the project's own package in edit
  mode (`WizardContainer.tsx:145`). There is no "add your own" affordance. The shipped
  package with id `custom` is a brand ("Custom (B2B + B2C)"), not an escape hatch.
- **Design history**: ADR-006 (thin layer), the dropped sync project, and the 2025-12
  demo-first research all speak only of OUR templates. The sync project's out-of-scope list
  names "any structural redesign of how Demo Builder selects/copies templates". Nobody has
  taken this question up before. The closest precedent is Bodea: a hidden package on the
  shared `b2b` patch ledger with its brand delta shipped additively (`brandAssets` + a
  block library).

### 3d. Content copy needs (from `daLiveContentCopy.ts` and ADR-010)

Enumeration tries the DA.live list API first (needs the SC's token to belong to the
SOURCE org; a 404 maps to empty), then falls back to the public CDN index
`https://main--{site}--{org}.aem.live{indexPath}` (default `/full-index.json`; a non-OK
response is fatal, `INDEX_FETCH_ERROR`). Each page is then read from the public CDN
(`.plain.html`, unauthenticated) and written to the SC's site with the SC's token. So a
colleague's site must be **published with an index**; DA.live sharing is optional. Fragments
are found by reference-following (ADR-010) with a proceed-and-warn audit; `/customer/*`
auth pages missing at the source become stubs, or come from `accountContentSource`.

## 4. Risks, ranked

1. **Reset refuses.** One lookup (`edsResetParams.ts:195`) behind six doors (two dashboard
   resets, the MCP reset tool, block-library refresh, and their tests). Principle 1
   ("whatever can be done can be undone") fails on day one unless the template identity is
   resolved from the PROJECT for a colleague's storefront.
2. **B2B flags silently dropped.** `configGenerator.ts:462` rewrites `config.json` on every
   create, reset and republish and only re-adds flags it finds in the catalog. A colleague's
   B2B storefront renders an empty account nav with no error. Fix shape: read the flags from
   the colleague's own `config.json` (public.default) before the rewrite, or store them on
   the synthesized package.
3. **Rehydration is silent on a miss.** `storefrontSetupConfigRehydration.ts:76` must log
   (and should resolve from the project) or every edit-mode rebuild quietly loses whatever
   the storefront carried.
4. **Two template resolvers already disagree.** Instance metadata (update path) vs catalog
   lookup (reset path). This feature should collapse them into one resolver rather than add
   a third; `call-path-audit` is the instrument that pins that.
5. **The webview bundle imports the catalog at build time.** `WizardContainer.tsx:105`
   calls the loader inside the wizard bundle. Any package that exists only at runtime (from
   a setting, a project, or a URL) has to reach the wizard through the host, as
   `customBlockLibraryDefaults` already does (`createProject.ts:314`, live-pushed on setting
   change at `:453`). ADR-017: dependencies arrive as props.
6. **GitHub template flag.** Creation from a colleague's repo fails at
   `POST .../generate` unless they ticked "Template repository". The wizard must probe this
   (GitHub returns `is_template` on `GET /repos/{owner}/{repo}`) and say so in plain words,
   or offer the existing-repo + reset path (git fetch) as the fallback.
7. **Published index required.** Content copy fails hard on a missing
   `full-index.json` (`INDEX_FETCH_ERROR`) unless the SC's DA.live token belongs to the
   colleague's org. The wizard should probe the index before Continue.
8. **Two half-lists of storefront fields on the wire** (`buildProjectEdsConfig` vs
   `PACKAGE_DERIVED_KEYS`). A synthesized storefront must reach the pipeline whole, or it
   repeats the 2026-07-29 patch-loss bug in a new costume.
9. **Agent surface.** `list_demo_packages` is a closed list and `create_project` rejects
   unknown ids, while `create_site` accepts any template. Whatever the wizard gains, the
   agent must gain too (CLAUDE.md "Hit every surface" #4).
10. **Count-pinned tests and schema gaps.** Five-package pins break only if colleague
    storefronts are merged into the shipped loaders; a separate source avoids that. The
    schema does not describe `hidden`, `byomOverlayUrl`, `patches`; a synthesized package
    needs a typed shape in `tests/helpers/`, not a JSON literal (memory: shapes written
    outside typechecked files get invented).
11. **Low, silent degradations**: `onlyForPackages` libraries, inspector overrides, the
    B2B advisory literal, dashboard/projects-list names. Acceptable if named.

## 5. Design directions weighed

| Direction | Shape | What it fixes | What it costs |
|---|---|---|---|
| **A. Per-project storefront** (the custom-integration pattern) | SC pastes a GitHub URL; the wizard synthesizes a storefront (and a package identity) and the PROJECT stores it; one resolver reads project first, catalog second | All 11 lookups, reset, rehydration, the resolver split in risk 4; survives machine moves and extension upgrades | A resolver chokepoint touching the reset/rehydration/config-flag/name sites; the wizard needs a URL door and probes |
| **B. Personal registry in settings** (the block-library pattern) | `demoBuilder.storefronts.custom` list of URLs; the host synthesizes packages and merges them into what the wizard sees | The Welcome card list; repeat use | Alone it breaks principle 3: a project on a machine without the setting loses its package. Useful only ON TOP of A, as "remember this storefront" |
| **C. Colleague-authored manifest in the repo** | A `demo-builder.json` (name, icon, configDefaults, configFlags, block libraries, content source) read from the colleague's repo | Brand data the URL cannot carry; scales to a shared catalog later | A file colleagues must write; a second schema to keep in step. fstab.yaml + `config.json` already carry content source and flags, so v1 can discover without it |

Recommended: **A**, with discovery from what the repo already holds (fstab.yaml for the
content source, `config.json` for flags, `GET /repos` for `is_template`), and B as an
optional "remember it" on top. C stays a follow-on.

## 6. Open product questions (for the owner)

Asked one at a time, recommendation first. Answers recorded here as they arrive.

1. Scope: EDS only, or headless too?
   **Answered 2026-09-11 (owner): EDS and headless together.** The wizard must tell which
   kind a pasted repo is (EDS: `fstab.yaml` + the three canonical storefront files that
   `repoStorefrontReadiness.ts` already probes; headless: a Next.js `package.json`) and
   offer the matching stacks.
2. Identity: is a colleague storefront its own brand card, or a swap under a shipped brand?
   **Answered 2026-09-11 (owner): its own brand card.** The colleague's storefront is its
   own package on the Welcome step, named from the repo; store codes and flags come from the
   colleague's repo or the SC's own Commerce entries. No inheritance from a shipped brand.
3. Sharing: URL each time, remembered per SC, or a colleague-authored manifest?
   **Answered 2026-09-11 (owner): paste a URL, and remember it.** An "Add a colleague's
   storefront" door on the Welcome step takes a GitHub URL; the extension probes the repo
   and shows a card; the PROJECT stores the synthesized storefront (reset and rebuild work
   anywhere) and the URL is remembered in the SC's user settings so the card returns next
   time. No manifest for the colleague to write (v1). This also answers question 6:
   the door is on the Welcome step.
4. Reset and updates: reset to the colleague's `main` HEAD? Apply our patch ledgers?
   **Answered 2026-09-11 (owner): their `main`, report only.** The ownership line: the
   colleague owns the storefront (boilerplate version, customizations, bugs); the extension
   owns the integration contract (config.json + flags, fstab.yaml, .env, Config Service,
   block-library install, PDP URL encoding). Reset re-fetches the colleague's repo at
   current `main` and re-copies their published content. No LKG pinning, no code or content
   patches, no brand assets. The five extension-load-bearing code patches
   (`product-link-sku-encoding`, `product-link-sku-slash-encoding`,
   `product-teaser-sku-encoding`, `pdp-empty-data-redirect`, `aem-assets-sku-sanitization`)
   run as a DRY CHECK at creation and reset using the engine's existing three-state outcome
   (applied / already present / precondition missing, `codePatchRegistry.ts:237`), and each
   miss becomes a caveat the SC sees, in the shape of today's PDP caveats. Opt-in patch
   application is deliberately deferred until reports show a pattern. Update checks keep
   comparing the stored commit to their `main` (already how `templateUpdateChecker.ts`
   works for non-thin-layer storefronts).

   What we CAN observe about a colleague's repo: fork parent or `template_repository` from
   GitHub (nothing for a fresh push); the three canonical files (shape, not version); each
   patch's fit (exact); brand-asset and smart-404 markers (partial "made by Demo Builder"
   evidence, no single stamp). What we cannot: their currency, the template flag, the
   published index, what they push later.
5. Content: copy the colleague's published DA.live content by default?
   **Answered 2026-09-11 (owner): copy by default, skippable.** Content source read from
   the repo's `fstab.yaml`; the published index is probed before Continue; the SC can untick
   "copy content" for an empty site; a missing index is reported and the empty-site path
   offered instead of a mid-create failure.
6. Placement: Welcome step door vs Storefront-area door. **Welcome step** (from answer 3).

Decided without asking, because the code settles them (stated here so they are not
silent):

- **Not a GitHub template?** Fall back to the path the existing-repo flow already has:
  create an empty repo under the SC's namespace, then `resetToTemplate` (git fetch +
  read-tree, `githubRepoOperations.ts:508`) from the colleague's repo. No colleague action
  needed; the template flag becomes a fast path, not a requirement.
- **Which stacks?** An EDS repo offers `eds-paas` and `eds-accs`; a headless repo offers
  `headless-paas` and `headless-accs`. The backend choice stays the SC's, as today.
- **Mesh?** `requiresMesh: 'optional'` for a colleague storefront: the toggle is shown
  because we cannot know whether their code expects a mesh.
- **Block libraries?** Every shipped library without `onlyForPackages`, plus the SC's
  custom ones. No native lock.
- **Store codes and flags?** No `configDefaults` (the SC types store codes in the Commerce
  area as for any brand). `configFlags` are read from the colleague's `config.json`
  `public.default` for the known flag keys, so the wholesale rewrite (ADR-009) re-expresses
  what their storefront had.
- **Private repos?** Allowed. The probe and the generate/fetch calls use the SC's GitHub
  token, so a private repo works when the colleague has added the SC as a collaborator.
  Content is read from the public CDN either way.
- **Agent surface?** Whatever the wizard gains the agent gains: `create_project` accepts a
  storefront URL, `list_demo_packages` includes remembered colleague storefronts, and the
  probe is exposed as a read tool.

## 7. The user flow (v1 design)

**Welcome step.** The brand grid gains one more card, "Use a colleague's storefront",
rendered by the same `PackageCard` shell with an add affordance (reuse-first: the
Integrations area's "Build custom" card is the sibling). Selecting it opens a single-field
form, the `CustomStage` shape: a GitHub URL, an optional display name, `parseGitHubUrl`
validation, a duplicate guard against already-remembered storefronts.

On a valid URL the wizard asks the host to probe (one request, Pattern B: the handler
RETURNS the result):

| Probe | Source | Outcome shown to the SC |
|---|---|---|
| Repo reachable with the SC's token | `GET /repos/{owner}/{repo}` | owner, name, default branch, `is_template`, `template_repository` or `parent` when present |
| Kind | `fstab.yaml` + the three canonical files (`classifyRepoForStorefront`) for EDS; a `package.json` depending on `next` for headless | "Edge Delivery storefront" / "Headless (Next.js) storefront" / "Not a storefront we can build on" (refuse, name what is missing) |
| Content source (EDS) | `fstab.yaml` mountpoint | "Content: {org}/{site}" |
| Content available (EDS) | HEAD the published index | "N pages published" or "No published index: the site will start empty unless the colleague publishes" |
| Flags (EDS) | `config.json` `public.default` | "B2B: on" when the known keys are present |
| Non-`main` default branch | repo metadata | the existing `DefaultBranchNotice` warning |

The card preview shows those lines. Continue adds the storefront: a synthesized package
(`id` derived from owner/repo, `name` from the repo or the typed label, the two stacks for
its kind, no `configDefaults`, the read `configFlags`, `templateOwner`/`templateRepo` and
`contentSource` set, no patch ledgers, no brand assets, `requiresMesh: 'optional'`) appears
selected in the grid. The URL is remembered in the SC's user settings (the
`blockLibraries.custom` pattern, live-pushed on change as `customBlockLibraryDefaults`
already is) so the card returns next time. Removing it from settings removes the card and
nothing else.

**Build Your Project.** Unchanged in shape. Commerce: the SC enters store codes as for
any brand. Storefront: repo name as today; "Copy content from {org}/{site}" checked by
default when the index probe passed, unchecked and explained when it did not; block
libraries as decided above. Integrations: mesh toggle shown.

**Review.** The storefront row reads "{name}, from github.com/{owner}/{repo}". Caveats from
the dry patch check (the five load-bearing patches) appear here and in the completion
report, worded for an SC ("Product deep links may 404 on this storefront").

**Create.** The pipeline runs as today with the synthesized `edsConfig`. New repo:
`generate` when `is_template`, else create-empty + git fetch from the colleague's repo.
The project persists the synthesized storefront row (a typed manifest field beside
`selectedPackage`), so nothing later depends on the catalog.

**After creation.** One resolver, `resolveStorefrontForProject(project)`, returns the
project-stored row when present and the catalog row otherwise. Every site in §3b that
looks the id up moves onto it (reset params, rehydration, config flags, dashboard and
projects-list names, AGENTS.md name, name migration, site-config repair, WizardContainer
edit mode, `executorComponentLoading`). Pinned in `tests/templates/spine-chokepoints.test.ts`
per `call-path-audit`. Reset re-fetches the colleague's `main` and re-copies their content;
the update checker compares the stored commit to their `main` (already its non-thin-layer
behaviour). The dry patch check re-runs on reset.

**Reversal.** Forget a remembered storefront: remove it from settings (card gone, projects
unaffected). Undo a project: delete as today. Nothing new that cannot be undone.

**Out of scope for v1, named so they are not silent.** A colleague-authored manifest
(`demo-builder.json`) and a shared team catalog; opt-in application of our patches to a
colleague's repo; inspector overrides and `onlyForPackages` libraries for colleague
storefronts; the B2B advisory literal (`executorEdsPhase.ts:296`) generalised to
"config.json says B2B".

## 8. The gap from "just another storefront" (iteration 2, 2026-09-11)

The owner's frame: an SC expects a shared storefront to behave like a shipped one.
Everything a shipped storefront gets, compared with what the v1 flow gives a colleague's.
"Same" means the same code path runs with the same effect once the resolver exists.

| What a shipped storefront gets | Colleague's under v1 | Gap | What closes it |
|---|---|---|---|
| Welcome card: name, icon, description | name from repo, generic icon, "from github.com/o/r" | Visible, cosmetic | GitHub repo `description` for the card text (free); icon needs a manifest |
| `configDefaults` prefill store codes in Commerce | none, SC types them | Real: the codes are the brand's data | **Read them from the colleague's `config.json` headers** (`Magento-Website-Code`, `Magento-Store-Code`, `Magento-Store-View-Code`) for the stack's key set (PaaS `ADOBE_COMMERCE_*` / ACCS `ACCS_*`). No colleague action |
| `configFlags` (B2B) injected on every rewrite | read from their `config.json` | none after the read | already in v1 |
| Mesh posture (required / none / optional) | `'optional'`, SC decides | Small: one toggle | Detect from `commerce-endpoint` host (a `graph.adobe.io` endpoint means their code was built against a mesh) and preselect |
| Content copy from a published site | same | none | index probe is the only extra |
| Content patches | none | none in practice: their content is already what they want | n/a |
| `accountContentSource` overlay for hybrid B2B | none | none if their site is complete; ADR-010 audit warns otherwise | n/a |
| Native / default block libraries per brand | nothing preselected | Small: their blocks already live in the repo, and install dedups against what exists | none needed; the library doc pages ride along with content |
| Inspector tagging overrides | defaults | Invisible unless they had overrides | manifest (deferred) |
| Code patches at an LKG pin | dry check, caveats | By decision (ownership) | inherent |
| Brand assets | their repo already has them | none | n/a |
| BYOM overlay, smart-404, Config Service, fstab, `.env`, site.json | same | none | already package-independent |
| Reset, update check, template sync | same mechanics, target = their `main` | none after the resolver | the resolver |
| Dashboard subtitle, projects-list card, AGENTS.md name | same after the resolver | none | the resolver |
| Configure / edit mode | same after the resolver | none | the resolver |
| Datapacks | same (explicit choice) | none | n/a |
| Agent surface (`list_demo_packages`, `create_project`) | same once the tools read remembered storefronts | none | in v1 |
| **Available to every SC without doing anything** | only the SC who pasted the URL | **Real, and the largest**: a shipped storefront is there for the whole team; a colleague's must be pasted per SC per machine | a team catalog (below) |
| Repo generation from a template | same when flagged; git fetch when not | speed only | n/a |
| Their repo can break extension conventions (PDP encoding) | reported | inherent to ownership | the caveat report |

Three levers, in cost order:

1. **Derive from what the repo already holds** (`config.json` headers and flags, GitHub
   `description`, the endpoint host, `fstab.yaml`). Closes the store-codes, mesh, flags and
   card-text rows. No colleague action, no new schema. Belongs in v1.
2. **An optional catalog row in the colleague's repo.** Not a second schema: a
   `demo-builder.json` that IS a `DemoPackage` fragment validated by the existing
   `demo-packages.schema.json` (icon, description, `configDefaults`, `configFlags`,
   `requiresMesh`, default block libraries, inspector overrides). When present it wins over
   what lever 1 derived; when absent, lever 1 stands. Makes "just another storefront"
   literal: the row that would have gone into the shipped catalog travels with the repo.
   Colleague opt-in. Small cost once lever 1 exists (one fetch, one validation, one merge).
3. **A team catalog.** A remote list of package rows (a JSON in a repo the demo team owns)
   that the loader merges with the shipped catalog. `loadDemoPackages` already says it
   returns a Promise "to support future async loading scenarios (e.g., remote config)".
   Closes the "every SC must paste it" row and lets the team publish storefronts without an
   extension release. Costs a remote fetch with caching, a trust decision about who edits
   that file, and the same host-to-webview push the custom block libraries use. v2.

## 9. Iteration 2 decisions (2026-09-11, owner)

Option 1 (read from the repo) and the Welcome-step shape, settled:

- **Prefill matches shipped brands exactly**: the three store codes (website, store, store
  view) read from the colleague's `config.json` headers. Not the backend address, not
  secrets. The SC supplies those as for any brand.
- **Unreadable `config.json` never refuses the card.** The generator regenerates
  `config.json` wholesale on every create and reset (ADR-009), so the colleague's copy is
  only a source of hints. Losing it costs the store-code prefill and the B2B flags. The
  flags matter: a B2B storefront we could not read renders an empty account menu with no
  error. So detection tries `config.json` first and the repo's dependency list second (B2B
  storefronts carry B2B drop-in packages); only when both fail does the modal show a
  "uses B2B features" switch, off by default, with a plain reason. The answer is stored
  with the project and re-expressed on every regenerate.
- **The level is the brand, not the stack piece.** What a colleague shares is a demo
  package's storefront rows (code + content + brand settings) for one frontend kind; in
  Edge Delivery code and content are inseparable, so it cannot be a frontend swap. It
  therefore lives on the Welcome grid as a peer of CitiSignal and Bodea, and the Storefront
  area shows the frontend piece as fixed by the repo, exactly as it does for Bodea today.
- **Words.** The shipped unbranded brand "Custom (B2B + B2C)" is renamed **"Starter
  (B2B + B2C)"** (id through the existing rename map). The door is a **plus card, "Add a
  demo"**, described "Use a demo a colleague built, or one of your own. You'll need its
  link." Rejected on the way: "Custom" (reads as make-it-yourself beside Starter; the
  mechanism, not the intent), "Shared" (two readings: collaborated on vs given to you),
  "Import" (already the wizard's settings-import mode), "Demo from GitHub" (technical).
  Once added, a demo is an ordinary card named by its repo or by the SC ("Isle5 by Jen").
  Settings list: "Added demos". Internally the type is still a storefront row, matching the
  catalog; the glossary records that the grid word is "demo" for the same reason the
  CitiSignal card is not called "CitiSignal storefront rows".
- **The door opens a staged modal**, the Add Integration shape: stage 1 pick an added demo
  or paste a link; stage 2 what we found (kind, content site and whether published, store
  codes, template flag, B2B) plus a name; Continue commits it for this project. It runs on
  the Welcome step because the Commerce area comes first in Build Your Project and needs
  the store codes.
- **Remembered demos reuse the existing settings pattern** (`blockLibraries.custom`),
  live-pushed to the open wizard the way `customBlockLibraryDefaults` is.

Still open at this point: the found-panel wording; option 2 (a catalog row inside the
colleague's repo); option 3 (a team catalog).

### 9a. The dialog, and the owner's caveat: reuse, do not invent

Accepted 2026-09-11 with one condition that the plan treats as a gate: every surface,
pattern and word in the experience is an existing one. The mapping, so the plan can be
checked against it (`reuse-first` fires on any new file under `ui/`):

| What the SC sees | Existing thing it IS |
|---|---|
| The demo grid and the "Add a demo" plus card | `BrandGallery` + `PackageCard` (`project-creation/ui/components`); the plus card is the Integrations area's "Build custom" card shape |
| The dialog over the wizard | `Modal` (`core/ui/components/ui/Modal.tsx`) hosted in Spectrum `DialogContainer`, as `AddIntegrationFlowModal` does |
| Stage machinery (Back / Continue, draft committed at the end) | `useIntegrationFlow` + `flowStages.ts` (`FlowDraft`, `deriveStageOrder`); a storefront flow adds its own stage ids in the same shape |
| The link field with live validation and the duplicate guard | `CustomStage.tsx` (`parseGitHubUrl`, `INVALID_MESSAGE`, `DUPLICATE_MESSAGE`) |
| The editable name | `OptionalNameField` |
| "Looking at this demo…" | `LoadingDisplay` |
| "This doesn't look like a demo we can build on" | `StatusDisplay` (never a bare Retry) |
| Kind detection | `classifyRepoForStorefront` (`repoStorefrontReadiness.ts`) for EDS; a headless probe added beside it |
| Non-`main` default branch warning | the existing `DefaultBranchNotice` |
| "What we found" rows | the wizard's summary row vocabulary (`buildSummary.ts` groups), not a new table |
| Remembered demos | the `blockLibraries.custom` setting pattern + `customBlockLibraryDefaults` live push |
| The list of added demos in stage 1 | `SelectionStepContent` + `useSelectionStep` (the repo picker's list), not a new list |
| The B2B switch | Spectrum `Switch`, as the wizard's other toggles |
| Words | "demo" on the grid (glossary: demo package = the card), "storefront" in the Storefront area, "Add", "Continue", "Back", the existing sign-in and readiness copy |

A plan step that introduces a component, a hook, a stage shell, a settings shape or a
noun not in this table has to say which row it replaces and why the row would not do.

## 10. Option 2 accepted, and the scope it opens (2026-09-11, owner)

**The description file is in.** A colleague may add one file at the top of their
storefront repo carrying what a shipped catalog entry carries and nothing more: name,
description, icon, store codes, B2B flags, mesh posture, default block libraries. It is
validated by the same rules as `demo-packages.json` (one schema, two places it can live).
Absent, option 1 stands. Precedence when the file and the storefront's own settings
disagree: still to decide (§6 question list).

**It is a published contract, not an internal convenience.** The file's name, its fields
and the steps to make a demo shareable (publish the content site with an index, add the
file, optionally flag the repo as a template) are written up as the accepted process for
shipping a shareable storefront, in `docs/` where SCs and colleagues can find it, and the
rules are pinned by the same config-contract tests that pin our own catalog.

**Export is the other half.** An SC who built a demo and wants to share it should not
have to hand-write the file. An "export" action on an existing project writes the
description file into the project's own storefront repo from what the project already
knows (name, store codes, flags, block libraries, mesh), checks that the content site is
published with an index and that the repo is reachable, and hands the SC the link to send.
Un-built today; captured as its own backlog item under this one. Note the word: "export"
already means settings export in the projects dashboard (`settingsSerializer.ts`), so the
action needs a name that does not collide ("Share this demo" is the candidate).

**Both halves have an agent surface.** Per CLAUDE.md "Hit every surface" #4, the MCP
server gains what the wizard and dashboard gain: a read tool that probes a link the way
stage 2 does, an action that adds a demo (and remembers it), an action that shares a
project's demo (writes the file, runs the checks, returns the link), and `list_demo_packages`
returning added demos beside shipped ones. `create_project` accepts an added demo's id or a
link. This is a requirement of each item, not a separate item.

### 10a. Decided (2026-09-11, owner)

- **Precedence: the file wins, and we say what it overrode.** The found panel shows the
  file's value with a note that the storefront's own settings said otherwise. A stale file
  is visible, never silent.
- **The export action is "Share this demo"; reversal "Stop sharing".** Never "export"
  (settings export) or "publish" (content publish) in anything the SC reads.
- **Share offers the template flag as a tick box, off by default.** One GitHub settings
  write, undone by unticking; nothing on the SC's repo changes silently.

## 11. Option 3 decided, and what is still open (2026-09-11, owner)

**The team catalog ships after add and share.** A shared list the loader merges with the
bundled catalog so a demo appears for every SC without pasting. Filed as [[EDS-13d]],
gated on [[EDS-13a]] and [[EDS-13b]] having shipped and on real shared demos existing to
list. Its policy questions (who edits the list, what happens when an entry breaks, what
happens when the list is unreachable) are decided then, with use behind them.

**Open, to settle in the plan rather than here:**

- The description file's name (must not collide with the project manifest
  `.demo-builder.json`) and its icon format.
- Where "Share this demo" gets the description text and icon from (a prompt, or defaults
  from the package the project started on).
- The exact headless probe (which `package.json` dependency marks a Next.js storefront)
  and the exact B2B drop-in package names for the config.json fallback; both verified
  against the real boilerplates before being relied on.

## 12. Expanded into a program (2026-09-11, owner)

EDS-13 is now "Portable demos: share storefronts, move whole projects", two tracks: this
research (Track 1) and project export/import/copy ([[PL-56]], measured in
`.rptc/research/project-import-export/research.md`). Decided: ONE contract, the versioned
project file, of which the storefront description file is the slice that travels with a
repo ([[PL-56a]] comes first; [[EDS-13c]] publishes the shareable-storefront process on top
of it). Copy and Edit both stay, fed by that one complete file.
