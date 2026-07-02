# Research: Webview Layout Architecture — Dedicated Layouts Across All Webviews

**Status:** Research / design — not yet planned or implemented.
**Scope:** ALL React webviews in the extension (not just the wizard). Supersedes the
narrower `.rptc/research/wizard-layout-unification/` for the app-wide picture.
**Date:** 2026-06-25. **Branch:** `feature/project-builder-ux`.

## 1. Goal

Decide whether to introduce a small set of **dedicated, purpose-named layout
components** used across every webview — so screens *choose* a layout instead of
*configuring* generic primitives with magic props. Motivation: the recurring smell
where steps/screens hand-assemble `SingleColumnLayout`/`TwoColumnLayout`/`PageLayout`
with varying widths, alignment, and classnames (the same coupling that caused the
footer `hasNav` bug).

## 2. The webviews (esbuild entry points)

`wizard` (project-creation), `dashboard`, `configure` (dashboard/configure),
`sidebar`, `projectsList` (projects-dashboard), `aiOverview` (dashboard/aiSurface).

## 3. The existing toolkit (`src/core/ui/components/layout/`)

The primitives ALREADY exist and are well-factored — this is a key finding (don't
proliferate).

| Component | Purpose | Key structural props (defaults) |
|---|---|---|
| `PageLayout` | Full-viewport frame: fixed header + scroll content + fixed footer (slots) | `header`, `footer`, `children` |
| `PageHeader` | Fixed top: title/subtitle/description/action/back | `constrainWidth` (**false**) → `.page-container` (800px, **centered**) |
| `PageFooter` | Fixed bottom: 3-cell grid (start/center/end) | `constrainWidth` (**true**) → `.footer-content-container` (800px, left) |
| `SingleColumnLayout` | One readable column | `maxWidth` (**800px**), `padding` (24px), `margin` (**0 = left-aligned**) |
| `TwoColumnLayout` | Left content + right sidebar (stacks ≤1180) | `leftMaxWidth` (800), `rightMinWidth` (300), `maxWidth` (1200, **centered**), `rightWidth` |
| `GridLayout` | Responsive card/tile grid | `columns` (2), `gap` |
| `CenteredFeedbackContainer` | Vertically+horizontally centered status/loading | `height` (350px), `maxWidth` |

Layout-governing (not pure layout, but shape structure): `SelectionStepContent`
(search-list scaffold), `ConfigSection` (form section), `StatusSection`,
`SearchHeader`. Shared CSS: `.page-container` (800 centered), `.footer-content-container`
(800), `.wizard-main-content`, `.two-column-layout*` (responsive stack), the
`--wizard-content-*` / `--commerce-nav-width` vars (Commerce band), and the
`--dashboard-*` derived-width vars.

## 4. Recurring layout ARCHETYPES across all webviews

Synthesized from the four surveys — these are the real categories:

| # | Archetype | Where it appears | Today built with |
|---|---|---|---|
| A | **App screen frame** (header + scroll + optional footer) | dashboard, configure, projects, aiOverview; wizard has its own (timeline rail + main) | `PageLayout` (+ `WizardContainer` for the wizard) |
| B | **Single-column content** (readable column) | most wizard steps, configure left form, projects/AI content | `SingleColumnLayout` / `.page-container-padded` |
| C | **Content + sidebar** (two-column) | configure (form + nav), wizard selection steps (Adobe Project/Workspace/Repo) | `TwoColumnLayout` |
| D | **Card / tile grid** | projects grid, AI prompt grid, Review summary, Welcome brand gallery, Connect Services, Component Selection | `GridLayout` + ad-hoc `repeat(auto-fill,minmax(...))` |
| E | **Centered status / progress feedback** | Adobe Auth, GitHub/DA.live setup, Storefront setup, Project Creation | `CenteredFeedbackContainer` + `StatusDisplay`/`LoadingDisplay` |
| F | **Selection (search list + summary)** | Adobe Project/Workspace, GitHub Repo | `TwoColumnLayout` + `SelectionStepContent` + a summary |
| G | **Dashboard action-tile grid** (derived width) | dashboard only | bespoke CSS (`--dashboard-content-width`) |
| H | **Sidebar** (narrow centered stack) | sidebar only | bespoke `Flex` |

Archetypes A–E recur across MULTIPLE webviews; F is wizard-only (3 steps) but
strongly patterned; G and H are genuinely bespoke (one consumer each).

## 5. The real problems (it's consistency, not missing primitives)

1. **Width fragmentation.** 800 (most), 960 (Commerce band), ~400 (dashboard derived),
   1200 (TwoColumnLayout default centered). No single "content width" concept.
