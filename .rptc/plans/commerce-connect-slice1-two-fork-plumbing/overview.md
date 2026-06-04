# Implementation Plan: Commerce-Connect Slice 1 — Two-Fork Plumbing (DA.live content)

## Status Tracking

- [x] Planned
- [x] **Approved (PM sign-off: 2026-06-04)**
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2026-06-04
**Last Updated:** 2026-06-04 (approved; entering TDD)

---

## Executive Summary

**Feature:** The first buildable slice of the two-SC synced storefront — the
**two-fork plumbing**, exercised with **DA.live content** so it ships *without*
an AEM environment. This proves the architecture end-to-end; Slice 2 (AEM Sites
as a content source) slots into the same plumbing once the verification spike
passes.

**Design source of truth:**
- `.rptc/backlog/commerce-connect-aem-sc/overview.md`
- `.rptc/backlog/commerce-connect-aem-sc/storefront-topology.md` (locked architecture)
- `.rptc/backlog/commerce-connect-aem-sc/synthesis-and-build-order.md` (design → code)

**Approach (additive, per the guardrails):** introduce a `flow` discriminator
(`'commerce' | 'content'`) and an `upstream` reference on the project model, add
a second wizard entry for the content SC that **reuses** the existing
`WizardContainer`, filter steps by flow, and branch the existing executor to
**fork-from-upstream + skip mesh/backend-deploy** while **reusing** the existing
config-sync (Phase 5) and DA.live content (Phase 5b) machinery. Content forks
sync from the upstream via the **existing** `TemplateSyncService`.

**What we are NOT building (YAGNI guardrail):** the general compositional
framework, a plugin architecture, AEM Sites as a content source (Slice 2),
mirrored-package config (Slice 3+), two-way contribution, or a full migration of
every `isEds` call site. Each step extends an existing slot additively.

