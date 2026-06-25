# Research: Wizard Layout Unification (responsive spacing across the app)

**Status:** Research / design — not yet planned or implemented.
**Branch context:** `feature/project-builder-ux`. The Commerce (Build Your Project) step
already adopted the target model (commits `dcd7c677` + earlier); this doc is about rolling
that model across the rest of the wizard.
**Date:** 2026-06-25.

## 1. Problem

The "Create Demo Project" wizard has **four unrelated layout regimes** across its steps —
different widths, different alignments, and three different left edges — so steps don't line
up with each other or with the header/footer. The Commerce step was reworked to a
**left-aligned, fixed content-zone** model (bounded center, summary panel flex-grows to the
screen edge, footer actions structurally mirror the content columns). The goal is to make
that the single, consistent model for the whole wizard.

The user's stated principles (from the Commerce work):
- **No centered blocks** — centering "feels like wasted space." Everything left-aligned.
- **Fixed zones, not fluid** — a bounded content width; extra horizontal space becomes a
  flex-grow side panel (summary) reaching the screen edge, NOT stretched columns.
- **Roomy center** — "as roomy as aesthetically possible" without going sparse.
- **No magic-number duplication** — widths live in shared CSS vars; the footer mirrors the
  content structurally (same flex rules), not via fixed-px calc.

## 2. Current state (as built)

| Surface | Component | Width | Alignment | Left inset |
|---|---|---|---|---|
| Header (every step) | `PageHeader` (constrainWidth defaults **false**) | full-width | left | 32px (View `size-400` pad) |
| Single-col steps | `SingleColumnLayout` | 800px | **left** (`margin:0`) | 24px (`size-300` pad) |
| Two-col steps | `TwoColumnLayout` (default) | 1200px pair | **centered** (`margin:0 auto`) | varies |
| Commerce (done) | `TwoColumnLayout` (`maxWidth="none"`) | full-width | **left**, summary→edge | 0 (nav bleeds) |
| Footer (default) | `PageFooter` → `.footer-content-container` | 800px | left | 32px |
| Footer (Commerce) | `PageFooter` `commerceColumns` variant | mirrors content | left | 0 |

### Primitives
- `src/core/ui/components/layout/SingleColumnLayout.tsx` — `maxWidth='800px'`, `width:100%`,
  `margin:'0'` (already **left-aligned**), `padding:'24px'`, `box-sizing:border-box`.
- `src/core/ui/components/layout/TwoColumnLayout.tsx` — pair capped at `maxWidth='1200px'` and
  **centered** (`margin:0 auto`); left column capped by `leftMaxWidth='800px'`; right column
  `flex-1` (grows) OR fixed when `rightWidth` set. Commerce passes `maxWidth="none"` to go
  left-aligned + full-width and caps the left column via CSS instead.
- `src/core/ui/components/layout/PageHeader.tsx` — `constrainWidth` default **false** → renders
  full-width left-aligned (the wizard does NOT pass it, so the header is full-width). When
  `true` it uses `.page-container` (`max-width:800px; margin:auto` → centered) — used elsewhere
  (e.g. ConfigureScreen), NOT the wizard header.
- `src/core/ui/components/layout/PageFooter.tsx` — default 3-cell grid in
  `.footer-content-container` (800px, left). New `commerceColumns` variant mirrors
  `[nav-spacer | flex actions | flex-grow summary-spacer]` using shared `--commerce-*` vars.

### Shared CSS vars (Commerce-scoped today)
Defined on `.wizard-main-content` in `src/core/ui/styles/custom-spectrum.css`:
- `--commerce-nav-width: size-3000` (240px) — only Commerce has a left nav.
- `--commerce-content-pad: size-300` (24px).
- `--commerce-zone-max: 960px` — the left zone (nav + step-view) cap; the footer mirrors it.

### Step → layout inventory
- **Single-col** (`SingleColumnLayout`): WelcomeStep, PrerequisitesStep, ReviewStep,
  AdobeAuthStep, GitHubSetupStep, DaLiveSetupStep, StorefrontSetupStep, MeshDeploymentStep,
  ProjectCreationStep, IntegrationsStep, StorefrontStep, BuildYourProjectStep (area frame).
- **Two-col, centered 1200** (`TwoColumnLayout`, left+right): AdobeProjectStep,
  AdobeWorkspaceStep, ComponentConfigStep. (RepoSelectionInline collapses to single column.)
- **Two-col, left-aligned full-width (target)**: CommerceStep (done).

## 3. Inconsistencies to resolve

1. **Three left edges** — header 32px, single-col 24px, Commerce 0px. Nothing aligns vertically.
2. **Two-col steps are centered at 1200** — the "wasted space" the user rejected for Commerce.
   These (Adobe Project/Workspace, Component Config) are the biggest remaining offenders.
3. **Unrelated widths** — 800 (single) vs 1200 (two-col) vs full (Commerce).
4. **Commerce-scoped generalization** — `commerceColumns` footer + `--commerce-*` vars must be
   promoted to wizard-level to serve all steps.

## 4. Target model

- **Left-align everything; remove all centering** (`.page-container` margin-auto in the header
  variant, `TwoColumnLayout` `maxWidth` centering). Single-col is already left; the two-col
  steps are the work.
