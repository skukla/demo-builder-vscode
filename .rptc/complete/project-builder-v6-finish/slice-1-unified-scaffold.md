# Slice 1 — Unified Build-step scaffold

**Goal:** make the "Build Your Project" step read as v6 — `[ area timeline (rail) | active area view | one persistent "Your project" summary ]` — by lifting the summary out of Commerce and up to the Build step, fed by per-area providers, and showing the areas in the rail.

**Branch/worktree:** `feature/project-builder-ux` (this worktree). Each part green; TDD.

## Why
Today only Commerce has a summary (owned internally inside `CommerceStep`'s `TwoColumnLayout` + `CommerceSummary`). Storefront/Integrations are single-column with no summary, and the rail shows "Build Your Project" as one bullet (areas reachable only via footer Continue/Back). v6 has ONE cross-area summary and shows areas in the rail.

## Part A — Unified summary (lift + generalize)

- **Generalize `CommerceSummary` → `BuildYourProjectSummary.tsx`** (`ui/components`). Props: `{ architectureLabel: string | null; groups: SummaryGroup[] }` where `SummaryGroup = { heading: string; rows: SummaryRow[] }`. Renders "Your project" + the architecture line + each group's `sum-group-h` heading and its rows. Keep the existing `SummaryRow` contract + the `.sum-*` CSS. (CommerceSummary already documents that groups can be appended — this is that.)
- **Per-area summary providers** — pure `(state) => SummaryGroup` (and a shared `architectureLabel(state)`), colocated with each area:
  - `commerceSummaryGroup(state)` — move `buildSummaryRows` + the `commerceSectionStates` derivation + the `architectureLabel` out of `CommerceStep` into `commerceSections.ts` (or a `commerceSummary.ts`). Returns `{ heading: 'Commerce', rows }`.
  - `storefrontSummaryGroup(state)` — `{ heading: 'Storefront', rows: [Frontend, Repo?] }` from `edsConfig`/`selectedStack` (Frontend label; repo when `storefrontRepoValid`).
  - `integrationsSummaryGroup(state)` — minimal for now: `{ heading: 'Integrations', rows: [] }` or a single "Mesh" row when template-required. (Full rows land with the Integrations slice.)
- **Aggregate only VISIBLE areas** — reuse `buildYourProjectAreas(state, stacks)` visibility so a non-EDS project doesn't show a Storefront group.

## Part B — Lift the layout to `BuildYourProjectStep`

- `BuildYourProjectStep` owns the two-column: `TwoColumnLayout` (the generalized `commerce-two-col` styling → rename class `build-two-col`; keep the left-zone cap + edge summary + ≤1180 responsive stack) with **left = active area body**, **right = `<BuildYourProjectSummary>`**.
- **`CommerceStep` stops owning the summary/`TwoColumnLayout`** — it returns just its `.commerce-body` (`[step-nav | step-view]`). Its summary/arch memos move to the provider.
- **Storefront/Integrations bodies** become the left content directly (drop their own outer `SingleColumnLayout`/`ContentColumn` so the Build two-column owns width; their inner content stays).

## Part C — Areas in the rail (nested timeline)

- In `WizardContainer`, when the active wizard step is Build-Your-Project, pass the **visible areas** (`{id, title, status}`) as `childSteps` + the active area as `activeChildId` to `TimelineNav` (the API already exists; it's just not wired). Clicking an area → `updateState({ activeBuildArea: id })` (only for reached/unlocked areas). Keep footer Continue/Back as the primary driver.

## Tests (TDD — RED first)
- `BuildYourProjectSummary.test.tsx` — renders arch line (label / "Frontend pending" / pending placeholder); each group heading + rows; ✓ only when row done+value.
- summary-provider tests — `commerceSummaryGroup` / `storefrontSummaryGroup` / `integrationsSummaryGroup` rows from representative state; aggregation skips hidden areas.
- `BuildYourProjectStep.test.tsx` — renders the active area body in the left + the unified summary in the right; summary shows all visible groups; arch line present.
- `CommerceStep.test.tsx` — UPDATE: no longer renders its own summary/TwoColumnLayout; renders `.commerce-body` only; existing sub-step/gate/bridge tests carry over.
- `WizardContainer`/`TimelineNav` — areas render as children on the Build step; clicking a reached area sets `activeBuildArea`; locked areas don't.

## Verification
- `/gate` per part (scoped jest → file, never piped to tail; `tsc --noEmit`; eslint changed files).
- Pre-commit: full `npm run lint` + `tsc --noEmit` + `npx jest --no-coverage` (CI lints whole repo).
- **F5:** the Build step shows the rail areas, the active area view, and one "Your project" summary that updates as you move Commerce → Storefront → Integrations; the summary's gray panel reaches the edge; ≤1180 stacks.

## Risks
- CommerceStep is tightly coupled to owning `commerce-two-col` + the responsive CSS + its tests — the lift is the riskiest part; do it first and keep Commerce visually identical.
- Storefront's modal-based body inside the new left column — verify width/modals still work.
- Don't regress the commit-gated ✓ behavior (committedCommerceSteps) or the footer-driven sub-step walk.

## Out of scope (later slices)
- Integrations tile surface (R2). Storefront → nav+view alignment. PrerequisitesStep layout primitive.