**Forward-compat (see [engagement-modes-and-ownership](../../backlog/commerce-connect-aem-sc/engagement-modes-and-ownership.md)):**
the design session surfaced an access-driven model with three engagement modes
(A solo / B co-located single-org collaboration / C federated cross-org). Slice 1
builds Mode C's two-fork substrate. Two constraints on this slice so it doesn't
foreclose the others: (1) **do not hard-wire `flow:'commerce'` ⇒ DA.live** —
content source is a separate dimension; (2) keep "who hosts the shared repo"
**process-driven**, not a code-fixed role. An **open determinant** (does the
content party author in the Commerce org's AEM (B) or their own (C)?) may reorder
build priority; Slice 1 stays valid as substrate regardless.

**Estimated Complexity:** Medium-Complex
**Estimated Timeline:** 4–6 days

**Key Risks:**
1. Branching `executor.ts` (a long linear pipeline) without regressing the
   commerce/EDS path.
2. The `flow` discriminator interacting with the existing stack-property step
   filtering (`requiresGitHub`/`requiresDaLive`/`requiresAdobeAuth`).
3. Cross-account backend-coordinate acquisition (PaaS vs ACCS discovery
   asymmetry).
4. Sync reliability when forks carry locally-customized (AI-authored) code.

---

## Design References

**Locked architecture:** Scenario B · Option X · two identical transacting forks
(`storefront-topology.md`). A neutral **upstream** holds shared storefront code;
both SCs **fork + sync**; each authors their own content; both transact against
the Commerce SC's backend by URL.

**Current → target diff (from `synthesis-and-build-order.md`), reconciled with a
fresh code-walk on `develop`:**

| Flow | Current (verified file) | Delta | Attach point |
|---|---|---|---|
| Wizard | `WizardContainer.tsx`, `stepFiltering.ts` | EXTEND | 2nd entry command reusing the container; flow discriminator; flow-aware filtering |
| Executor | `features/project-creation/handlers/executor.ts` (single linear pipeline, `isEdsStack` branches) | EXTEND | add `flow`; content branch = fork-from-upstream + skip mesh (Phase 3) + skip backend deploy; reuse Phase 5/5b |
| Project model | `src/types/base.ts:42` (`Project`) | EXTEND | add `flow`, `upstream{owner,repo}` |
| Content source | DA.live today (`fstabGenerator.ts`, `edsPipeline.ts`, `ensureEdsContent`) | REUSE | Slice 1 stays on DA.live |
| Sync | `features/updates/services/templateSyncService.ts` (merge w/ reset-fallback; preserves `config.json`/`fstab.yaml`) | REUSE | set `templateOwner/templateRepo` = upstream; default `reset` for content |
| Connect-Commerce | `ConnectStoreStepContent.tsx` → `discover-store-structure` → `commerceStoreDiscovery.ts` → `configGenerator.ts` | REUSE | content fork seeds coords from upstream `config.json`, confirm/override via discovery |
| Dashboard | `isEds` across ~20 files (`typeGuards.ts` + ~19 sites) | EXTEND (minimal) | per-(product, ownership) predicate; migrate only the content-flow entry sites |

**Path corrections to the design doc's file map (verified on `develop`):**
- The wizard entry is **not** `src/commands/createProjectWebview.ts`; it is
  launched via `src/commands/commandManager.ts` + `src/commands/handlers/`.
- `stateManager` lives at `src/core/state/stateManager.ts` (not `src/utils/`).
- `isEds` now spans **~20 files**, not ~10.

---

## PM Decisions

| # | Question (from synthesis "Open product questions") | Decision | Rationale |
|---|---|---|---|
| D1 | How does a content fork obtain the Commerce SC's backend coordinates? | **Both, sharpened** — **primary:** *inherit/seed* from the **upstream repo's `config.json`** (these coords are **public storefront config**, not secrets); **secondary:** *manual override / re-seed* (paste the URL the Commerce SC provides, adjust store-view). The **authenticated `discoverStoreStructure`** flow stays the **Commerce SC's same-account tool**; the content fork does **not** depend on it cross-account. **Live cross-account read is deferred** to live verification. | Coords are client-visible config, so they travel safely with the fork and are preserved by sync — no credential sharing, no cross-org auth. Avoids the PaaS-admin-creds and ACCS-discovery-service obstacles for the content fork. See Step 5. |
| D2 | Sync conflict strategy for a content fork? | Default **`reset-to-upstream`**; keep `merge`-with-reset-fallback available; "promote to upstream" is the durable path (later slice). | Reliable *by construction*: content lives in DA.live/AEM (not the repo) and wiring files are preserved, so reset never destroys the SC's real work. Arbitrary two-way auto-merge of AI-divergent code is not reliably solvable — the model routes durable code changes through the upstream instead. |
| D3 | How much `isEds` predicate centralization in Slice 1? | **Minimal additive** — introduce the predicate helper, migrate only the content-flow entry sites (creation + dashboard render), leave the other ~18 `isEds` sites. | Guardrails ("extend additively", "neutral but thin", YAGNI). Avoids mixing a 20-site refactor with new behavior and locking the predicate shape before Slice 2 informs it. |

---

## Test Strategy

- **Framework:** Jest + ts-jest (Node), @testing-library/react (UI).
- **Coverage Goal:** 85% overall; 100% on the flow predicates and step-filtering
  logic.
- **Distribution:** Unit (75%), Integration (20%), E2E/manual (5%).

**Test categories:**
1. **Flow predicates** (unit) — `getProjectFlow`, `isContentFlow`,
   `isCommerceFlow` over commerce/content/legacy projects.
2. **Step filtering** (unit) — content flow hides prerequisites + mesh; commerce
   flow unchanged (regression).
3. **Executor branch** (integration) — content flow uses upstream as the frontend
   source, skips Phase 3 (mesh), skips backend deploy, still runs Phase 5/5b.
4. **Backend coords** (unit/integration) — seed from upstream `config.json`;
   discovery/override path; PaaS vs ACCS gating.
5. **Sync wiring** (unit) — content metadata sets `templateOwner/Repo` = upstream;
   default strategy = `reset`.
6. **Dashboard predicate** (unit) — content-flow project routes through the new
   predicate; commerce/EDS projects unchanged.

**Regression guard:** the existing commerce/EDS creation path must be untouched —
every executor/filtering/predicate change is gated on `flow === 'content'` (or a
predicate) and defaults to today's behavior when `flow` is absent.

---

## Implementation Constraints

- **File size:** <500 lines/file; **complexity:** <50 lines/function.
- **Timeouts:** use `TIMEOUTS.*` from `@/core/utils/timeoutConfig` — no magic
  numbers (SOP `code-patterns.md`).
- **Imports:** path aliases across boundaries, relative within feature (SOP).
- **REUSE-FIRST (mandate):** Slice 1 is **integration of existing pieces**, not new
  primitives. Before writing any component/service/handler, consult the **Reuse-First
  Inventory** (below) and prefer the listed asset; introduce net-new only where the
  inventory marks it "net-new." Each step carries its own **Reuse map**.
- **Dependencies:** REUSE `TemplateSyncService`, `discoverStoreStructure`,
  `configGenerator`, `ensureEdsContent`, `WizardContainer`, `filterStepsForStack`,
  and the full Reuse-First Inventory below. **No new npm packages.**
- **Additive only:** absent `flow` ⇒ identical to today's commerce/EDS behavior.

---

## Risk Assessment

### Risk 1 — Regressing the commerce/EDS executor path
- **Likelihood:** Medium · **Impact:** High · **Priority:** Critical
- **Mitigation:** every content branch is gated; add a characterization test of
  the existing EDS path *before* branching (Step 4 RED); default-when-absent.
- **Contingency:** keep the content branch as an early `if (isContentFlow) {…
  return}` segment that never falls through to commerce logic.

### Risk 2 — `flow` vs stack-property step filtering
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** model flow as an additional `StepCondition` predicate composed
  with the existing stack checks, not a replacement; unit-test both flows.

### Risk 3 — Cross-account backend coordinates (PaaS vs ACCS)
- **Likelihood:** Medium · **Impact:** Medium · **Priority:** High
- **Mitigation:** Slice 1's content path is **inherit-from-upstream-`config.json`
  + manual override** — a plain file read of *public* config that works offline
  of the Commerce org, so it needs no admin creds (PaaS) and no IMS token +
  discovery service (ACCS). The authenticated `discoverStoreStructure` flow
  remains the Commerce SC's same-account tool only.
- **Deferred:** *live* cross-account read of the backend (enumerate store
  structure over the network from a different org) is "high confidence but
  unverified live" (Adobe docs block programmatic fetch). It is **deferred to
  the same verification track as the spike** and is **not** attempted in Slice 1.

### Risk 4 — Sync reliability with AI-customized forks
- **Likelihood:** High (long-term) · **Impact:** Medium · **Priority:** Medium
- **Mitigation:** default `reset-to-upstream` for content forks (safe — content
  is external); preserve `config.json`/`fstab.yaml` (already done); document
  "promote durable code changes to upstream" as the model, not per-fork merge.
- **Contingency:** `merge`-with-reset-fallback already exists for forks that must
  attempt to keep local code.

---

## File Reference Map

### Existing files (to modify)
- `src/types/base.ts` — add `flow`, `upstream` to `Project` (Step 1)
- `src/types/typeGuards.ts` — add flow predicates (Step 1, 7)
- `src/features/project-creation/handlers/executor.ts` — `ProjectCreationConfig` + content branch (Steps 1, 4, 5)
- `src/commands/commandManager.ts` + `src/commands/handlers/` — register content-SC entry (Step 2)
- `src/features/project-creation/ui/wizard/stepFiltering.ts` — flow-aware condition (Step 3)
- `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx` — content-flow seeding/override (Step 5)
- `src/features/eds/services/configGenerator.ts` — accept upstream-seeded coords (Step 5)
- `src/features/updates/services/templateSyncService.ts` — content default strategy (Step 6, additive)
- Dashboard content-flow entry sites only (Step 7) — TBD-confirmed in step

### New files (to create)
- `src/commands/handlers/createContentScProjectWebview.ts` (or equivalent handler) — Step 2
- Test files mirroring each (see step files)

### Net-new explicitly deferred (NOT this slice)
- AEM Sites content-source service/variant (Slice 2)
- Mirrored-package config, App Builder add-flow, two-way contribution (Slice 3+)

---

## Content-SC (Joiner) UX flow — a NEW flow, built from reused parts

**Reuse-first applies to the building blocks, not the journey.** The content SC gets a
**genuinely new end-to-end flow** — a new entry, two new screens, and a trimmed wizard
sequence that differs from the commerce flow. It must be **designed and tested as a flow**;
the Reuse-First Inventory below says *what it's built from*, not *that it's the same
experience*. Design rationale: [engagement-modes-and-ownership](../../backlog/commerce-connect-aem-sc/engagement-modes-and-ownership.md) → "Per-SC wizard flows."

Screen-by-screen (Slice 1 / DA.live), with the building step and key states:

1. **Home → "Join a shared storefront"** — *new entry; reuses the dashboard CTA cluster* — **Step 2**.
2. **Paste-link screen** — *new screen; reuses `FormField` (url) + `useCanProceed`* — states: empty / invalid / valid — **Step 2**.
3. **Resolve on Continue** — *Backend-Call-on-Continue; reuses `GitHubFileOperations`* — states: loading overlay / error + retry — **Step 2**.
4. **Confirmation preview** — *new screen; reuses `ReviewStep` LabelValue / `Modal`* — "Joining **CitiSignal** by `<owner>` → backend `<endpoint>`; you'll author in your **own** DA.live (AEM in Slice 2)" → confirm / back — **Step 2**.
5. **Trimmed wizard** — *reuses `WizardContainer` shell + seeded state; gallery suppressed; prerequisites/mesh/adobe skipped* — name fork → connect **own** DA.live → **inherited backend** (confirm, no discovery) → create — **Steps 3 (filtering), 5 (coords), 4 (executor)**.
6. **Creation / progress** — *reuses `ProjectCreationStep` + executor content branch* — **Step 4**.
7. **Done → dashboard** — *content-flow project rendered via the archetype predicate* — **Step 7**.

This is a **distinct user journey that did not exist before** — it just happens to be assembled almost entirely from existing components, services, and patterns. The flow's *novelty* lives in the **sequence + the two new screens (paste-link, preview) + the gallery suppression**; the *parts* are reused.

---

## Reuse-First Inventory (audited 2026-06-04)

A codebase reuse sweep confirmed Slice 1 is **primarily integration of existing pieces**. Prefer these; net-new only where flagged.

### UI components
- `CopyableText` (`src/core/ui/components/ui/CopyableText.tsx`) — clipboard write + ✓ feedback → the **Share** link (Step 2).
- `Modal` (`src/core/ui/components/ui/Modal.tsx`) — `{title, actionButtons, onClose}` → confirmation/preview dialog (Step 2).
- `FormField` (`src/core/ui/components/forms/FormField.tsx`) — `type:'url'`, error/showError → the **paste-link** field (Step 2).
- `ReviewStep` LabelValue / ConfigurationSummary (`src/features/project-creation/ui/steps/ReviewStep.tsx`) — the **preview** presentation (Step 2).
- `StatusDot` (`src/core/ui/components/ui/StatusDot.tsx`) — link-validity indicator (Step 2).
- `SingleColumnLayout` (`src/core/ui/components/layout/`), `useCanProceed` (`src/core/ui/hooks/useCanProceed.ts`), `useFocusTrap` — layout, Continue-gating, a11y (Step 2).
- projects-dashboard: `ProjectsDashboard` (Create/Import CTA cluster), `DashboardEmptyState`, `ProjectActionsMenu` (`ProjectActions` interface) — add **"Join"** + **"Share"** entries alongside (Steps 2, 7).

### Wizard shell + seeding
- `WizardContainer` (`.../ui/wizard/WizardContainer.tsx`) — already accepts `importedSettings`/`editProject` initial state; **reuse this prop-seeding path** to inject the resolved join state (Step 2).
- `useWizardState` — merges defaults with init props (Step 2).
- `settingsSerializer.extractSettingsFromProject` (`src/features/projects-dashboard/services/settingsSerializer.ts`) — the **pre-populate** pattern; adapt to map the master `config.json` → wizard state (Steps 2, 5).
- `stepFiltering.filterStepsForStack` + `StepCondition`/`FilterOptions` (`.../wizard/stepFiltering.ts`) — extend with the `flow` predicate (Step 3).

### Webview / command infrastructure
- `BaseWebviewCommand` (`src/core/base/baseWebviewCommand.ts`) — extend for the Join command (Step 2).
- `WebviewCommunicationManager` (`src/core/communication/webviewCommunicationManager.ts`) — handshake + request/response (Step 2).
- `dispatchHandler` + object-literal handler maps (`defineHandlers`/`getRegisteredTypes`, `src/core/handlers/`) — the join handlers (Step 2).
- `HandlerContext` (`src/types/handlers.ts`) + `createErrorResponse` (`src/core/handlers/errorHandling.ts`) — handler shape + errors (Step 2).

### GitHub + backend services (confirmed present)
- `GitHubFileOperations` read-file (`src/features/eds/services/githubFileOperations.ts`) — **public reads need no auth**; 404→null → read master `config.json` + marker (Steps 2, 5).
- `GitHubRepoOperations.createFromTemplate` (`src/features/eds/services/githubRepoOperations.ts`) — generate the joiner's repo **from the master** (`is_template`) (Steps 2, 4).
- `TemplateSyncService` (`src/features/updates/services/templateSyncService.ts`) — sync from the master; preserves `config.json`/`fstab.yaml`; reset/merge (Step 6).
- `configGenerator.generateConfigJson` (`src/features/eds/services/configGenerator.ts`) — config.json; falls back to direct backend URL with no mesh (Steps 4, 5).
- `ensureEdsContent` (`src/features/project-creation/services`) — DA.live content / Phase 5b (Step 4).
- `populateEdsMetadata` (`src/features/project-creation/handlers/executor.ts`) — EDS metadata write path; extend to also write the **self-describing marker** (Steps 2, 6).
- storefront-setup phase orchestration (`src/features/eds/handlers/storefrontSetupPhases.ts`) — reuse for the joiner (createFromTemplate-from-master → fstab → blocks → content → publish) (Step 4).

### Patterns (`docs/patterns/`)
- **Backend Call on Continue** (`selection-pattern.md`) — paste-link is UI-only; resolve/join on Continue with a loading overlay (Step 2).
- **Two-column layout**, **loading overlay**, **error-at-commitment-point**, **state-clearing** — preview/validation UX (Step 2).

### Cross-cutting utilities
- `TIMEOUTS` (`src/core/utils/timeoutConfig.ts`) + `FRONTEND_TIMEOUTS` (`src/core/ui/utils/frontendTimeouts.ts`) — no magic numbers (all steps).
- `StepLogger`/`getLogger` (`src/core/logging`) — step logging (all steps).
- `ServiceLocator` (`src/core/di`), `DisposableStore` (`src/core/utils/`) — DI + disposal (Step 2).
- `typeGuards` (`src/types/typeGuards.ts`) — flow + archetype predicates (Steps 1, 7).

### Net-new (kept deliberately minimal)
- `flow` discriminator + `upstream` + predicates (Step 1).
- `resolveJoinLink` (fetch master `config.json` + marker → `JoinDescriptor`) + the small **self-describing marker** schema (Step 2).
- **Token = the public master repo URL — NO link encoding, expiry, checksum, or versioning** (a plain public URL has nothing to expire; the audit's heavier link-payload suggestion is explicitly rejected).
- **No new EDS pipeline phase** — the joiner reuses the storefront-setup phases with the master as the template source.
- Flow-aware filter branch (Step 3); executor content branch — skip mesh, source from master (Step 4); content-coords seed (Step 5); content sync default (Step 6); `(product,ownership)` predicate + minimal migration (Step 7).

---

## Assumptions

- [ ] **A1:** `aem-boilerplate-xcom`-style upstream is reachable as a normal Git
  template/source (Slice 1 can use any DA.live-capable boilerplate to prove
  plumbing). *Impact if wrong:* fork-from-upstream source resolution changes.
- [ ] **A2:** The upstream repo's `config.json` carries usable backend
  coordinates to seed from. *Impact if wrong:* fall back to discovery/manual
  entry only (D1 still holds via the override path).
- [ ] **A3:** `TemplateSyncService` syncing from the upstream (vs the original
  template) needs only the `templateOwner/templateRepo` metadata to point at the
  upstream. *Impact if wrong:* add an explicit `upstreamRepo` metadata field.

- [ ] **A4 (upstream wiring — open product question, sits *above* D1):** the
  inherit/seed path (D1, Step 5) only yields real coordinates if the **upstream's
  `config.json` is actually wired** with the Commerce SC's backend — but a stock
  boilerplate ships placeholders. *How the upstream comes to hold real coords*
  (e.g. the Commerce SC's "maintain the upstream" step wires it; or a published
  coordinates handoff) is **unresolved** and tracked as an open question (see the
  open-questions walk). *Impact if wrong / unwired:* Slice 1 still works via the
  **manual override** path; only the zero-friction "confirm" experience depends
  on A4 being satisfied. Slice 1 is **not** blocked on it.

---

## Next Actions

**After plan approval:**
1. Step 1 — Project model: flow + upstream + predicates (`step-01.md`)
2. Step 2 — Content-SC wizard entry (`step-02.md`)
3. Step 3 — Flow-aware step filtering (`step-03.md`)
4. Step 4 — Executor content branch (`step-04.md`)
5. Step 5 — Content-fork backend coordinates (`step-05.md`)
6. Step 6 — Upstream sync wiring + reset default (`step-06.md`)
7. Step 7 — Dashboard predicate (minimal additive) (`step-07.md`)
8. Quality gates (Efficiency + Security)

**First step:** `/rptc:tdd "@commerce-connect-slice1-two-fork-plumbing/"`

---

## Plan Maintenance

Living document. Small adjustments inline + note in a "Deviations" section;
major changes via `/rptc:helper-update-plan`. Request a replan if the `flow`
discriminator proves insufficient (e.g., the executor needs a true strategy
split) or if Slice 2's content-source shape forces the predicate to change.
