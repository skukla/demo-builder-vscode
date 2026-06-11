# Plan Overview: Per-Project Authoring Experience (Universal Editor ↔ Experience Workspace)

- **Feature slug:** `experience-workspace-default-authoring`
- **Source research:** `.rptc/research/experience-workspace-default-authoring/research.md` (all "Decisions locked" are FINAL)
- **Target release:** Next release AFTER `1.0.0-beta.116` (`.116` has shipped — do NOT target it)
- **Branch base:** `develop`
- **Type:** Feature (multi-layer, ships as one feature)

---

## Goal

Let an SC choose, **per project**, between two AEM authoring experiences with a **global default** and a **per-project override**:

1. **Universal Editor (UE)** — current behavior. "Author" button → `https://da.live/#/<org>/<site>`; DA `editor.path` punch-out to `experience.adobe.com`.
2. **Experience Workspace (EW)** — da.live-native canvas. "Author" button → param-less `https://da.live/canvas#/<org>/<site>/`; DA `editor.path` → `/<org>/<site>=https://da.live/canvas#`.

Global default = **Universal Editor** (preserves current behavior). EW is opt-in per project or via the global setting. The choice drives the "Author" button target, its label, the DA `editor.path` value, and (already brand-agnostic) the Quick Edit WYSIWYG wiring.

---

## Executive Summary

Every seam already exists. The work is six surgical steps, ordered so the load-bearing safety change (site-scoping `editor.path`) lands with a test that proves per-project isolation.

| # | Step | Risk |
|---|------|------|
| 0 | RPTC re-initialization | — |
| 1 | Quick Edit vendoring step (global, create+reset) + extension-side anchor-match test | Medium (loses LKG-gate anchor coverage — replaced by anchor-match test) |
| 2 | Register `quick-edit` Sidekick plugin entry (Config Service pipeline) | Low |
| 3 | Setting + state field + resolver (`resolveAuthoringExperience`) | Low |
| 4 | URL branch (`getEdsDaLiveUrl`) + **site-scope `editor.path`** (`applyOrgConfig` → `applySiteConfig`) | **HIGH (load-bearing)** |
| 5 | Flip handler (`handleSetAuthoringExperience`) + UI (kebab/dashboard toggle + relabeled Author button) | Medium |
| 6 | Test sweep + runtime verify | Low |

---

## Critical Current-State Facts (verified 2026-06-11)

- `aem.repositoryId` is **already** site-scoped via `applySiteConfig` (`edsHelpers.ts:689-698`). `.116` shipped this.
- `editor.path` is **still** org-scoped via `applyOrgConfig(daLiveOrg, {'editor.path': ...})` (`edsHelpers.ts:700-713`), using `editorPathPrefix` (default `'site/to/path/content'`, read at `:677`).
- **REUSE `applySiteConfig`** (`daLiveContentOperations.ts:2432`) for the editor.path scope flip — do NOT reinvent merge/scoping plumbing. It is backed by `writeMergedDataConfig` (`:2453`), an idempotent per-key data-sheet merge preserving all other sheets (incl. permissions).
- All three `getEdsDaLiveUrl(project)` call sites are **backend-side** with `vscode` + full project access:
  - `showDashboard.ts:147`, `projects-dashboard/handlers/dashboardHandlers.ts:788`, `aiContextWriter.ts:144`.
  - The webview never computes the URL — it posts `openDaLive` and the backend resolves. So the resolver + URL param threading stays entirely backend-side; `typeGuards.ts` keeps `vscode` OUT.
- Sidekick plugins live in `src/features/eds/config/config-template.json` under `sidekick.plugins[]`, fed to `ConfigurationService.registerSite` via `buildSiteConfigParams`/`configGenerator.ts`. Reset re-applies via `updateSiteConfig` (`edsResetService.ts:144`).
- Quick Edit markers absent from all 6 templates today (verified in research).

---

## Resolutions to Research Open Questions (BAKED IN — do not re-ask)

