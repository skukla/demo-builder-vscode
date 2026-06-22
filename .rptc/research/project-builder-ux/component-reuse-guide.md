# Component & aesthetic reuse guide — nested "Build Your Project" build

**Purpose:** lock how the nested-builder UI reuses the extension's existing design system + components, so we
extend/reuse rather than reinvent. Pairs with `research.md` ("LOCKED design v3"), `prototype-v2-nested.html`
(visual spec), and `nested-builder-plan.md` (slices). All paths are worktree-relative.

---

## 1. Aesthetic rules (the canonical ways — do not invent)

| Concern | Rule | Source |
|---|---|---|
| **Dimensions** | Layout props take `DimensionValue` (`size-*` tokens / px / number) run through `translateSpectrumToken`. 8px base; common: `size-100`=8, `size-200`=16, `size-300`=24, `size-400`=32. | `src/core/ui/utils/spectrumTokens.ts` |
| **Colors** | Use Spectrum `--spectrum-global-color-*` (theme-aware) or `--db-*` semantic tokens. **Selection accent = blue-400** (border + `outline:2px; outline-offset:2px`). **Primary actions = Spectrum `<Button variant="accent">` (blue)** — that's the live CTA. (A tangerine `--db-cta-*` override exists in `tokens.css`/`custom-spectrum.css:188` targeting `.spectrum-Button--cta`/`[data-variant="cta"]`, but it's **inert** under React Spectrum v3.46 — `variant="cta"` isn't honored and those selectors don't match RS v3 output, so no orange renders. Treat it as dead code; don't build toward it.) | `src/core/ui/styles/tokens.css`, `custom-spectrum.css` |
| **Status** | Always via **`StatusDot`** variants (`success/error/warning/info/neutral`) or **`StatusCard`**/**`StatusSection`** — never raw inline color. StatusDot ships literal hex fallbacks (load-bearing; bare var collapses to invisible). | `core/ui/components/ui/StatusDot.tsx`, `feedback/StatusCard.tsx`, `wizard/StatusSection.tsx` |
| **Actions on status** | Quiet `<Link isQuiet>` after the status text — never a filled banner / `InlineAlert`. | `StatusCard.tsx:99-108` |
| **No saturated fills** | No `<View backgroundColor="static-*-400">` banners. An inline notice = small warning icon (`var(--spectrum-global-color-orange-600)`) + `.status-text` + quiet Link (model: `OrgMismatchBanner` / `.dashboard-org-banner`, gray-75 bg + orange left-accent). | `reference_dashboard_ui_conventions` memory |
| **Section headings** | `.section-label` — 11px / 600 / uppercase / letter-spacing .5px / gray-700. | `custom-spectrum.css:879` |
| **Width** | `.page-container` (max 800) or the derived `--dashboard-content-width`; never hardcode magic widths. | `custom-spectrum.css:564,1833` |
| **Flex width gotcha** | Spectrum `<Flex>` caps child width ~450px in nested wizard layouts → use a plain `<div style={{display:'flex',width:'100%'}}>` for width-critical rows (this is why `TwoColumnLayout` is plain divs). | `docs/development/ui-patterns.md:233-262` |
| **box-sizing** | Full-width inputs/tiles that set padding+border MUST set `box-sizing:border-box` explicitly (reset layer is lowest priority). | `custom-spectrum.css` |

**Reusable CSS class families:** `.selector-card` (the tile base — gray-50/1px gray-300/radius 8/pad 12; hover lift; `[data-selected]`→blue-400), `.architecture-modal-option` (spacious option row), `.modal-*` (`modal-footer-actions`, `modal-button*`, `modal-step-content` crossfade), `.section-label`, the `.text-*`/`.font-*`/color utilities. (Note: the legacy `.builder-overview*` block, `custom-spectrum.css:3759-3838`, is from the deleted two-column builder — likely removable; the nested build uses `.selector-card`/`ConfigTile`, not those rows.)

---

## 1a. Spacing spec (token-based rhythm — do NOT copy the prototype's px)

The extension's spacing sits on the 8px `size-*` grid with **12 (`size-150`) as the half-step**. Verified
anchors: `SingleColumnLayout` padding **24** (`size-300`); `TimelineNav` padding **32** (`size-400`), header
`marginBottom` `size-400`, step `marginBottom` (`stepSpacing`) `size-400`; `.section-label` margin-bottom **8**
(`size-100`); `.selector-card` padding **12** (`size-150`); timeline connector `left: 11px`, `top/height: 28px`.

**The prototype's raw px (`padding:26px 32px`, `gap:12px`, …) are throwaway — map every value to the nearest
token below; if a value isn't on this grid, it's wrong.**

| Nested-builder context | Spacing | Token |
|---|---|---|
| Step body container | reuse `SingleColumnLayout` (maxWidth 800, padding 24) | `size-300` |
| Parent timeline (rail) | unchanged — padding 32, header mb 32, step gap 32 | `size-400` |
| **Nested sub-steps** (new) | indent child block ≈ 24 past the parent dot; child step gap 24 (tighter than parent's 32 to read as a sub-level); smaller child dot; child connector mirrors `.timeline-connector` at the child offset | `size-300` |
| **Architecture header** (StatusCard wrapper) | margin-bottom before the tabs | `size-300` (24) |
| **Sequenced tabs** strip | tab padding 8×12 (v×h); tab↔connector gap 8; strip margin-bottom before pane 24; number-dot ≈18px (StatusSection 'S' icon scale) | `size-100`/`size-150`/`size-300` |
| Within a pane | `.section-label` mb 8 (existing); gap between sections 24 | `size-100` / `size-300` |
| Form fields | **don't override** — reuse `ServiceGroupList` + `ConfigFieldRenderer` defaults | — |
| Tile grid (Integrations) | grid gap 16; `ConfigTile` internal padding 12 (existing) | `size-200` / `size-150` |

Rule of thumb: outer/section rhythm = `size-300` (24); component-internal padding = `size-150` (12); tight
gaps = `size-100` (8); the timeline keeps its `size-400` (32). Apply via `DimensionValue` props /
`translateSpectrumToken`, never literal px.

---

## 2. Reuse map — each nested-builder element → what to use

| Nested-builder element | Verdict | Use / base on |
|---|---|---|
| **Nested timeline** (areas indented under "Build Your Project" in the SETUP PROGRESS rail) | **EXTEND** `TimelineNav` | `core/ui/components/TimelineNav.tsx` is flat today (`TimelineStep={id,name}`, index-driven). Add optional `children?: TimelineStep[]` + `childStatusById?`; render one indented level when a step is `current`. Reuse its status system (`getStepStatus` :240, `getTimelineStepDotClasses` :33, `renderStepIndicator` :63) + CSS `.timeline-step-dot-*` (`custom-spectrum.css:1683-1699`). One nesting level, no recursion. ~40-60 lines + a child-scale CSS block. |
| **Sequenced tabs** (Commerce/Storefront sub-subs: numbered, ✓/current/upcoming, auto-advance) | **BUILD NEW** (no Spectrum `Tabs` anywhere) | New presentational `SequencedTabs.tsx` `{tabs:{id,label,status}[], activeId, onSelect}`. Reuse `TimelineNav`'s `TimelineStatus` type + `renderStepIndicator` markers + `.timeline-step-dot-*` classes for the ✓/current/upcoming dots; model the clickable chip on `ConfigTile`/`.selector-card` (role=button, Enter/Space, `data-status`). |
| **Auto-advance** (jump to next tab when current completes) | **BUILD NEW** (no precedent) | Small effect in the area component: when the active sub-step's `tileStatus` predicate flips to configured, set `activeId` to the next non-done tab. |
| **Architecture header summary** ("Architecture: Edge Delivery + ACCS [Change]") | **REUSE** `StatusCard` | `StatusCard` already = status text + quiet-Link action. Thin `ArchitectureSummary.tsx`: `<StatusCard label="Architecture" status={archName} color="blue" action={{label:'Change', onPress}} />`. Change handler already exists (`onArchitectureChange` → `useProjectBuilder`). |
| **Area tiles** (Integrations collection) | **REUSE** `ConfigTile` + `tileStatus` | `ui/components/ConfigTile.tsx` (`label`/`summary`/`status`/`onPress`); add `isIntegrationsConfigured` + per-tile predicates to `ui/steps/tileStatus.ts`. |
| **Per-concern editors** (modals where still used; e.g. an integration's config) | **REUSE** `Modal` + `DialogContainer` | `core/ui/components/ui/Modal.tsx` (`size="L"`); the open-from-step pattern (`useState` flag + `<DialogContainer onDismiss>{open && <Modal/>}`), model `eds/ui/steps/DaLiveSetupStep.tsx`. |
| **Area pane bodies** (Architecture, Connection, Catalog, Services, Repo, Block Libs, App Builder) | **REUSE as-is** (re-host under tabs instead of modals) | `ArchitectureStepContent`, `ConnectStoreStepContent`, `BlockLibrariesStepContent`, `AppBuilderComponentsStepContent`, `RepoSelectionInline`, `GitHubServiceCard`/`DaLiveServiceCard`. Prop surfaces unchanged. |
| **Config-driven forms** (Connection/Catalog fields) | **REUSE** | `ConfigFieldRenderer` (text/url/password/select/boolean) + `ServiceGroupList` (groups) + `descriptionRenderer` (clickable/copyable help). Render generically from `serviceGroups`. |
| **Contextual Adobe sign-in** (Commerce first tab for ACCS; inline in Integrations) | **REUSE** | The auth cards + hooks (`useGitHubAuth`/`useDaLiveAuth` pattern; Adobe via `AdobeAuthStep` UI), surfaced inline; status/CTA via `StatusCard`/quiet Link. One shared session. |
| **List-select** (e.g. pick existing repo / App Builder app) | **REUSE** | `useSelectionStep` + `SelectionStepContent` (search/load/cache/auto-select). |
| **Continue gate** | **REUSE** | `useCanProceedAll([isXConfigured(state)], setCanProceed)` — **primitive booleans only** (fresh arrays/objects → infinite re-render; see CommerceStep:140). |
| **Layout container** | **REUSE** | `SingleColumnLayout` (the step body); `TwoColumnLayout` only if a persistent right-rail summary is wanted (the tiled steps chose single-column). The step renders inside WizardContainer's existing `PageLayout`/`PageFooter` — no new chrome. |
| **Loading / empty** | **REUSE** | `LoadingDisplay`/`LoadingOverlay`/`CenteredFeedbackContainer`. |

---

## 3. Net-new primitives (the only things to actually build)
1. **`SequencedTabs.tsx`** — presentational numbered tab strip (markers from TimelineNav, chip from selector-card).
2. **`TimelineNav` nesting extension** — one indented child level (`children?`/`childStatusById?`).
3. **Sub-step status model** — extend `tileStatus.ts` with per-sub-step predicates (stack-selected, store-connected, etc.) feeding BOTH the sequenced tabs AND the nested timeline. *Load-bearing.*
4. **Auto-advance effect** — parent-level, watches predicates.
5. **`ArchitectureSummary.tsx`** — thin `StatusCard` wrapper (assembly, not a primitive).
Everything else is reuse/extend.

## 3a. JSON-config vs TS boundary (builder structure) — decided 2026-06-22

The extension's pattern: **flat data + per-step `condition` keys → JSON; rendering, id→component routing, and
behavior → TS** (`wizard-steps.json` declares conditions, `stepFiltering.ts` interprets them, `renderStep`
maps id→component; `ConfigFieldRenderer` maps field `type`→widget). There is **zero precedent for nested UI
structure in JSON** (no `children`/`tabs`/`areas`/`sections` in any config), and schemas are enforced only in
Jest.

**Decision for the nested builder — reuse the philosophy, add NO new JSON:**
- **Areas** (id/label/order/visibility) = a **TS `as const`** carrying a `condition`, run through the EXISTING
  `StepCondition` + `filterStepsForStack` (so Storefront's EDS-only rule uses the same
  `stackRequiresAny:["requiresGitHub","requiresDaLive"]` vocabulary, not an ad-hoc `frontend===` check).
- **Per-area tabs** (id/label/order) = **TS `as const`**, co-located with the area component.
- **id→component routing + status predicates + gating** = **TS** (switch/record + `tileStatus`), like `renderStep`/`tileStatus`.
- **Field content inside tabs** = **already JSON** (components.json) — unchanged.
- Do NOT add a 7th JSON config and do NOT nest `areas`/`children` into `wizard-steps.json` (YAGNI + against
  the flat-config grain; a TS `as const` is compile-time-safe and far less boilerplate).

## 4. Key gotchas (carry into every slice)
- `useCanProceedAll` / child-hook array props: **primitive booleans + module-level `const EMPTY`** (React array-ref loop — MEMORY).
- `StatusDot` literal hex fallbacks are load-bearing — keep them.
- Spectrum grays **invert with theme** (the wizard runs dark; gray-200 ≈ near-black) — use semantic tokens, test in the actual theme.
- Spectrum `Dialog`/`Modal` already trap focus; only use `useFocusTrap` for bespoke containers.
- The tile/sub-step "configured" verdict persists to `WizardState` (`commerceConnectValid`/`storefrontRepoValid` …) so badges/gates survive modal-close + nav — not ephemeral local state.

## 5. Component catalog (paths)
Layout `core/ui/components/layout/` · Modal `core/ui/components/ui/Modal.tsx` · Status `ui/StatusDot.tsx`,
`feedback/StatusCard.tsx`, `wizard/StatusSection.tsx`, `wizard/ConfigurationSummary.tsx` · Timeline
`core/ui/components/TimelineNav.tsx` · Tiles `project-creation/ui/components/ConfigTile.tsx` +
`ui/steps/tileStatus.ts` · Forms `components/ui/components/{ConfigFieldRenderer,ServiceGroupList,StoreConfigFieldRow}.tsx`,
`core/ui/components/forms/descriptionRenderer.tsx` · Hooks `core/ui/hooks/{useSelectionStep,useCanProceed,useArrowKeyNavigation,useFocusTrap}.ts`
· Content `project-creation/ui/components/{ArchitectureStepContent,ConnectStoreStepContent,BlockLibrariesStepContent,AppBuilderComponentsStepContent}.tsx`,
`eds/ui/steps/RepoSelectionInline.tsx`, `eds/ui/components/{GitHubServiceCard,DaLiveServiceCard}.tsx`.