- **One shared content band** via a wizard-level CSS var (promote `--commerce-zone-max` →
  `--wizard-content-max`). Single-col content, two-col left zone, header, and footer all
  reference it → one left edge + one band width across the wizard.
- **Two-col steps adopt the Commerce pattern**: the summary/right column flex-grows so its
  panel reaches the screen edge (content held tight inside), and they use the generalized
  footer columns variant.
- **Header + footer align to the band** — same left edge, same width.
- **Breakpoints unchanged** — the existing registry already lives on the shared primitives'
  media queries: `1280` rail-collapse, `1180` two-column stack, `600` linear, `220` card-min
  (`custom-spectrum.css` "Wizard breakpoint registry"). The model reuses them as-is.

### Why structural footer mirroring generalizes cleanly
The `commerceColumns` variant already renders `[nav-spacer | flex actions | flex-grow
summary-spacer]` with the same flex rules as the content. A single-col step is the degenerate
case (no nav-spacer, no summary-spacer) — so one generalized variant covers both: with a
sidebar (two-col) and without (single-col). No per-step calc.

## 5. Open decisions (need user input)

1. **Canonical band width.** Commerce's zone is ~960 (nav 240 + center ~720); single-col is
   800. They must converge. "As roomy as possible" leans ~900–960; text-heavy single-col
   steps (Review, Prerequisites) read better ≤800. **Proposed: ~880, tuned on F5.**
2. **Two-col summaries edge-to-edge** like Commerce? **Proposed: yes** (consistency, no gutter).
3. **Left inset** — unify 0/24/32 to one value. **Proposed: bleed to 0** (like Commerce), with
   the content's own padding providing breathing room; alternatively one consistent pad.
4. **Var naming** — `--commerce-*` → `--wizard-*` (e.g. `--wizard-content-max`,
   `--wizard-content-pad`). Nav width stays Commerce-specific (`--commerce-nav-width`) since
   only Commerce has a nav.

## 6. Generalization / implementation work

- **Vars**: promote `--commerce-zone-max`/`--commerce-content-pad` → `--wizard-*` on
  `.wizard-main-content`; keep `--commerce-nav-width` Commerce-scoped. Update Commerce refs.
- **SingleColumnLayout**: drive `maxWidth`/`padding` from the shared vars (or a wizard-default).
- **TwoColumnLayout**: make left-aligned + summary-flex-grow the wizard default (or a prop the
  steps set), capping the left zone at the shared var via CSS — same mechanism Commerce uses
  (`.commerce-two-col .two-column-layout-left { max-width: var(...) }`), generalized.
- **Two-col steps** (AdobeProjectStep, AdobeWorkspaceStep, ComponentConfigStep): switch to the
  left-aligned + summary-to-edge config + the generalized footer variant. Cap their summary
  CONTENT width (like `.commerce-summary-content`) so label↔value stays tight.
- **PageHeader**: align the header's left edge + width to the band (it's already left-aligned
  and full-width; mainly the left inset needs to match the content).
- **PageFooter**: rename/generalize `commerceColumns` → a content-aligned variant; single-col
  steps opt into the no-sidebar form so their footer aligns to the band too.
- **`.page-container`**: if any wizard surface still uses it centered, left-align it.

## 7. Phased plan (proposed)

- **Phase 0 — foundation**: promote vars; pick the band width; generalize the `PageFooter`
  variant + the `TwoColumnLayout` left-align/summary-grow mechanism. No visible step changes
  yet (Commerce keeps working via the renamed vars).
- **Phase 1 — proof**: convert ONE single-col step (e.g. ReviewStep) + ONE two-col step
  (e.g. AdobeProjectStep) to the model. F5 — validate left edge, band width, summary-to-edge,
  footer alignment, and the header lining up.
- **Phase 2 — rollout**: convert the remaining single-col steps, the remaining two-col steps,
  and align the header. F5 per cluster.
- **Phase 3 — cleanup**: remove dead width props / centering; ensure the breakpoint behavior
  is consistent at 1280/1180/600.

## 8. Risks

- **Shared primitives affect every step** — a change to `SingleColumnLayout`/`TwoColumnLayout`/
  `PageHeader`/`PageFooter` ripples to all steps (and `PageFooter`/`SingleColumnLayout` are
  also used by non-wizard surfaces like ConfigureScreen — confirm blast radius before changing
  defaults vs adding opt-in props).
- **Readability vs roominess** — a wider single-col band may hurt text-heavy steps; the band
  width is a real UX tradeoff to validate on F5.
- **Breakpoint interactions** — the band + summary-to-edge must degrade correctly at the 1180
  stack and 600 linear breakpoints for every step, not just Commerce.

## 9. Verification approach

Per phase: `tsc --noEmit` + `eslint` (changed files) + the affected step/layout/footer Jest
suites, then **F5** to eyeball the left edge, band width, summary-to-edge, and header/footer
alignment at a wide viewport AND at the 1180 / 600 breakpoints.

## Related
- Commerce model commits: `dcd7c677` (layout + structural footer), earlier checkmark/marker work.
- Memory: `project_builder_nested_design` (v6 LOCKED design), `reference_dashboard_ui_conventions`.
