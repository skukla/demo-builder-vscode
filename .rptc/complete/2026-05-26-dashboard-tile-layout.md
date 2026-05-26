# Project Dashboard — Tile Layout Redesign (smaller, grouped, prioritized)

## Provenance

Scoped during a `/rptc:research` session on 2026-05-26, prompted by end-user feedback that the Project Dashboard tiles are too large and the flat grid is hard to scan. Research covered both the current implementation (codebase map) and action-dashboard UX norms (Spectrum, Material 3, Fluent 2, Carbon, GitHub Primer, NN/g, WCAG).

The dashboard is the `demoBuilder.projectDashboard` webview. Today it renders a flat 4-column grid of **160×160px square tiles** — roughly 3× larger than any mainstream design system recommends for an icon+label launcher — with 9–12 tiles depending on project type, no grouping, no visual hierarchy, and the destructive **Delete** sitting inline beside benign actions.

## Goal / Scope

Redesign the dashboard action grid into smaller, grouped, prioritized tiles that scan quickly and isolate destructive actions. The user chose the **"grouped small tiles (~96px)"** form (an evolution of today's look) over a full switch to compact toolbar rows.

### Target layout (decided)

```
citisignal-b2b
Frontend ✓   API Mesh ✓   AI ✓

PRIMARY       ▶ Start/Stop   🌐 Open in Browser   ✨ AI
STOREFRONT    ✏ Author DA.live   📤 Sync Storefront
BUILD         🔄 Deploy Mesh   ⚙ Configure   📋 Logs
                ⋯ More └▸ Components · Dev Console
─────────────────────────────────────────
🗑 Delete project   (isolated footer, confirm before destroy)
```

Zone headers shown are the literal labels. Gating is behavioral, not displayed: the **Storefront** zone renders only for EDS projects (both tiles are `isEds`-gated); Start/Stop only for non-EDS; Deploy Mesh only when `hasMesh`. Primary tiles get accent emphasis.

### Decisions locked during research

- **Form**: grouped small tiles, ~96px square (down from 160px), icon-over-label, organized into labeled zones. NOT a switch to compact `ActionGroup` rows (that was the runner-up).
- **Heroes (accent emphasis)**: Start/Stop (contextual, non-EDS), Open in Browser, and AI. The user confirmed both the lifecycle/outcome actions AND AI are top-tier; AI is a major item. **Open in Browser stays a hero** (most-frequent "see my demo" action) rather than folding into the Storefront zone.
- **Ordering / zones by expected usage**: Primary → Storefront → Build → overflow → Delete (as above).
- **Storefront zone** (renders for EDS projects only): Author in DA.live + Sync Storefront. These are the two "push your work to the EDS storefront" actions — content via DA.live, code via Sync — so they cluster naturally and both are `isEds`-gated (the whole zone disappears for non-EDS projects, so no "EDS-only" annotation is needed in the label). Label it **"Storefront"** (or "Content & Code"), NOT "Author" — Sync pushes code, not content, so an "Author" label would mislead.
  - This supersedes the earlier draft that put Sync Storefront in overflow. Decided 2026-05-26: grouping it with DA.live is more coherent than hiding it, and removes the friction of burying a core EDS publish action.
- **Build zone**: Deploy Mesh (hasMesh-gated), Configure, Logs.
- **Overflow ("More" menu)**: Components, Dev Console. (Sync Storefront moved to the Storefront zone.)
- **Remove "Open in Claude Code" tile entirely.** It is redundant with the **AI** tile, which opens the AI surface that already launches Claude (prompt clicks + the open-in-Claude flow shipped on `feature/ai-claude-ux-polish`). A dashboard tile that launches bare Claude with no prompt is a second door to the same place. Folding it away makes **AI** the single AI entry point. The only lost affordance is a one-click bare-Claude launch, which the AI surface can still offer internally if wanted.
- **Delete**: isolated in a separate destructive footer (not in any zone), visually differentiated (negative variant), gated behind confirmation. Consider a type-the-project-name confirm for a high-stakes delete (NN/g guidance).

### In scope

- `src/features/dashboard/ui/components/ActionGrid.tsx` — restructure the inline tile list into labeled zones with accent heroes, an overflow menu, and a separated Delete footer.
- `src/core/ui/styles/custom-spectrum.css` (lines ~1620–1751) — shrink `.dashboard-action-button` from 160px → ~96px; restructure `.dashboard-grid`; **fix the hard-coded `.dashboard-status-content { width: 712px }` coupling** (derive from the grid or use a container query / `fit-content` instead of the "4 × 160 + 3 × 24" magic number).
- Overflow menu via Spectrum `ActionMenu` (or `MenuTrigger` + `Menu`) for Components / Dev Console.
- Remove the Open-in-Claude tile + its `handleOpenInClaude` wiring from `useDashboardActions.ts` (the `demoBuilder.openInClaude` command and `aiHandlers` path stay — only the dashboard tile goes).
- Preserve all existing conditional gating (see below) within the new zones; handle zones that collapse to empty for a given project type.
- Update the stale `ActionGrid.tsx:4-9` header doc comment ("8 buttons").
- Tests: `ActionGrid` render tests for each project type (EDS vs non-EDS, hasMesh vs not), hero/zone placement, overflow menu contents, Delete isolation.

### Out of scope

- The left-sidebar **Tools / Help / Settings** row — that's a separate feature (`src/features/sidebar/ui/views/UtilityBar.tsx`, a `WebviewViewProvider`), not this webview. Don't touch it.
- The status header badges' *logic* (`useDashboardStatus.ts`) — only their width coupling to the grid changes.
- Backend handlers and message protocol — tile→message wiring is unchanged except for removing the Open-in-Claude tile.
- Registering dashboard actions as VS Code commands for the Command Palette (a worthwhile follow-up for overflow discoverability, but a separate task — these actions are currently webview messages, not palette commands).

## Current implementation map (research findings)

- **Tiles**: inline `<ActionButton isQuiet UNSAFE_className="dashboard-action-button">` JSX in `ActionGrid.tsx:94-284`. No per-tile component, no config array. The component takes 17 handler props + 8 state/flag props and is purely presentational.
- **Conditional gating to preserve** (visibility, evaluated against `isEds` / `hasMesh` / `isRunning`):
  - Start ↔ Stop — non-EDS only, mutually exclusive on `isRunning`. EDS shows neither.
  - Open in Browser — EDS variant (`openLiveSite`) vs non-EDS variant (`openBrowser`, disabled unless running).
  - Author in DA.live — EDS only.
  - Deploy Mesh — `hasMesh` only.
  - Sync Storefront — EDS only.
  - Always shown: Logs, AI, Configure, Components, Dev Console, Delete (and Open in Claude Code, which this task removes).
- **Sizing**: `.dashboard-action-button` is `width: 160px !important; aspect-ratio: 1/1` (`custom-spectrum.css:1686-1708`); icons forced to 28×28px. Grid is `repeat(4, auto)` with 24px gap (`custom-spectrum.css:1676-1680`) — the `GridLayout columns={4}` / `gap="size-400"` props are overridden by this CSS and effectively dead.
- **Brittle coupling**: `.dashboard-status-content { width: 712px }` (`custom-spectrum.css:1633-1637`) is hand-derived as "4 × 160 + 3 × 24". Any change to tile size, column count, or gap breaks header alignment unless this is fixed. This is the main refactor hazard.
- **Container**: `ProjectDashboardScreen.tsx:62-258` (title, badges, "All Projects" back button) hosts `ActionGrid`. Host command `showDashboard.ts` computes `hasMesh` / `isEds` at init.
- **Wiring**: `useDashboardActions.ts:80-190` maps each tile to a `webviewClient.postMessage(<id>)`.

## UX guidance (research findings, with confidence)

- **160px is unjustified** (high): launcher tiles in mature tools run ~80–120px; WCAG floor is 24px, comfortable 44–48px. A square holding one icon + one word doesn't earn 160px.
- **Group 10+ actions into semantic zones** (high): Fluent 2 / NN/g chunking; "group destructive actions away from other options."
- **One-to-two primary actions per view** (high): promote heroes (accent), demote utilities (quiet).
- **Destructive proximity is a top NN/g mistake** (high): separate Delete spatially, color it, confirm it.
- **Progressive disclosure ≤2 levels; keep frequent actions visible** (high): overflow menu is fine for rare actions; don't bury Open/Start.
- **Spectrum has the primitives** (high): `ActionGroup` (`density="compact"`, `overflowMode="collapse"`, `buttonLabelBehavior`), `ActionMenu` (+ `Section`), `MenuTrigger`. Use `ActionMenu` for the overflow; `ActionButton` accent/negative variants for heroes/Delete. No custom tile component needed for the overflow path.

## Execution plan

Single feature, ~2–3 batches. TDD throughout (`ActionGrid` is presentational and well-suited to render tests).

### Batch 1 — Tile sizing + grid restructure (visual foundation)
- Shrink `.dashboard-action-button` to ~96px square; scale icon/label/padding proportionally.
- Replace the flat single `GridLayout` with labeled zone sections (Primary / Storefront / Build). Each zone is its own small grid; zones stack vertically with dividers/whitespace.
- **Fix the 712px header coupling** — derive the header width from the content (e.g., `fit-content`/container alignment) so it no longer assumes 4×160px.
- Apply accent emphasis to the three heroes (Start/Stop, Open in Browser, AI).
- Tests: render snapshots/queries for tile size class, zone grouping, hero variant.

### Batch 2 — Overflow menu + remove Open-in-Claude
- Add a "More" `ActionMenu` (or `MenuTrigger`) holding Components + Dev Console. Each item dispatches its existing message.
- Remove the Open-in-Claude tile and its `useDashboardActions` handler entry (leave the command + aiHandlers path intact).
- Preserve conditional gating: the Storefront zone (Author in DA.live + Sync Storefront) is EDS-only; Deploy Mesh is hasMesh-only. Hidden tiles stay hidden.
- Tests: zone contents per project type; Open-in-Claude tile absent; gating preserved.

### Batch 3 — Delete isolation + confirmation
- Move Delete out of the grid into a separated destructive footer; negative variant.
- Confirm before destroy (reuse the existing delete-confirmation flow if one exists; otherwise add a typed-name confirm).
- Tests: Delete rendered outside the zones; confirmation required.

### Empty-zone handling
- A non-EDS project has NO Storefront zone (Author + Sync are both `isEds`-gated) and may have no Deploy Mesh (hasMesh-gated). Ensure zones with zero visible tiles collapse cleanly — no empty labeled box. The Build zone for a non-EDS project without mesh holds only Configure + Logs.

## Constraints

- **Reuse Spectrum primitives** — `ActionMenu`/`MenuTrigger` for overflow, `ActionButton` accent/negative for heroes/Delete. No new custom tile component unless a tile becomes genuinely content-rich (status/thumbnail), which it isn't here.
- **Preserve every conditional gate** — the redesign is layout-only; do not change which tiles appear for which project type (except removing Open-in-Claude entirely).
- **Kill the 712px magic-width coupling** — don't reintroduce a hard-coded width derived from tile geometry. This is a known trap (`custom-spectrum.css:1633-1637`).
- **No backend/protocol changes** beyond dropping the Open-in-Claude tile's message wiring.
- **Don't touch the sidebar UtilityBar** (separate feature).
- **Accessibility**: overflow/kebab items need labels or `buttonLabelBehavior` tooltips; icon-only buttons need `aria-label` (Spectrum requirement).
- **Frontend SOP applies** — accessibility (WCAG 2.1 AA), the project's established Spectrum aesthetic, and `~/.claude/global/frontend-guidelines.md`.

## Risk

Medium. Mostly CSS + JSX restructure of a presentational component, but the 712px header coupling and the per-project-type conditional gating create edge cases (ragged/empty zones). Render tests across EDS/non-EDS/hasMesh permutations de-risk it. Removing the Open-in-Claude tile is low-risk (the command and AI-surface path remain).

## Kickoff prompt

```
/rptc:feat "Redesign the Project Dashboard action grid per the plan at
.rptc/backlog/2026-05-26-dashboard-tile-layout.md. Grouped small tiles (~96px,
down from 160px) in labeled zones: PRIMARY (Start/Stop, Open in Browser, AI as
accent heroes), STOREFRONT (Author DA.live, Sync Storefront — zone renders for
EDS projects only), BUILD (Deploy Mesh, Configure, Logs) + a More overflow menu
holding Components and Dev Console. Remove the Open-in-Claude tile (redundant
with AI). Isolate Delete
in a destructive footer with confirmation. Fix the hard-coded 712px status-header
width coupling in custom-spectrum.css. Preserve all existing isEds/hasMesh/
isRunning conditional gating (the whole Storefront zone is EDS-only). Use Spectrum
ActionMenu for overflow and ActionButton accent/negative variants. Files:
ActionGrid.tsx, custom-spectrum.css (~1620-1751), useDashboardActions.ts.
Render tests across EDS/non-EDS/hasMesh."
```

## When to pick this up

Any time. Self-contained, no dependency on the structural baseline or other backlog items. Touches one presentational component + its CSS; the AI-surface work it builds on is already merged to `develop`.
```