1. **Button label:** relabel dynamically — "Author in Universal Editor" / "Author in Experience Workspace" (drives off resolved metadata; pure-local).
2. **Resolver placement:** `resolveAuthoringExperience(metadataValue)` lives in `edsHelpers.ts` (needs `vscode` for global-setting fallback). Pass the resolved value INTO `getEdsDaLiveUrl(project, experience)`. UE → `https://da.live/#/<org>/<site>`; EW → param-less `https://da.live/canvas#/<org>/<site>/` (trailing slash = site root; no `?nx`/`?nxver`).
3. **EW path segment:** site root only — no stored per-project doc path (YAGNI).
4. **Quick Edit brand scope:** apply to ALL EDS projects at create AND reset, every template, idempotent (mirrors `pdp404HandlerPublisher`). No special-casing.
5. **Migration:** existing EDS projects have no `authoringExperience` metadata → resolver falls back to global default (UE) → current behavior preserved. **No backfill step.**

---

## Test Strategy (design FIRST — TDD)

### Specification

- **A. I/O formats:**
  - `resolveAuthoringExperience(metadataValue: string | undefined): 'universal-editor' | 'experience-workspace'` — per-project value wins, else global setting, else `'universal-editor'`.
  - `getEdsDaLiveUrl(project, experience): string | undefined` — branches on experience.
  - `editor.path` row value: UE = `<prefix>=https://experience.adobe.com/#/@<IMSOrgId>/aem/editor/canvas/main--<site>--<org>.ue.da.live`; EW = `/<org>/<site>=https://da.live/canvas#`.
  - Quick Edit step result mirrors `Pdp404InstallResult` shape (`{ installed, reason? }`).
- **B. Business rules:** UE preserves current URL/path exactly; flip re-applies editor.path immediately (no full republish); Quick Edit idempotent (re-run = no-op).
- **C. Edge cases:** non-EDS project → `getEdsDaLiveUrl` returns undefined; missing org/site → undefined; missing metadata → UE; invalid metadata string → UE (fall through); `scripts.js` anchor absent (already patched) → skip, no double-apply; net-new `quick-edit.js` already present → idempotent skip.
- **D. Integration constraints:** single Adobe IMS token (no new token for EW); `applySiteConfig` preserves permissions/library sheets; GitHub `createOrUpdateFile` is SHA-aware.
- **E. Performance:** flip is one metadata write (local) + one site-config round-trip; no full reset.
- **F. Security:** no secrets in URLs/config (repo is PUBLIC); sanitize/escape URLs in aiContextWriter (already done via `sanitizeUrl`/`escapeMarkdown`).

### Test types

- **Unit:** resolver precedence; `getEdsDaLiveUrl` branch (NEW — none today); editor.path site-scope routing; Quick Edit anchor builders + idempotency; anchor-match-against-canonical guard test.
- **Integration:** flip handler (persist + immediate editor.path re-apply); config-template includes `quick-edit` plugin → flows to `registerSite`.
- **React:** ProjectActionsMenu relabel; dashboard ActionGrid toggle wiring.
- **Runtime verify (manual, Step 6):** EW loads on param-less URL for a real site.

### Coverage goals

80%+ overall; 100% on resolver, URL branch, editor.path scoping, flip handler (critical paths).

---

## Implementation Constraints

- **File size:** ≤500 lines. New `quickEditPublisher.ts` modeled on `pdp404HandlerPublisher.ts` (~500 lines is the ceiling — keep the Quick Edit step lean; it has fewer sub-installs than pdp404).
- **Function size:** ≤50 lines; complexity <10.
- **Dependencies:** NO new runtime deps. NO `eds-demo-patches` changes. NO `vscode` import into `typeGuards.ts`.
- **Reuse (mandatory):** `applySiteConfig` (scoping), `GitHubFileOperations.getFileContent`/`createOrUpdateFile` (SHA-aware vendoring), `pdp404HandlerPublisher` patterns (idempotent marker checks), `handleSetProjectPinned` recipe (pure-local persist), `resolveByomOverlayConfig` pattern (resolver), `config-template.json` (Sidekick plugin).
- **No premature abstraction:** the experience is a 2-value union — use a string union, not an enum class or strategy pattern.

---

