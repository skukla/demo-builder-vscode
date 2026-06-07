# Implementation Plan: Commerce-Connect Slice 1 — Repoless Wiring (DA.live content)

## Status Tracking

- [x] Planned
- [x] **Approved (PM sign-off: 2026-06-04)**
- [x] **Architecture repivoted 2026-06-05** — repoless replaces two-fork-sync as the locked plan; see backlog/storefront-topology.md and research/2026-06-05-architecture-validation.md
- [x] In Progress (TDD Phase) — **headless backend complete.** Steps 1, 3, 6 complete; Step 4 backend complete (4c.1–2 done, 4c.3–4 F5-gated); Step 5 headless seed done (UI prefill F5-gated); Step 7 predicate done (UI routing F5-gated); Step 2 read side done (onConfirm handoff + marker write-side remain)
- [ ] **F5 batch** (live extension) — 4c.3–4 (join-confirm→wizard handoff + gallery suppression), Step 2 onConfirm + marker finalization hook, Step 7 dashboard routing, Step 5 connect-step prefill render
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2026-06-04
**Last Updated:** 2026-06-06 (reconciliation: implementation status through Step 5; decisions & findings consolidated below)

---

## Executive Summary

> **In plain English:** this slice adds a **"Join a shared storefront"** path to the tool. (A *storefront* is the **website** shoppers browse; the *store/backend* — products, cart, checkout — is shared and separate.) A second salesperson pastes a link to someone else's demo storefront; the tool stands up *their own* storefront that **points at the shared code** (no copying), shows **their own content**, and checks out through the **shared backend store** — so they get an identical-looking, working website with no code to maintain. We build and test all of this with **DA.live content** first (which the tool already supports), so it ships without needing a live AEM environment. *(New here? See the plain-English summary + glossary in [the feature overview](../../backlog/commerce-connect-aem-sc/overview.md#in-plain-english--what-are-we-building).)*

**Feature:** The first buildable slice of the two-SC synced storefront — the **repoless wiring** (a "join, don't copy" path), exercised with **DA.live content** so it ships independently of any AEM environment. This proves the architecture end-to-end; Slice 2 (AEM Sites as a content source) slots into the same plumbing.

**Design source of truth:**
- `.rptc/backlog/commerce-connect-aem-sc/overview.md`
- `.rptc/backlog/commerce-connect-aem-sc/storefront-topology.md` (locked architecture; repoless as of 2026-06-05)
- `.rptc/backlog/commerce-connect-aem-sc/synthesis-and-build-order.md` (design → code)
- `.rptc/research/2026-06-05-architecture-validation.md` (live test evidence)

**Approach (additive, per the guardrails):** introduce a `flow` discriminator (`'commerce' | 'content'`) and an `upstream` reference on the project model, add a second wizard entry for the content SC that **reuses** the existing `WizardContainer`, filter steps by flow, and branch the existing executor so the content flow **creates a repoless satellite via the Configuration Service Admin API** rather than forking a repo. Content-side wiring rides the existing pipeline (DA.live for Slice 1, AEM Sites in Slice 2).

**What changed in the 2026-06-05 repivot:** the Content SC's wizard no longer forks the upstream into their org. Instead, the Content SC's `aem.live` site is registered as a **repoless satellite** via a single `PUT /config/{contentSC-org}/sites/{site}.json` call to the Configuration Service, with `code.owner` cross-referencing the Commerce SC's GitHub org. No fork, no sync engine, no per-fork config preservation. The cross-org mechanic is verified — Phase 3 returned HTTP 201, Phase 4 propagated a marker through Code Sync in 45 seconds.

**What we are NOT building (YAGNI guardrail):** the general compositional framework, a plugin architecture, AEM Sites as a content source (Slice 2), mirrored-package config (Slice 3+), two-way contribution, or a full migration of every `isEds` call site. Each step extends an existing slot additively.

