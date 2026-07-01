# Research: Integrations "Services" step — inline-expansion card + chrome reclaim

**Date:** 2026-07-01
**Branch:** `feature/project-builder-ux`
**Status:** Complete — design locked, ready for `/rptc:feat`
**Mockups:** `prototype-v7-integration-cards.html` (card exploration), `prototype-v8-chrome-reclaim.html` (canonical — chrome before/after with the card in context)

## Question

The Integrations "Services" sub-step showed the API Mesh deployable as a *card* whose only
action flipped an On/Off pill in place, then revealed a separate `Destination` sub-step tab.
Two complaints: (1) a card visually promises drill-in, but this one only toggled a pill; (2) the
config lived in a disconnected sibling tab. Should the card drill into a modal, inline-expand, or
become a plain row? What matches the rest of the wizard and reuses existing code?

## Findings

### 1. The card affordance mismatch is real (confidence: high)
Adobe Spectrum guidance: a card affords a **destination** — "should have some form of interaction,"
and if the only action is view/open, the whole card is the target. React Spectrum never shipped a
stable interactive `Card` (perpetual alpha). A card that only toggles a pill is off-pattern. The
user's "this should drill in" reading is correct.

### 2. Sub-step tabs are the house pattern, not an anomaly (confidence: high)
The shared `areaSubSteps` driver walks Commerce (backend → sign-in → config) and Storefront
(repo → code-sync) as sibling sub-step tabs. Integrations' Services → Destination is the same idiom.
So config-in-a-sibling-tab is consistent with the wizard — the mismatch is the *card visual*, not the
flow. Any redesign that dissolves the tabs is a deliberate divergence for Integrations (defensible:
it is the "add optional things" area, and it has one real deployable).

### 3. No modals exist in project-creation; one canonical browse⇄create shell exists (confidence: high)
`ArchitectureModal` (still cited in root CLAUDE.md) is **gone** — the sub-step nav replaced it. There
are zero modals under `src/features/project-creation`. The reusable idiom is the browse⇄create panel,
duplicated byte-for-byte as `NewRepoForm` (GitHub repo) and `NewAdobeEntityForm` (Adobe I/O): a
gray-50 `View` + level-3 `Heading` + `TextField` + Browse/Create footer + `LoadingOverlay`, toggled by
local state. A modal here would be a new idiom for no benefit with one item.

### 4. Searchable pickers already exist — reuse, don't rebuild (confidence: high)
There is **no `ComboBox`** anywhere. The searchable control is `AdobeProjectPicker`/
`AdobeWorkspacePicker` → `SelectionStepContent` → `SearchableList` (Spectrum `ListView` +
`SearchHeader`), with a built-in `searchThreshold` (search field appears only past 5 items), a
`+ New` action slot, and loading/refresh states. `AdobeEntityFields` already wraps these into the
select-or-create control the current Destination tab renders. Moving to inline expansion just
**relocates `AdobeEntityFields`** into the card — the searchable picker comes free.

### 5. The real constraint is vertical budget, and the chrome is heavy + redundant (confidence: high — measured)
The wizard is `height:100vh` with `PageHeader` + scrollable body + `PageFooter`. Header and footer are
each `padding="size-400"` (~128px of pure padding combined); the header stacks H1 + subtitle +
description (~150px total). Wayfinding is stated **four times, stacked**: left timeline rail, header
subtitle/description, in-body `.area-title`, and the `.step-nav-area` label. Reclaiming this — compact
single-line header on the Build step (the rail owns wayfinding), tighter paddings, drop the duplicated
in-body title — returns **~130px** (measured live in `prototype-v8`). That is most of a searchable-list
panel, and it benefits every screen, not just Integrations.

## Locked design decision

**Path 2 — card-as-screen with inline reveal, funded by the chrome reclaim.**

1. **Reclaim chrome, wizard-wide.** Compact single-line header on the Build step; tighten header/footer
   padding (`size-400` → ~`size-200`); drop the in-body area title where the rail + header crumb cover
   it. Independent win; do it regardless.
2. **Card = blue-check selection.** Replace the On/Off pill with the Commerce `choice-card[data-selected]`
   language (blue border + tint + ✓). `+ Add` / `Remove` stays the control (a toggle is wrong — the
   wizard commits on Continue/Finish, so a switch would falsely imply instant effect).
3. **Inline expansion hosts the config.** Adding the mesh expands the card to reveal `Destination ·
   Adobe I/O` = the existing `AdobeEntityFields` (searchable project + workspace select-or-create) inline.
   This dissolves the separate `Destination` sub-step.
4. **PaaS sign-in folds into the card** as an inline gate (reuse `AdobeAuthStep`), dissolving the separate
   `Sign in` sub-step. ACCS is already signed in at Commerce.
5. **Commit-and-collapse** keeps the footprint small: one picker open at a time; a chosen field collapses
   to a one-line row with a quiet `Change`. Mirrors the Commerce accordion's done-state.
6. **Cut the provision "On deploy…" filler.** Commit-on-Finish already implies it.
7. **Keep** the dashed "+ Add an integration / coming soon" slot (PM: placeholder is fine).

### Reuse map (keep the build lean)
- `AdobeEntityFields` / `AdobeProjectPicker` / `AdobeWorkspacePicker` / `SearchableList` — the searchable
  select-or-create, verbatim.
- `AdobeAuthStep` — the inline sign-in gate.
- Commerce `choice-card` selection CSS — the blue-check language.
- Commerce accordion done-state — the commit-and-collapse behavior.
- `PageHeader` / `PageFooter` — parameterize a compact variant rather than fork.

### Architectural consequence
Integrations' `areaSubSteps` order collapses from `deployables · [signin] · target` toward a single
Services screen whose card carries sign-in + destination. The Continue/Finish gate (project + workspace
chosen) moves onto the Services sub-step. This is the deliberate divergence from Commerce/Storefront.

### Open item to verify during build
In the tallest transient states (Signed out + PaaS sign-in gate; an open project picker with the search
list showing) confirm the body still fits under reclaimed chrome. A brief scroll in one transient
sub-state is acceptable; the common signed-in path should not scroll.

## Next step
`/rptc:feat` to plan: (A) chrome reclaim (PageHeader/PageFooter compact variant + Build-step wiring),
(B) the inline-expansion Integrations card (blue-check card + relocate `AdobeEntityFields` + inline
sign-in gate + commit-and-collapse), (C) dissolve the `signin`/`target` sub-steps and move the gate,
(D) tests + the shared-driver updates.
