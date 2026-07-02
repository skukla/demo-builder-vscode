# Nested Builder — build plan of record (LOCKED design v3)

**Design:** `.rptc/research/project-builder-ux/research.md` → "LOCKED design v3 — nested timeline".
**Visual spec:** `.rptc/research/project-builder-ux/prototype-v2-nested.html` (clickable).
**Reuse guide:** `.rptc/research/project-builder-ux/component-reuse-guide.md` (aesthetic rules + component
reuse map + the only net-new primitives) — consult per slice to stay on the existing design system.
**Supersedes:** R1 (group-paced steps) + R1b (tiles+modals) — both shipped to this worktree, uncommitted.
**Worktree:** `feature/project-builder-ux`. No commit without approval; no AI-attribution.

## What changes vs. the current worktree (R1b) state
The wizard currently has three separate group steps (`commerce`, `integrations`, `storefront`) rendered as
tiles+modals. The locked model collapses them into **one** `build-your-project` wizard step whose areas are
**sub-steps nested in the same SETUP PROGRESS rail**, with **sequenced tabs** inside the deep areas, an
**Architecture header summary**, **contextual Adobe sign-in**, and **Prerequisites folded into Create**.

## Reuse vs. replace (from R1/R1b, uncommitted)
**Reuse as-is / lightly adapt:**
- Content components: `ArchitectureStepContent`, `ConnectStoreStepContent`, `BlockLibrariesStepContent`,
  `AppBuilderComponentsStepContent`, `RepoSelectionInline` (+ helpers), GitHub/DA.live cards.
- `useProjectBuilder` hub (mesh dual-flow mirror-write) — already moved to `ui/steps/`.
- `useWizardState` App-Builder gating generalization (`hasAppBuilderComponent`) — keep.
- `ConfigTile` + `tileStatus` predicates — reused by the **Integrations** tile collection (and adapt
  `tileStatus` into per-sub-step / per-tab status).
- `useCanProceedAll`, `useArrowKeyNavigation`, `useSelectionStep`.
- `StorefrontSetupStep` (publish/execution) — becomes a phase of Create.
**Replace / retire:**
- `CommerceStep` / `StorefrontStep` tile+modal bodies → area panes with sequenced tabs.
- `IntegrationsStep` placeholder → real tiles + typed Add.
- The three standalone wizard-step registrations (`commerce`/`integrations`/`storefront`) → one
  `build-your-project` step; `prerequisites` standalone registration → folded into `create-project`.

## New shared pieces to build
- **Nested timeline** — extend `TimelineNav` to render the active step's sub-steps indented under it (2-level,
  one rail). Sub-step list + status driven from a `buildYourProjectAreas` model (EDS-only Storefront;
  Integrations always; status per area).
- **Sequenced-tab strip** — numbered tabs with done(✓)/current/upcoming states + auto-advance (per the
  prototype). Used by Commerce + Storefront.
- **Architecture header summary** — collapsed stack choice with [Change], above Commerce's tabs.
- **`BuildYourProjectStep`** — hosts sub-step nav (via the nested timeline) + renders the active area pane;
  owns sub-step gating + the Continue gate (required areas ✓).

## Build slices (each its own `/rptc:feat`, TDD, suite green per slice)
1. **Top-level restructure + nested-timeline shell.** Collapse the 3 group steps → `build-your-project`;
   fold `prerequisites` into `create-project`; extend `TimelineNav` for nested sub-steps; `BuildYourProjectStep`
   shell renders sub-step nav + an empty area pane; sub-step gating (Storefront EDS-only, Integrations always);
   Continue gates on required areas. (Areas render placeholders; filled in 2-4.)
2. **Commerce area.** Architecture header summary + sequenced tabs (Connection · Business Structure · Catalog)
   + **contextual sign-in first tab for ACCS** (Connection upcoming until signed in). Catalog = Catalog Service
   + Commerce Optimizer + Assets, gated on Store View. Reuse `ArchitectureStepContent` + `ConnectStoreStepContent`.
3. **Storefront area** [EDS]. Sequenced tabs Services · Repository · Block Libraries. Reuse the GitHub/DA.live
   cards + `RepoSelectionInline` + `BlockLibrariesStepContent`. Keep the GitHub-App install gate.
4. **Integrations area.** Tiles + **typed Add** (Mesh / App Builder App / Custom URL) via
   `AppBuilderComponentsStepContent` + the catalog loader; **inline Adobe sign-in**; a mesh integration carries
   project + workspace (reuse `AdobeProjectStep`/`AdobeWorkspaceStep` UI in its config). Template-required mesh
   pre-added. Reuse `ConfigTile`.
5. **Create Project phases.** Fold Prerequisites in as phase ①; ② Publish Storefront [EDS] (`StorefrontSetupStep`);
   ③ Deploy. Internal phase progress; retire the standalone `prerequisites` registration.
6. **Dashboard → runtime-only** (was R3). Remove post-creation composition; dashboard = start/stop · logs ·
   status · configure-existing.

## Invariants (must hold every slice)
- Mesh dual-flow (`selectedOptionalDependencies` / `hasMeshInDependencies`) + the mesh→storefront
  `MESH_ENDPOINT`→config.json edge — untouched (D3 still owns dual-flow removal).
- All field/option sets stay config-driven — render generically from the JSON configs.
- One shared Adobe session; sign-in never a rail item or floating bar.
- Real Spectrum tokens; no soft deprecation (delete retired registrations/bodies outright).

## Verification (per slice + final)
`tsc --noEmit` 0 · `npm run lint` (whole repo) 0 errors · `npx jest --no-coverage` green (never pipe through
`tail`). Dual-flow + gating regression tests stay green. F5 smoke against `prototype-v2-nested.html` as the
reference: nested rail; Commerce sequenced tabs + architecture header + ACCS sign-in tab; Storefront tabs;
Integrations tiles + typed Add; Create runs prereqs→publish→deploy.

## Process
Each slice is a `/rptc:feat` on this worktree, TDD, full green, PR. The current uncommitted R1/R1b changes
either land first (as the reusable substrate) or are folded into slice 1 — decide at slice-1 planning.