**Forward-compat (see [engagement-modes-and-ownership](../../backlog/commerce-connect-aem-sc/engagement-modes-and-ownership.md)):** the design session surfaced an access-driven model with three engagement modes (A solo / B co-located single-org collaboration / C federated cross-org). Slice 1 builds Mode C's repoless substrate. Two constraints on this slice so it doesn't foreclose the others: (1) **do not hard-wire `flow:'commerce'` ⇒ DA.live** — content source is a separate dimension; (2) keep "who hosts the shared repo" **process-driven**, not a code-fixed role.

**Forward-compat with multisite ([ADR-003](../../../docs/architecture/adr/003-multisite-architecture-seam.md)):** Step 4's satellite-creation is built as a **general primitive** (`resolveSiteCodeSource` → `{codeOwner, codeRepo, createRepo}`), gated on the **presence of an `upstream` code reference**, not on `flow === 'content'`. This is the *same* primitive multisite needs — the content satellite is the cross-org instance; multisite is the same-org, multi-env instance. Step 4 touching `registerSite`/`buildSiteConfigParams` trips ADR-003's trigger #4, so it honors ADR-003's disciplines (reuse `buildSiteConfigParams` unchanged; parameter-driven) — but does **not** build the per-env list/state (still deferred). Net: Slice 1 leaves multisite's deferred "Step 2" with a tested foundation.

**Estimated Complexity:** Medium (shrunk from Medium-Complex by repoless)
**Estimated Timeline:** 3–4 days (shrunk from 4–6 days by repoless)

**Key Risks:**
1. Branching `executor.ts` (a long linear pipeline) without regressing the commerce/EDS path.
2. The `flow` discriminator interacting with the existing stack-property step filtering (`requiresGitHub`/`requiresDaLive`/`requiresAdobeAuth`).
3. Content-SC's wizard needing matching `aem.live` and `github.com` orgs (repoless prerequisite — each `aem.live` org must have at least one Code-Sync-synced repo).
4. Wizard discovery vs paste for Commerce SC's backend coords (still public, no security boundary, but ergonomic decision).

---

## Design References