## Dependencies & Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **editor.path site-scope regression** clobbers sibling sites sharing a DA org | Medium | HIGH | Step 4 RED test asserts the row key is `/<org>/<site>` and that `applySiteConfig` (not `applyOrgConfig`) is called; reuse battle-tested `writeMergedDataConfig` merge that preserves other sheets. |
| **Lost LKG-gate anchor coverage** for the two `scripts.js` anchors | Medium | Medium | Step 1 extension-side anchor-match test asserts both anchors still match pinned-canonical boilerplate; runs in CI. Canonical only advances on deliberate LKG bump. |
| Flip leaves UE↔EW button/label out of sync with editor.path | Low | Medium | Flip handler persists metadata then re-applies editor.path in the same handler; button/label derive from the same resolved metadata. |
| Quick Edit step breaks create/reset on failure | Low | Medium | Non-fatal at every step (mirror pdp404: log + return `{installed:false, reason}`), never throw. |
| EW alpha URL drifts (param-less form changes upstream) | Low | Medium | Runtime-verify in Step 6; single URL constant, easy to bump. |

**No circular dependency risk:** resolver in `edsHelpers.ts` (already imports `vscode`); `typeGuards.ts` stays `vscode`-free and gains only a pure param.

---

## Affected Files (master list)

**Production:**
- `package.json` (new setting `demoBuilder.daLive.authoringExperience`)
- `src/types/typeGuards.ts` (`getEdsDaLiveUrl` gains `experience` param + EW branch)
- `src/features/eds/handlers/edsHelpers.ts` (`resolveAuthoringExperience` NEW; `applyDaLiveOrgConfigSettings` editor.path → site-scoped + experience-parameterized)
- `src/features/eds/services/quickEditPublisher.ts` (NEW — vendoring step)
- `src/features/eds/handlers/storefrontSetupPhase2.ts` + `src/features/eds/services/edsResetRepoHelper.ts` (wire Quick Edit step at create + reset)
- `src/features/eds/config/config-template.json` (`quick-edit` Sidekick plugin entry)
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` (`handleSetAuthoringExperience` NEW; thread experience into `handleOpenDaLive` URL resolve)
- `src/features/projects-dashboard/handlers/projectsListHandlers.ts` (register `setAuthoringExperience`)
- `src/features/dashboard/commands/showDashboard.ts` + `src/features/dashboard/handlers/dashboardHandlers.ts` (thread experience into URL resolve; dashboard toggle handler)
- `src/features/project-creation/services/aiContextWriter.ts` (resolve + pass experience into URL)
- `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx` (relabel Author + add flip action)
- `src/features/projects-dashboard/ui/index.tsx` (flip callback wiring)
- `src/features/dashboard/ui/components/ActionGrid.tsx` + `ProjectDashboardScreen.tsx` + `hooks/useDashboardActions.ts` (relabel + toggle)

**Tests (mirrored under `tests/`):** see each step. Key: NEW `getEdsDaLiveUrl` test, updated `edsHelpers-applyDaLiveOrgConfigSettings.test.ts` (editor.path now site-scoped), NEW `quickEditPublisher.test.ts` + anchor-match test, NEW resolver + flip-handler tests, updated `aiContextWriter.test.ts`.

---

## Self-Critique

- **Steps:** 6 implementation + Step 0 = 7. ≤10 ✅
- **New files:** `quickEditPublisher.ts` + its test + anchor-match test + resolver/flip tests. New *production* files = 1 (`quickEditPublisher.ts`). ≤5 ✅
- **Indirection:** ≤3 ✅ (resolver → URL builder → consumer).
- **Abstractions:** string union (2 values), no class/strategy. ✅
- **TDD alignment:** every step lists RED before GREEN. ✅
- **Quality score (self):** Completeness 4.5 / TDD 5 / Actionability 4.5 / Risk 4.5 → **4.6/5** ✅

---

## Step Files

- `step-00.md` — RPTC re-initialization
- `step-01.md` — Quick Edit vendoring step + anchor-match test
- `step-02.md` — Register `quick-edit` Sidekick plugin
- `step-03.md` — Setting + state field + resolver
- `step-04.md` — URL branch + site-scope editor.path (load-bearing)
- `step-05.md` — Flip handler + UI
- `step-06.md` — Test sweep + runtime verify
