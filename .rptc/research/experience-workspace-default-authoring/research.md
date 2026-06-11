# Research: Per-Project Authoring Experience (Universal Editor ↔ Experience Workspace)

- **Date:** 2026-06-11
- **Type:** Hybrid (web + codebase)
- **Status:** Complete — ready for `/rptc:plan`
- **Target release:** .116 (one feature)
- **Decision owner:** Steve

---

## Goal

Let an SC choose, **per project**, between two AEM authoring experiences, with a **global default** and a **per-project override**:

1. **Universal Editor (UE)** — the *current* experience: the "Author" button opens the da.live doc editor, and a UE "punch-out" is configured in DA's `editor.path` so Sidekick "Edit" lands in `experience.adobe.com`.
2. **Experience Workspace (EW)** — Adobe's new da.live-native canvas at `https://da.live/canvas#/<org>/<site>/<path>`.

Properly configured, not URL-wrapped: the choice drives both the "Author" button target **and** the DA `editor.path` value, and EW's WYSIWYG dependency (Quick Edit) is wired into the storefront.

Primary source: <https://docs.da.live/about/early-access/experience-workspace>

---

## Decisions locked (this session)

| Decision | Choice |
|---|---|
| Model | **Per-project choice** between UE and EW (not a one-way default swap) |
| Global default (new projects) | **Universal Editor** (preserve current behavior); EW is opt-in per project or via the global setting |
| Per-project override | Yes — SC flips a single project independently |
| EW alpha URL | **Param-less** `https://da.live/canvas#/<org>/<site>/<path>` — no `?nx`, no `?nxver` |
| Flip behavior | **Re-apply `editor.path` immediately** on flip (thin standalone handler) |
| Quick Edit scope | **Apply to all EDS projects** (inert under UE; makes flip seamless) |
| Quick Edit delivery | **Single global extension vendoring step** (modeled on `pdp404HandlerPublisher`) — NOT per-brand patches |
| `editor.path` scoping | **Site-scoped** `/<org>/<site>=…` rows (required — see correction #2) |
| EW alpha URL verified | ✅ param-less `da.live/canvas#/<org>/<site>/<path>` loads EW (no "outdated" warning) — confirmed in browser 2026-06-11 |
| Delivery | All layers ship together as one .116 feature |

---

## Resolved: the EW alpha URL

Steve + Leah's working URL was `https://da.live/canvas?nx=exp-workspace#/leahrayard/leah-b2b-demo/index.html`, which showed *"You are loading an outdated demo version of Experience Workspace."*

- `?nx=exp-workspace` is a **branch override** pointing at the stale `exp-workspace--da-nx--adobe.aem.live` demo build — the source of the "outdated" warning.
- The docs (verified 2026-06-11) describe the current alpha as the **param-less** form. They mention **no** `?nxver`/`?nx` parameter. Plain `da.live/canvas` serves the current alpha.
- **Ship the documented param-less URL: `https://da.live/canvas#/<org>/<site>/<path>`.** No opt-in `nxver` setting needed (YAGNI).
- Path segment is real and includes the doc (e.g. `/index.html`). Include a path; default to the site root if none is stored.

**Browser-verified 2026-06-11:**
- `https://da.live/canvas#/skukla/citisignal-b2b/index.html` (Steve's own site) loads the EW shell with no "outdated" warning; Content view loads. Confirms param-less = current alpha.
- Loading Leah's site (`da.live/canvas#/leahrayard/leah-b2b-demo/index.html`) as Steve showed Content view "Failed to load (403)" — a **cross-account DA permission artifact**, not a product gap (Steve isn't on Leah's org permission sheet). Not a concern for the feature.
- **Layout (WYSIWYG) view renders blank** on a storefront without Quick Edit wired — this is the exact symptom the Quick Edit vendoring step fixes.

---

## Two corrections to the earlier mental model

### Correction 1 — the "Author in DA.live" button is NOT the UE punch-out today

`getEdsDaLiveUrl` (`src/types/typeGuards.ts:373-382`) emits `https://da.live/#/<org>/<site>` — the **da.live doc editor**, not the Universal Editor. The UE punch-out exists only in DA's `editor.path` config and is reached *from inside* da.live/Sidekick. So the two experiences are two bundles:

| | "Author" button (`getEdsDaLiveUrl`) | DA `editor.path` config |
|---|---|---|
| **Universal Editor** (current) | `https://da.live/#/<org>/<site>` | `…=https://experience.adobe.com/#/@<IMSOrgId>/aem/editor/canvas/main--<site>--<org>.ue.da.live` |
| **Experience Workspace** (new) | `https://da.live/canvas#/<org>/<site>/<path>` | `/<org>/<site>=https://da.live/canvas#` |

A flip changes **both** rows for that project.

### Correction 2 — `editor.path` must become site-scoped (load-bearing for per-project choice)

Today `applyDaLiveOrgConfigSettings` (`edsHelpers.ts:667-707`) writes **one** `editor.path` row at the **org** level (`applyOrgConfig(daLiveOrg, …)` → `/config/<org>`), using a dummy left-hand prefix (`editorPathPrefix` default `'site/to/path/content'`). But `demoBuilder.daLive.defaultOrg` is a **shared global default** (`edsHelpers.ts:219,516`, `edsDaLiveAuthHandlers.ts:69`, `cleanupDaLiveSites.ts:34`) — multiple projects routinely share one DA org. A single org-level row means flipping one project would **clobber every other site in that org**.

The docs confirm the fix: `editor.path` is **per-site scoped** — *"You can have as many editor.path configurations for different sites and subpaths as you like."* So write a **per-site row keyed by `/<org>/<site>`**. This keeps projects sharing an org independent and is mandatory for the toggle to be safe.

---

## Architecture: global-default + per-project-override toggle

Every seam already exists. Recommended design (file:line anchors):

1. **Global setting** — add `demoBuilder.daLive.authoringExperience` enum (`["universal-editor","experience-workspace"]`, default `"universal-editor"`) to `package.json` (sibling of the existing `demoBuilder.daLive.*` group, `:240-262`).
2. **Per-project field** — `authoringExperience?` on the EDS component-instance **metadata** (`componentInstances[COMPONENT_IDS.EDS_STOREFRONT].metadata`, next to `daLiveOrg`/`daLiveSite`). Naturally absent for non-EDS projects.
3. **Resolver** — `resolveAuthoringExperience(metadataValue)` mirroring `resolveByomOverlayConfig` (`edsHelpers.ts:323-341`): per-project value wins, global setting is fallback. Place in `edsHelpers.ts` (keep `vscode` dependency out of webview-shared `typeGuards.ts`; pass the resolved value into the URL builder).
4. **`getEdsDaLiveUrl`** (`typeGuards.ts:373-382`) — branch on the resolved experience: UE → `https://da.live/#/<org>/<site>`; EW → `https://da.live/canvas#/<org>/<site>/`.
5. **`applyDaLiveOrgConfigSettings`** (`edsHelpers.ts:667-707`) — parameterize by experience; write the matching **site-scoped** `editor.path` row. `applyOrgConfig` (`daLiveContentOperations.ts:2404-2527`) already does an idempotent per-key sheet merge that preserves other sheets (incl. permissions), so the flip is a safe single-row overwrite.
6. **Flip handler** — `handleSetAuthoringExperience`, modeled on `handleSetProjectPinned` (`dashboardHandlers.ts:1031-1063`): persist the metadata via `saveProjectConfigOnly` (pure-local), then **immediately** re-apply `editor.path` via a thin extraction of `republishStorefrontContent` Step 1 (`storefrontRepublishService.ts:317-323`) — no full reset. (Decision: re-apply immediately.)
7. **UI** — toggle control in the projects-list kebab (`ProjectActionsMenu.tsx:194-196`, Pin/Unpin precedent) and/or the dashboard `ActionGrid` overflow (`ActionGrid.tsx:289-295`); relabel the "Author" button to reflect the active experience.

**Consumers that get the branch for free:** `showDashboard.ts:147`, `projects-dashboard/handlers/dashboardHandlers.ts:788`, `aiContextWriter.ts:144`.

**Flip semantics (3 effects):** (a) update metadata field — *local*; (b) re-write site-scoped `editor.path` — *backend round-trip*, immediate; (c) button URL/label — *local, falls out of (a)*.

---

## Code-patch engine mechanics (Quick Edit delivery)

### Engine shape

Three layers under `src/features/eds/services/`: `externalPatchFetcher.ts` (fetch), `codePatchRegistry.ts` (pure search/replace engine), `codePatchPipelineHelpers.ts` (canonical vs block phase wrappers).

- **Patch schema** (`codePatchRegistry.ts:44-64`): `CodePatch { id, target, description, precondition (literal substring anchor), replacement, exit? (documentary only), critical? }`. Defined per-brand in `eds-demo-patches/{brand}/code-patches.json`, referenced by `codePatches: string[]` + `codePatchSource` in `demo-packages.json` (`src/types/demoPackages.ts:77-90,128-136`).
- **Fetch** (`externalPatchFetcher.ts:46-73`): `raw.githubusercontent.com/{owner}/{repo}/main/{path}/code-patches.json` — **branch `main`, no auth**.
- **Apply** (`tryApplyOne`, `:200-232`): literal `content.includes(precondition)` → `content.replace(...)` (**first match only**). Anchor gone → `applied:false` (no double-apply; idempotent by design). `critical:true` miss → throws.
- **Phases** (`codePatchPipelineHelpers.ts`): `blocks/*` = block-phase (post-install, written back per-file with SHA threading); everything else = canonical-phase (committed in the atomic LKG/reset Tree commit).
- **Runs at create AND reset** (`storefrontSetupPhase1.ts`, `lkgPinHelper.ts:117`, `edsResetRepoHelper.ts:281`, `edsPipeline.ts:151,532`). Reset is a **full reconcile** against canonical@LKG — re-applies all patches from scratch.
- **`exit` is documentary** — nothing in `src/` reads it. The real upstream machinery is the patches-repo CI (`scripts/lkg-gate.sh`): classifies each patch (`OK` / `OBSOLETE` → retirement PR / `MULTI_MATCH` → fails gate / `MISSING` / `FIXED_DIFFERENTLY`) and advances the pinned `last-known-good` SHA.

### Delivery decision: single global extension vendoring step (NOT patches)

**Locked:** Quick Edit ships as **one brand-agnostic extension vendoring step**, modeled on `pdp404HandlerPublisher.ts`, run in the EDS pipeline at create **and** reset for every EDS project — NOT as per-brand `code-patches.json` entries.

**Why not the patch mechanism:**
- The patch system is **per-brand by design** (separate `code-patches.json` per citisignal/custom/b2b, wired via `codePatchSource`/`codePatches[]` in `demo-packages.json`). There is no global/shared ledger. "Apply to all storefronts" via patches = duplicate the same entries into every brand ledger + every new brand must remember — drift-prone, the opposite of global.
- The engine **cannot create new files** (search/replace only), so `tools/quick-edit/quick-edit.js` escapes the mechanism regardless — and the Sidekick entry is Config-Service (extension-side) anyway. Keeping the two `scripts.js` edits in patches would split one cohesive change across two repos.
- **Precedent:** `pdp404HandlerPublisher` is already exactly this — a brand-agnostic, global vendoring step that modifies storefront files (`delayed.js`, `head.html`, `404.html`) at create/reset, independent of the patch ledgers. The codebase's real line is *brand-specific tweaks → patches; cross-cutting infrastructure → extension step.* Quick Edit is the latter. Consistent with ADR-006, not a violation.

**The one step applies all four changes:**
| Change | How (in the vendoring step) |
|---|---|
| `scripts/scripts.js`: add `export` to `loadPage` | search/replace in extension (read → replace → `createOrUpdateFile`), SHA-aware |
| `scripts/scripts.js`: add `?quick-edit` dynamic-import branch | search/replace, composes with the above |
| `tools/quick-edit/quick-edit.js` (net-new) | `createOrUpdateFile` unconditionally (idempotent via SHA / content) |
| Sidekick `quick-edit` plugin entry `{id,title,environments:["dev","preview"],event:"quick-edit"}` | Config Service registration (same pipeline) |

**Tradeoff accepted — lose the patches-repo LKG gate's anchor coverage.** The patches CI gate (`lkg-gate.sh`) won't watch the two `scripts.js` anchors once they leave the ledgers. Replace it with an **extension-side test** asserting both anchors still match the pinned-canonical `scripts.js`, run in CI. Risk is low: the extension pins canonical to an LKG SHA and only advances it deliberately, so anchors are stable until a deliberate bump.

**Templates** (resolved from `demo-packages.json`): canonical `hlxsites/aem-boilerplate-commerce@main`; patches `skukla/eds-demo-patches` (citisignal/custom/b2b ledgers). b2b uses `adobe-commerce/boilerplate-b2b-template`; isle5/buildright are full templates. Quick Edit is **absent from all of them today** (verified — zero of 6 markers). Decision: apply Quick Edit wiring to **all** EDS projects regardless of experience (inert under UE).

---

## EDS / DA.live config foundation (context)

- **Identity**: GitHub `owner/repo` + DA `org/site`; Config Service lookup key = GitHub owner/repo; DA site == repo name post-unification. Identity is env-var-sourced via `EdsProjectConfig`, not a first-class manifest field.
- **Auth**: one Adobe IMS token (`client_id="darkalley"`) serves DA content ops, Config Service, Helix DELETE. `DaLiveAuthService` (globalState + `~/.aem/da-token.json`). DI seam: `createDaLiveServiceTokenProvider` (`storefrontSetupHandlers.ts:477-486`). **No new token for EW.**
- **Two config sinks**: DA site-config sheet (drives the editor — `aem.repositoryId`, `editor.path`) vs Config Service registration body (`code`, `content.source`, `content.overlay`). EW work touches the **DA sheet** (`editor.path`) + the **Sidekick plugin** (Config Service), not the registration body.

---

## Implementation ordering (single .116 feature)

1. **Quick Edit vendoring step** (extension, global): new step modeled on `pdp404HandlerPublisher` — applies both `scripts.js` edits + writes `tools/quick-edit/quick-edit.js`, run at create/reset for all EDS projects. Add the extension-side anchor-match test. No `eds-demo-patches` changes.
2. **Config Service pipeline**: register the `quick-edit` Sidekick plugin entry at create/reset (folds into the same step or sits beside it).
3. **Setting + state + resolver**: `demoBuilder.daLive.authoringExperience` (default UE); `authoringExperience` on EDS metadata; `resolveAuthoringExperience`.
4. **URL + editor.path**: branch `getEdsDaLiveUrl`; parameterize `applyDaLiveOrgConfigSettings` to write the experience-matched, **site-scoped** `editor.path` row.
5. **Flip handler + UI**: `handleSetAuthoringExperience` (persist + immediate `editor.path` re-apply); kebab/dashboard toggle + relabeled "Author" button.
6. **Tests + runtime verify**: update `aiContextWriter`/`sanitization` tests; add `getEdsDaLiveUrl` unit test (currently none); test the resolver precedence + flip handler; runtime-verify EW loads on the param-less URL for a real site.

---

## Open questions for planning

1. **Button label UX** — relabel "Author in DA.live" to reflect the active experience ("Author in Universal Editor" / "Author in Experience Workspace"), or keep one label and surface the choice elsewhere? (Pure UX.)
2. **`getEdsDaLiveUrl` resolver placement** — confirm `typeGuards.ts` is webview-bundled (it appears to be); if so, keep `resolveAuthoringExperience` in `edsHelpers.ts` and pass the resolved value in, rather than importing `vscode` into `typeGuards.ts`.
3. **EW path segment** — no per-project doc path is stored; default to site root unless a concrete need appears (YAGNI).
4. **Brand scope** — apply Quick Edit + toggle to citisignal/custom/b2b; confirm whether isle5 / buildright (full templates, not thin-layer) need it for .116 or are deferred.
5. **~~`quick-edit.js` delivery~~** — RESOLVED: single global extension vendoring step (not patches, not upstream PR). See "Delivery decision" above.
6. **Migration of existing projects** — existing EDS projects have no `authoringExperience` metadata → resolver falls back to the global default (UE), so they keep current behavior. Confirm no backfill needed.

---

## Sources

**Web:** docs.da.live/about/early-access/{experience-workspace (verified 2026-06-11), quick-edit, author-kit, da-mcp}; first-party repos `adobe/da-live`, `adobe/da-nx`, `adobe-rnd/ew-extensions`, `aemsites/author-kit`, `aemsites/summit-portal`. **Codebase:** `typeGuards.ts`, `edsHelpers.ts` (`applyDaLiveOrgConfigSettings`, `resolveByomOverlayConfig`), `daLiveContentOperations.ts` (`applyOrgConfig`), `storefrontRepublishService.ts`, `dashboardHandlers.ts` (`handleSetProjectPinned`, `handleRepublishContent`), `codePatchRegistry.ts`, `externalPatchFetcher.ts`, `codePatchPipelineHelpers.ts`, `pdp404HandlerPublisher.ts`, `lkgPinHelper.ts`, `edsResetRepoHelper.ts`, `demoPackages.ts`, `base.ts`, `stateManager.ts`, `package.json`, ADR-006. **External:** `hlxsites/aem-boilerplate-commerce@main`, `skukla/eds-demo-patches` (+ `scripts/lkg-gate.sh`).

> ExL MCP note: `mcp__adobe-exl__*` was not reachable from the web agent's toolset; Experience League surfaced only the Universal Editor / Modernization Agent. Cross-verification relied on docs.da.live + first-party source repos.