**Locked architecture (2026-06-05):** repoless with per-org content sources — one shared code repo (the Commerce SC's xcom-based upstream), two `aem.live` sites pointing at it (Commerce SC's canonical anchor + Content SC's repoless satellite), each with its own AEM-authored content. Full architecture and validation evidence in `storefront-topology.md`.

**Current → target diff (from `synthesis-and-build-order.md`), updated 2026-06-05:**

| Flow | Current (verified file) | Delta | Attach point |
|---|---|---|---|
| Wizard | `WizardContainer.tsx`, `stepFiltering.ts` | EXTEND | 2nd entry command reusing the container; flow discriminator; flow-aware filtering |
| Executor + EDS setup | `features/project-creation/handlers/executor.ts` + `features/eds/handlers/storefrontSetupPhases.ts` | EXTEND | add `flow`; content path = **dedicated satellite branch**: one cross-org `ConfigurationService.registerSite` (no fork, no Code Sync App, no code-sync verification), skip mesh/backend deploy, skip the GitHub config-push (Phase 5); DA.live content (Phase 5b) runs |
| Project model | `src/types/base.ts:42` (`Project`) | EXTEND | add `flow`, `upstream{owner,repo}` |
| Content source | DA.live today (`fstabGenerator.ts`, `edsPipeline.ts`, `ensureEdsContent`) | REUSE | Slice 1 stays on DA.live |
| Site registration | fork-from-template via `GitHubRepoOperations.createFromTemplate` + GitHub App / code-sync | **REPLACE for content** | content flow takes the **Adobe-native repoless path**: a single cross-org `ConfigurationService.registerSite` (`code: { owner: <commerceSC>, repo: <upstream> }`, content = joiner's DA.live) with **no fork, no Code Sync App install, no code-sync verification**. The satellite reads upstream code via the Config Service `code` reference; Code Sync stays on the Commerce SC's canonical. Template-fork + code-sync machinery survives for the canonical site and the manual fork-and-own escape hatch. |
| Connect-Commerce | `ConnectStoreStepContent.tsx` → `discover-store-structure` → `commerceStoreDiscovery.ts` → `configGenerator.ts` | REUSE | content satellite seeds coords from upstream `config.json` (or Commerce SC's published config), confirm/override via discovery |
| Dashboard | `isEds` across ~20 files (`typeGuards.ts` + ~19 sites) | EXTEND (minimal) | per-(product, ownership) predicate; migrate only the content-flow entry sites |

**Path corrections to the design doc's file map (verified on `develop`):**
- The wizard entry is **not** `src/commands/createProjectWebview.ts`; it is launched via `src/commands/commandManager.ts` + `src/commands/handlers/`.
- `stateManager` lives at `src/core/state/stateManager.ts` (not `src/utils/`).
- `isEds` now spans **~20 files**, not ~10.

---

## PM Decisions

| # | Question | Decision | Rationale | Repoless impact |
|---|---|---|---|---|
| D1 | How does a content site obtain the Commerce SC's backend coordinates? | **Both, sharpened** — **primary:** *inherit/seed* from the upstream repo's `config.json` (or Commerce SC's published AEM-authored values; both public); **secondary:** *manual override / re-seed*. Live cross-account read is deferred. | Coords are client-visible config, so they travel safely. Avoids cross-org auth obstacles. | **Unchanged** — coords are still public, still inheritable. The Merchandising API "Authentication is not required" finding *strengthens* this decision. |
| D2 | Sync conflict strategy for a content fork? *(question predates the repivot)* | Default **`reset-to-upstream`**; keep `merge`-with-reset-fallback available; "promote to upstream" is the durable path. | Reliable by construction: content lives outside the repo and wiring files are preserved. | **Obsolete for satellites** under repoless — content sites read code natively; there is no satellite-side sync to drive a strategy on. The shipped `defaultSyncStrategyForProject` remains correct for commerce-flow projects (legacy and ongoing); content-flow projects under repoless never reach that code path. |
| D3 | How much `isEds` predicate centralization in Slice 1? | **Minimal additive** — introduce the predicate helper, migrate only the content-flow entry sites, leave the other ~18 `isEds` sites. | Avoids mixing a 20-site refactor with new behavior. | **Unchanged** — the predicate works the same regardless of topology. |
| D4 (2026-06-05; mechanic locked 2026-06-06) | How does the Content SC's wizard create their site? | **Dedicated repoless satellite path (Option B — the Adobe-native one).** A single `ConfigurationService.registerSite` → `PUT /config/{contentSC-org}/sites/{site}.json` with `code.owner = <commerceSC-org>`, `code.repo = <upstream>`, `content.source.url = <Content SC's DA.live URL>`. **No fork, no Code Sync App install, no code-sync verification, no GitHub config-push.** | One Admin API call is exactly Adobe's documented repoless mechanism — a satellite is a Config Service entry referencing upstream code, not a synced fork. Cross-org verified live 2026-06-05 (HTTP 201 + 45s propagation). Option A (reuse the full EDS pipeline with `repoInfo = upstream`) was rejected 2026-06-06: it would run App-install/code-sync/config-push against a repo the joiner doesn't own — all repoless anti-patterns. | New — the content satellite branch in `storefrontSetupPhases` hits this seam. |

---

## Decisions & findings since approval (reconciliation, 2026-06-06)

Locks and implementation findings that post-date the 2026-06-04 approval, so the plan explains *why* the code looks the way it does:

**Decisions (locked):**
- **D4 → Option B (Adobe-native).** Satellite creation is a **dedicated short path** (`executeSatelliteSetup`), not a branch through the canonical EDS pipeline. Option A (`repoInfo = upstream` through the shared pipeline) was rejected — it would run App-install / code-sync / config-push against a repo the joiner doesn't own.
- **Multisite alignment (ADR-003).** The satellite decision is a **general primitive** `resolveSiteCodeSource(input)` gated on the presence of an `upstream` (not on `flow`), so the same primitive serves the cross-org content satellite (now) and same-org repoless multisite (deferred). Touching `registerSite`/`buildSiteConfigParams` tripped ADR-003 trigger #4; we honored its disciplines (reuse `buildSiteConfigParams` unchanged) without building the per-env list/state. *(Code-review: kept as the documented multisite down-payment; doc right-sized.)*
- **Step 5 simplification.** The planned `upstreamConfigSeed.ts` (re-fetch the upstream `config.json`) was **dropped as redundant** — Step 2's marker resolve already carries the coords on `JoinDescriptor.commerce`, so seeding is a pure in-memory mapper (`seedComponentConfigsFromCommerce`). ACCS-first.

**Findings (surfaced while wiring):**
- **Site identity ≠ code source.** A satellite's aem.live **site** (`daLiveOrg/daLiveSite`) is decoupled from its **code** (the upstream); the canonical pipeline conflates them (repo == site). This forced the `siteOrg/siteName` split in `executeEdsPipeline` (defaulting preserves canonical) so Helix targets the satellite's site while code reads target the upstream.
- **`edsConfig.repoUrl` is double-duty** in the executor — both the local **clone source** *and* the Phase 5/5b **push/publish target**. For a satellite these diverge, so Phase 5 (config→GitHub) + Phase 5b (content) are gated off via an explicit `isContentFlow` guard (not a fragile "repoUrl empty" skip).
- **Satellite branch placement.** It must run **before** the orchestrator's `githubOwner`/template validation — a joiner has neither on the happy path (Adobe-side auth only).
- **Manifest persistence gap.** The writer + loader whitelists dropped `flow`/`upstream`; both fixed so a content project survives save+reload as content.

**Known debt:**
- **Marker write-side unwired** — `publishMasterMarkerForProject` / `writeMasterMarker` (Step 2) have 0 non-test callers. The read side is wired, but nothing writes `storefront-share.json` yet, so no real storefront is joinable. Pending the starter-side finalization hook (F5 batch), **not done**.

---

## Test Strategy

- **Framework:** Jest + ts-jest (Node), @testing-library/react (UI).
- **Coverage Goal:** 85% overall; 100% on the flow predicates and step-filtering logic.
- **Distribution:** Unit (75%), Integration (20%), E2E/manual (5%).

**Test categories:**
1. **Flow predicates** (unit) — `getProjectFlow`, `isContentFlow`, `isCommerceFlow` over commerce/content/legacy projects.
2. **Step filtering** (unit) — content flow hides prerequisites + mesh; commerce flow unchanged (regression).
3. **Satellite branch** (integration) — content flow creates the repoless satellite via one cross-org `ConfigurationService.registerSite`; **no** fork, **no** Code Sync App / code-sync verification, **no** Phase 5 GitHub config-push; skips Phase 3 (mesh) and backend deploy; DA.live content (Phase 5b) runs.
4. **Backend coords** (unit/integration) — seed from upstream `config.json`; discovery/override path; PaaS vs ACCS gating.
5. **Repoless satellite wiring** (unit) — content metadata sets `upstream.{owner,repo}`; Configuration Service PUT carries the expected payload shape (`code.owner` cross-org; `content.source.url` per the SC's DA.live).
6. **Dashboard predicate** (unit) — content-flow project routes through the new predicate; commerce/EDS projects unchanged.

**Regression guard:** the existing commerce/EDS creation path must be untouched — every executor/filtering/predicate change is gated on `flow === 'content'` (or a predicate) and defaults to today's behavior when `flow` is absent.

**Per-step verification gate** (run during each step's REFACTOR, before commit):
1. step tests (RED→GREEN) + targeted regression suite for the touched area
2. `eslint` on changed files
3. `tsc --noEmit` (full typecheck)
4. `tests/sop/` (the repo's automated SOP suite)
5. targeted `code-patterns.md` grep of changed files

A step is not "done" until all five are green.

---

## Implementation Constraints

- **File size:** <500 lines/file; **complexity:** <50 lines/function.
- **Timeouts:** use `TIMEOUTS.*` from `@/core/utils/timeoutConfig` — no magic numbers.
- **Imports:** path aliases across boundaries, relative within feature.
- **REUSE-FIRST (mandate):** Slice 1 is **integration of existing pieces**, not new primitives. Consult the **Reuse-First Inventory** below and prefer the listed asset; introduce net-new only where the inventory marks it "net-new."
- **CONFIGURATION-DRIVEN (mandate):** prefer expressing behavior as **data** in existing config files over imperative branches. The content flow's no-mesh / step set / availability should fall out of config, not `if (isContentFlow)` logic.
- **Dependencies:** REUSE `discoverStoreStructure`, `configGenerator`, `ensureEdsContent`, `WizardContainer`, `filterStepsForStack`, **`ConfigurationService`**, and the full Reuse-First Inventory below. **No new npm packages.**
- **Additive only:** absent `flow` ⇒ identical to today's commerce/EDS behavior.

---

## Risk Assessment

### Risk 1 — Regressing the commerce/EDS executor path
- **Likelihood:** Medium · **Impact:** High · **Priority:** Critical
- **Mitigation:** every content branch is gated; add a characterization test of the existing EDS path *before* branching (Step 4 RED); default-when-absent.
- **Contingency:** keep the content branch as an early `if (isContentFlow) {… return}` segment that never falls through to commerce logic.

### Risk 2 — `flow` vs stack-property step filtering
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** model flow as a step-level discriminator composed with the existing stack checks, not a replacement; unit-test both flows.
- **Status:** ✅ Mitigated — Step 3 design-refined to model `flow` as a top-level step field with regression-guarded composition; shipped 2026-06-04.

### Risk 3 — Content-SC's aem.live + GitHub org prerequisite (repoless-specific)
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** the Configuration Service requires every `aem.live` org to have a matching `github.com` org with at least one repo synced via Code Sync App. The Content SC's wizard needs to either verify these prerequisites or guide setup. Validated empirically 2026-06-05 (the `kukla-demos` anchor pattern).
- **Contingency:** wizard surfaces a clear "set up your aem.live org first" preflight with one-time anchor repo creation guidance.

### Risk 4 — Backend coordinates obtained from upstream
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** Slice 1's content path is **inherit-from-upstream-`config.json` + manual override** — a public file read that works offline of the Commerce org, so it needs no admin creds (PaaS) and no IMS token (ACCS).
- **Strengthened 2026-06-05:** the Adobe Merchandising API docs state verbatim "Authentication is not required" — the required header set is all public identifiers. The cross-account read story is on firmer ground than the original "URL + public keys" phrasing.

### ~~Risk 5 — Sync reliability with AI-customized forks~~
- **Resolution 2026-06-05:** dissolved under repoless. Content satellites do not fork or sync code; they read the upstream natively. The risk applied to the two-fork-sync model; it no longer applies. The shipped `reset-to-upstream` default (Step 6) is dormant for content-flow projects under the new architecture; it remains correct for commerce-flow projects.

---

## File Reference Map

### Existing files (to modify)
- `src/types/base.ts` — add `flow`, `upstream` to `Project` (Step 1) ✅
- `src/types/typeGuards.ts` — add flow predicates (Steps 1, 7) ✅
- `src/features/eds/handlers/storefrontSetupPhases.ts` (+ `storefrontSetupHandlers.ts`, `storefrontSetupPhase1.ts`) — content-flow **satellite branch**: skip fork + Code Sync App + code-sync verification; one cross-org `registerSite`; skip the GitHub config-push (Steps 1, 4)
- `src/features/project-creation/handlers/executor.ts` — persist `flow`/`upstream` on the saved content project; gate Phase 5 (GitHub config-push) off for satellites (Steps 1, 4, 5)
- `src/commands/commandManager.ts` + `src/commands/handlers/` — register content-SC entry (Step 2) 🟡
- `src/features/project-creation/ui/wizard/stepFiltering.ts` — flow-aware condition (Step 3) ✅
- `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx` — content-flow seeding/override (Step 5)
- `src/features/eds/services/configGenerator.ts` — accept upstream-seeded coords (Step 5)
- `src/features/eds/services/configurationService.ts` — `registerSite` is the satellite-creation seam; cross-org `codeOwner = upstream` (Step 4)
- Dashboard content-flow entry sites only (Step 7) 🟡 — predicate shipped; UI routing deferred

### New files (to create)
- `src/commands/handlers/createContentScProjectWebview.ts` (or equivalent handler) — Step 2 🟡 (partial: marker write/read shipped; entry handler in progress)
- Test files mirroring each (see step files)

### Net-new explicitly deferred (NOT this slice)
- AEM Sites content-source service/variant (Slice 2)
- Mirrored-package config, App Builder add-flow, two-way contribution (Slice 3+)
- Config-as-content writer (replacing `config.json` repo writes with AEM content node writes via Configuration Service) — slotted for Slice 2 alongside AEM Sites support, when the multi-env config story becomes meaningful.

---

## Content-SC (Joiner) UX flow — built from reused parts, repointed under repoless

**Reuse-first applies to the building blocks, not the journey.** The content SC gets a **new end-to-end flow** — a new entry, two new screens, and a trimmed wizard sequence that differs from the commerce flow.

Screen-by-screen (Slice 1 / DA.live), with the building step and key states:

1. **Home → "Join a shared storefront"** — *new entry; reuses the dashboard CTA cluster* — **Step 2**.
2. **Paste-link screen** — *new screen; reuses `FormField` (url) + `useCanProceed`* — states: empty / invalid / valid — **Step 2**.
3. **Resolve on Continue** — *Backend-Call-on-Continue; reuses `GitHubFileOperations` (public read, no auth)* — states: loading overlay / error + retry — **Step 2**.
4. **Confirmation preview** — *new screen; reuses `ReviewStep` LabelValue / `Modal`* — "Joining **CitiSignal** by `<owner>` → backend `<endpoint>`; you'll author in your **own** DA.live (AEM in Slice 2)" → confirm / back — **Step 2**.
5. **Trimmed wizard** — *reuses `WizardContainer` shell + seeded state; gallery suppressed; prerequisites/mesh/adobe skipped* — name your site → connect **own** DA.live → **inherited backend** (confirm, no discovery) → create — **Steps 3 (filtering), 5 (coords), 4 (executor → Configuration Service satellite creation)**.
6. **Creation / progress** — *reuses `ProjectCreationStep` + the content **satellite branch**, which creates a repoless satellite via one cross-org `ConfigurationService.registerSite` — no fork, no Code Sync App, no code-sync verification, no GitHub config-push* — **Step 4**.
7. **Done → dashboard** — *content-flow project rendered via the archetype predicate* — **Step 7**.

The novelty lives in the **sequence + the two new screens (paste-link, preview) + the gallery suppression**; the parts are reused. The terminal action is the **Adobe-native repoless mechanic**: previously (two-fork-sync) the flow forked the upstream into the Content SC's org and wired sync. **Now it calls `ConfigurationService.registerSite`** to register their site as a repoless satellite of the Commerce SC's canonical — a single PUT, no repo of their own. The user-visible flow is the same; the back-end mechanic is simpler and matches how Adobe's repoless is documented to work.

---

## Reuse-First Inventory (audited 2026-06-04, repoless-update 2026-06-05)

### UI components
- `CopyableText` — clipboard write + ✓ feedback → the **Share** link (Step 2).
- `Modal` — `{title, actionButtons, onClose}` → confirmation/preview dialog (Step 2).
- `FormField` — `type:'url'`, error/showError → the **paste-link** field (Step 2).
- `ReviewStep` LabelValue / ConfigurationSummary — the **preview** presentation (Step 2).
- `StatusDot` — link-validity indicator (Step 2).
- `SingleColumnLayout`, `useCanProceed`, `useFocusTrap` — layout, Continue-gating, a11y (Step 2).
- projects-dashboard: `ProjectsDashboard`, `DashboardEmptyState`, `ProjectActionsMenu` — add **"Join"** + **"Share"** entries (Steps 2, 7).

### Wizard shell + seeding
- `WizardContainer` — already accepts `importedSettings`/`editProject` initial state; reuse this prop-seeding path to inject the resolved join state (Step 2).
- `useWizardState` — merges defaults with init props (Step 2).
- `settingsSerializer.extractSettingsFromProject` — the **pre-populate** pattern; adapt to map the master `config.json` → wizard state (Steps 2, 5).
- `stepFiltering.filterStepsForStack` + `StepCondition`/`FilterOptions` — extend with the `flow` predicate (Step 3). ✅

### Webview / command infrastructure
- `BaseWebviewCommand` — extend for the Join command (Step 2).
- `WebviewCommunicationManager` — handshake + request/response (Step 2).
- `dispatchHandler` + object-literal handler maps — the join handlers (Step 2).
- `HandlerContext` + `createErrorResponse` — handler shape + errors (Step 2).

### GitHub + backend services
- `GitHubFileOperations` read-file — **public reads need no auth**; read master `config.json` + marker (Steps 2, 5). ✅
- `GitHubRepoOperations.createFromTemplate` + the GitHub Code Sync App install / code-sync verification — survive for the canonical site (Commerce SC) and the manual fork-and-own escape hatch. **None of them run for the content-SC satellite** — a satellite has no repo of its own; it reads upstream code via the Config Service `code` reference.
- **`ConfigurationService.registerSite` + `buildSiteConfigParams`** (in `src/features/eds/services/configurationService.ts`) — **the satellite-creation seam** for the content-SC flow. Already speaks the Admin API and already separates the `org`/`site` lookup key (joiner's DA.live) from `codeOwner`/`codeRepo` (the code source); Step 4 passes the **upstream** as the code source → cross-org `code.owner`.
- `configGenerator.generateConfigJson` — config.json shape; falls back to direct backend URL with no mesh (Steps 4, 5).
- `ensureEdsContent` — DA.live content / Phase 5b (Step 4).
- `populateEdsMetadata` — EDS metadata write path; extend to also write the **self-describing marker** (Steps 2, 6). ✅

### Patterns (`docs/patterns/`)
- **Backend Call on Continue** — paste-link is UI-only; resolve/join on Continue with a loading overlay (Step 2).
- **Two-column layout**, **loading overlay**, **error-at-commitment-point**, **state-clearing** — preview/validation UX (Step 2).

### Cross-cutting utilities
- `TIMEOUTS` + `FRONTEND_TIMEOUTS` — no magic numbers (all steps).
- `StepLogger`/`getLogger` — step logging (all steps).
- `ServiceLocator`, `DisposableStore` — DI + disposal (Step 2).
- `typeGuards` — flow + archetype predicates (Steps 1, 7). ✅

### Net-new (kept deliberately minimal)
- `flow` discriminator + `upstream` + predicates (Step 1). ✅
- `resolveJoinLink` (fetch master `config.json` + marker → `JoinDescriptor`) + the small **self-describing marker** schema (Step 2). 🟡 (partial)
- **Token = the public master repo URL — NO link encoding, expiry, checksum, or versioning.**
- **No new EDS pipeline phase.**
- **Config-first, not imperative** — content flow rides existing pipeline via data: mesh is `optionalDependencies` in `stacks.json` (content omits it), backend is URL-in-config (nothing to provision), satellite creation is a Configuration Service PUT.
- New config field **`supportedFlows`** on `stacks.json` (+ `stacks.schema.json` update) gates content-flow availability as data — Step 4. ✅
- Flow-aware filter branch (Step 3) ✅; content-coords seed (Step 5); satellite creation via Configuration Service (Step 4); `(product,ownership)` predicate + minimal migration (Step 7) ✅.

### Repoless-shipped but now dormant for content flow
- `defaultSyncStrategyForProject` (Step 6, shipped 2026-06-04) — content-flow projects under repoless do not sync code, so the `'reset'` default never executes for them. The function remains correct for commerce-flow projects, including any future commerce projects that need fork-and-sync. Keep as-is; document its scope in step-06.md.

---

## Assumptions

- [x] **A1:** `aem-boilerplate-xcom`-style upstream is reachable as a normal Git template/source. ✅ Confirmed — public Apache-2.0 repo at `adobe-rnd/aem-boilerplate-xcom`; CitiSignal One uses it.
- [ ] **A2:** The upstream repo carries usable backend coordinates the Content SC can seed from. *Impact if wrong:* fall back to discovery / manual entry (D1 still holds via the override path).
- [x] **A3:** ~~`TemplateSyncService` syncing from the upstream needs only `templateOwner/templateRepo` metadata.~~ **Obsolete under repoless** — content satellites don't sync code; they read the upstream natively via `code.owner`.
- [ ] **A4 (upstream wiring):** the inherit/seed path only yields real coordinates if the upstream's `config.json` (or the Commerce SC's published equivalent) is wired with their backend. The Commerce SC's "maintain the upstream" step wires it; alternatively the Commerce SC publishes coords in their AEM as content. **Impact if wrong / unwired:** Slice 1 still works via the **manual override** path; only the zero-friction "confirm" experience depends on this. Not a blocker.
- [x] **A5 (repoless prerequisite):** Each `aem.live` org must have a matching `github.com` org with at least one Code-Sync-synced repo (the "anchor"). ✅ Confirmed and tested 2026-06-05.

---

## Next Actions

**Headless backend is complete.** What's done and what remains:
1. Step 1 — Project model: flow + upstream + predicates ✅
2. Step 2 — Join/resolve read side ✅; **onConfirm→wizard handoff + marker write-side** remain (F5)
3. Step 3 — Flow-aware step filtering ✅
4. Step 4 — Satellite creation ✅ backend (`resolveSiteCodeSource`, `executeSatelliteSetup`, site/code split, executor guards, manifest persistence); **4c.3–4 (join-confirm handoff + gallery suppression)** remain (F5)
5. Step 5 — Backend-coords seed ✅ headless (`seedComponentConfigsFromCommerce`); **connect-step prefill render** remains (F5)
6. Step 6 — ~~Upstream sync wiring + reset default~~ (shipped; **dormant for content** under repoless; correct for commerce) ✅
7. Step 7 — Dashboard archetype predicate ✅; **dashboard UI routing** remains (F5)

**Remaining = the F5 batch** (live extension): the join-confirm→seeded-wizard handoff, gallery suppression, connect-step prefill render, dashboard routing, and the marker finalization hook (write-side). **Then** the Efficiency + Security quality gates → Complete.

---

## Plan Maintenance

Living document. Small adjustments inline + note in a "Deviations" section; major changes via `/rptc:helper-update-plan`. **Repivot of 2026-06-05** (two-fork-sync → repoless) is documented above as a complete reframe; individual step files carry their own reframe notes for what shipped under the old architecture vs what's repointed.
