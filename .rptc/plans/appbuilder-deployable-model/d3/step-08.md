# Step 08 — Unify mesh in the dashboard UI (wire the dormant list)

**Purpose:** The dashboard integration UI is built but **not wired** — `AppBuilderComponentsList` /
`AppBuilderComponentRow` exist and `showDashboard` computes + passes the data, but
`ProjectDashboardScreen` drops it and renders only a read-only mesh badge + a Deploy Mesh tile. Wire the
list and fold mesh into it (retire the special-case badge) — the mesh-UI unification D3 owns, and the
groundwork for the eventual dashboard grid.

**Prerequisites:** Steps 01–06 (durable keyed state + mesh on the unified model). UI-only; no state change.

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx:14` (imports only the `AppCardState` TYPE),
  `:74-85` (does NOT destructure `initialApp`/`appBuilderComponents`/`appBuilderComponentCatalog`),
  `:260-368` (render tree — no integration components).
- `src/features/dashboard/commands/showDashboard.ts:187-204` — already computes + passes
  `appBuilderComponents` + catalog (dropped by the screen today).
- `src/features/dashboard/ui/components/AppBuilderComponentsList.tsx` / `AppBuilderComponentRow.tsx` —
  the dormant list/row (per-id deploy/redeploy/remove/manage-APIs, 4-state machine).
- `src/features/dashboard/ui/components/DashboardStatusHeader.tsx:94-105` — the mesh badge to retire/fold.

## Tests to write FIRST (RED)

- [ ] `ProjectDashboardScreen` renders `AppBuilderComponentsList` when `appBuilderComponents` is present.
- [ ] The mesh appears as an entry in the list (not only as the header badge).
- [ ] Per-integration actions dispatch id-scoped messages (deploy/redeploy/remove) — the list already
      does this; assert it renders for N.
- [ ] Empty state when no integrations.

## Files to create / modify

- MODIFY `ProjectDashboardScreen.tsx` — destructure + render the integrations list (and its props from
  `showDashboard`), fold the mesh into the list (remove/repoint the standalone badge).
- Tests: dashboard-screen rendering.

## Acceptance criteria

- The dashboard shows N integrations (incl. mesh) as a wired list; per-id actions work.
- No orphaned mesh-badge special case.

## Notes

- This is the wiring + mesh-unification only. The **calm grid presentation** (card shell + `.projects-grid`)
  and the **wizard calm list** are the separate, prototyped UX build
  (`.rptc/research/app-builder-integration-model/prototype-integrations-*.html`) that layers on top.