2. **Centered vs left mismatch.** `PageHeader`'s `.page-container` is **centered**
   (margin auto); `SingleColumnLayout` is **left** (margin 0); `TwoColumnLayout`
   default is **centered**; Commerce is **left full-width**. The header and content
   literally don't share an alignment.
3. **Ad-hoc assembly.** Many steps/screens compose primitives + custom divs/CSS
   inline (Welcome gallery, Review grid, Component Selection, dashboard zones), each
   re-deriving width/alignment. This is the "configure not choose" smell.
4. **Magic-prop combos.** Commerce two-col = `maxWidth="none"` + `leftMaxWidth=var` +
   `className="commerce-two-col"` + summary cap — knowledge that should be one named
   layout, not four props at the call site.

## 6. Proposal — a thin layer of DEDICATED layouts (choose, don't configure)

Keep the primitives as the low level. Add a SMALL set of dedicated, purpose-named
layouts (built ON the primitives) that bake in the canonical width + alignment, so
every webview is consistent by construction. Candidates, ranked by payoff:

- **`AppScreen`** (wraps `PageLayout`) — the standard full-viewport frame at the
  canonical content width, header + scroll + optional footer. Used by dashboard,
  configure, projects, aiOverview. (Wizard keeps its timeline-rail variant.)
- **`ContentColumn`** (archetype B) — single readable column at the canonical width,
  **left-aligned**, standard padding. Replaces scattered `SingleColumnLayout`
  configs + `.page-container-padded`.
- **`ContentWithSidebar`** (archetype C/F) — content column + a sidebar that grows to
  the edge (content held tight). Bakes in the Commerce/Configure two-col treatment
  (no more `maxWidth="none"` + classname combos). Selection steps (F) layer
  `SelectionStepContent` inside it.
- **`StatusScreen`** (archetype E) — centered status/progress (wraps
  `CenteredFeedbackContainer` + the StatusDisplay/LoadingDisplay convention).
- **`CardGrid`** (archetype D) — standardized grid (columns/min-tile/gap) replacing the
  ad-hoc `repeat(auto-fill,minmax(...))` copies.

Leave **bespoke**: dashboard action-tile grid (G) and sidebar (H) — single consumers,
not worth a shared abstraction (Rule of Three).

### Counterpoint (from the primitives survey — take seriously)
The existing primitives are clean and "sufficient." The risk is **over-abstraction**:
adding layouts that are thin wrappers nobody needs. Mitigation: only build a dedicated
layout where the SAME composition recurs ≥3× (A, B, C, D, E all qualify; F borderline;
G/H do not). Each dedicated layout must remove real call-site config, not just rename.

## 7. Cross-cutting decisions to settle first

1. **Canonical content width.** One value (or a small scale) for archetype B/C across
   the app. Today: 800 dominant; Commerce 960; dashboard derived. Pick the rule
   (e.g. 800 readable default; Commerce band a deliberate exception, or unify).
2. **Alignment: left vs centered.** Resolve the header(centered)/content(left) split —
   the app should pick ONE (the wizard work chose **left**).
3. **Footer.** Already settled (plain consistent `PageFooter`, no content-hug). The
   dedicated layouts do NOT own the footer — it stays shared chrome.
4. **Header alignment** to the content width/edge.

## 8. Migration approach (low-risk, incremental)

Because the footer is now plain/consistent, converting screens one at a time **no
longer causes footer jumps** — so this can roll out incrementally with an F5 per
screen, not a big-bang.

- **Phase 0** — build `ContentColumn` + `ContentWithSidebar` (the two highest-value),
  on top of the existing primitives + the shared width var. Pick the canonical width.
- **Phase 1** — convert one consumer of each (a wizard single-col step; a two-col
  step) and F5.
- **Phase 2** — roll across wizard steps; then `AppScreen`/`CardGrid`/`StatusScreen`
  across the standalone webviews (dashboard/configure/projects/aiOverview).
- **Phase 3** — resolve header alignment + retire the dead width/centering configs.

## 9. Risks
- Shared primitives back EVERY webview — defaults must not change under non-wizard
  surfaces (ConfigureScreen, dashboard). Prefer NEW dedicated layouts over changing
  primitive defaults.
- Over-abstraction (see §6 counterpoint).
- The canonical-width decision is a real UX tradeoff (readability vs roominess) and
  gates everything.

## 10. Related
- `.rptc/research/wizard-layout-unification/research.md` (wizard-only precursor).
- Memory: `project_builder_nested_design`, `reference_dashboard_ui_conventions`.
