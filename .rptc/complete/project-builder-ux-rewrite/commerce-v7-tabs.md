# Plan: Project Builder Commerce — tabs + dedicated views (v7 presentation)

## Step 0: RPTC Re-initialization (if context clears)
Re-invoke `/rptc:feat "Plan is approved, continue to implementation — Commerce tabs+dedicated-views on feature/project-builder-ux"`.
Worktree (all work here): `…/demo-builder-vscode.worktrees/feature/project-builder-ux` (branch `feature/project-builder-ux`).

## Context
F5 of the v6 **guided accordion** Commerce area fell flat (PM). New direction (PM-confirmed): **each step gets its own
dedicated full view**, navigated by a **restyled top tab/step strip**, with the **right-hand summary column kept**.
This is a presentation swap of the just-built Commerce slice — the step model, the Backend→stack bridge, the summary,
and `ConnectStoreStepContent` all carry over unchanged; only the left-column container changes from a single-expand
accordion to a tab strip + dedicated-view area. Supersedes v6's accordion (call it v7); the rest of v6 (decomposed
backend, in-tab Adobe sign-in gate, persist-backend / "frontend pending") stands.

**Steps/tabs (order unchanged):** Backend · [Sign in — ACCS only, when not signed in] · Connection · Business
Structure · Catalog. Backend is the **first tab/view**. The active tab's content fills a roomy dedicated view (fixes
the cramped accordion). Locked tabs are non-clickable and show their reason; done tabs show a ✓; the wizard's Continue
gate is unchanged.

## What changes

**NEW — `src/features/project-creation/ui/components/StepTabs.tsx`** (presentational, controlled, reusable — the
Storefront slice will reuse it). Props `{ steps, activeId, onSelect }` where
`step = { id; title; status: 'current'|'done'|'upcoming'|'locked'; lockReason? }`. Renders a restyled horizontal
step/tab strip: numbered/marked tabs with status styling (done → ✓ + accent; current → filled/active; upcoming →
muted; locked → greyed + `aria-disabled` + reason via title/tooltip), connectors between steps, real `<button>`s
with `aria-selected`/`aria-disabled`. Locked tabs don't call `onSelect`. **Apply the frontend-design skill +
`reference_dashboard_ui_conventions`**: subtle Spectrum tokens, align to the content width, NO saturated fills, clear
active state, accessible focus rings. Add `.steptabs*` CSS to `custom-spectrum.css`.

**MODIFY — `src/features/project-creation/ui/steps/CommerceStep.tsx`**: replace the `GuidedAccordion` block with
`<StepTabs steps={tabModels} activeId={activeStep} onSelect={…} />` + a dedicated-view area
(`<div className="step-view">{sectionBody(activeStep, ctx)}</div>`) inside `TwoColumnLayout` left; `CommerceSummary`
stays in right. Build only the ACTIVE step's body (drop the `accordionSections` map that built all bodies). Keep the
existing `sectionBody` builder, `BackendCard`, the Backend→`onStackSelect`/persist-backend bridge, the ambiguous-clear
security guard, `handleSaveAndContinue` (advances the active tab via `nextOpenableSection`), the auto-advance effects
(storeViewChosen→catalog, signedIn→connection), and the `useCanProceedAll([isCommerceConfigured(state)])` gate. Rename
local `openSection`→`activeStep` for clarity. `tabModels` = `sectionStates.map(s => ({ id, title: SECTION_TITLES[s.id],
status: s.status, lockReason: s.lockReason }))`.

**DELETE (orphaned by this change, no soft-deprecation)** — `GuidedAccordion.tsx` + `GuidedAccordion.test.tsx`; remove
the now-dead `.acc*` accordion CSS from `custom-spectrum.css` (keep `.sum-*`).

**UNCHANGED (reused):** `commerceSections.ts` (the section-state model + bridge + `SECTION_TITLES` + `BACKEND_LABELS`
all drive the tabs as-is), `CommerceSummary.tsx`, `ConnectStoreStepContent.tsx` (still gets `section`; remounts on tab
switch — safe via the same persisted-prop rehydration), `tileStatus.ts`.

**DOCS:** update `.rptc/research/project-builder-ux/research.md` with a "v7 — tabs + dedicated views + summary
(supersedes v6 accordion)" note (keep history); the new-file JSDoc must describe tabs, not accordion.

## Tests (TDD — RED first)
- NEW `tests/.../components/StepTabs.test.tsx` (~10): renders all steps in order; status markers/classes per status;
  active tab flagged `aria-selected`; locked tab is `aria-disabled` and does NOT call `onSelect`; clicking an
  openable tab calls `onSelect(id)`; lockReason surfaced.
- REWRITE `tests/.../steps/CommerceStep.test.tsx`: replace accordion-body assertions with: the active step's content
  renders in the dedicated view (backend cards when Backend active; the config form when a config tab active;
  `AdobeAuthStep` when signin active); clicking a tab switches the active view + flips `ConnectStoreStepContent`'s
  `section`; locked config tabs unreachable until the ACCS sign-in / store-view gates clear. CARRY OVER (unchanged
  behavior): the unique/ambiguous Backend→stack bridge tests, the ambiguous-clear security-guard tests, the Continue
  gate, persisted-prop passthrough, mesh-reset on stack pick.
- DELETE `GuidedAccordion.test.tsx`.

## Verification
- Inner loop: `/gate` after each step (scoped Jest → file, never piped to tail; `tsc --noEmit`; eslint changed files).
- Pre-commit: full `npm run lint` + `npx tsc --noEmit` + `npx jest --no-coverage` (CI lints whole repo).
- **F5 (the decisive check):** `npm run watch:all`, Cmd+R the EDH window. Confirm the restyled tab strip reads well,
  each step is a roomy dedicated view, the summary column tracks choices, locked/done/active tab states are clear, and
  Backend→Sign-in(ACCS)→Connection→Business→Catalog flows with the gate. Iterate on the tab styling against PM taste.
