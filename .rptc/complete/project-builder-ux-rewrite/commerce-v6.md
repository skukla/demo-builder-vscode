# Plan: Project Builder v6 — Commerce slice

## Step 0: RPTC Re-initialization (ALWAYS FIRST)

After this plan is approved, context will be cleared. To restore full RPTC context, **re-invoke**:

```
/rptc:feat "Plan is approved, continue to implementation — v6 Commerce slice on feature/project-builder-ux"
```

This re-loads the five RPTC skills + frontend-design, re-activates Serena, and resumes at **Phase 3 (Implementation)**. Phases 1–2 are complete. The approved plan lives here and at `.rptc/plans/project-builder-ux-rewrite/commerce-v6.md` (persist a copy on re-entry).

**Worktree (all work happens here):**
`/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode.worktrees/feature/project-builder-ux` — branch `feature/project-builder-ux`. `cd` in before any work.

---

## Context

The creation wizard's "Project Builder" is locked at **design v6 — decomposed + guided** (source of truth:
`.rptc/research/project-builder-ux/research.md` §"LOCKED design v6"; visual spec:
`.rptc/research/project-builder-ux/prototype-v6-interactive.html` → `renderCommerce()`/`renderSummary()`).
The committed slice-1 shell (`507bf062`) holds; v6 changes what lives *inside* each area. This slice rebuilds
the **Commerce** area and replaces the uncommitted, **superseded v3 sequenced-tabs Commerce** sitting in the
worktree.

**Why:** v3's per-area sequenced tabs were a third competing progress level, the sign-in screen-swap was
jarring, and there was no running summary. v6 dissolves the "Architecture" concept (Commerce IS the backend),
replaces the tabs with a guided single-expand accordion, makes sign-in an in-accordion gate, and adds a
persistent summary column.

**Approach chosen:** Pragmatic structure (extract only what the 500-line cap forces; defer shared-primitive
extraction to the Storefront slice and Architecture-concept removal to the cleanup slice). For a brand whose
backend maps to >1 frontend (citisignal + PaaS → `{eds-paas, headless-paas}`), **persist the backend choice
and show the architecture as "frontend pending"** until the later Storefront area resolves the frontend — never
block, never silently guess.

---

## Target UX (v6 Commerce)

Two-column layout (`TwoColumnLayout`): **left** = guided single-expand accordion; **right** = persistent
summary column. Accordion sections, in order:

1. **Backend** — PaaS / ACCS selector cards, cross-filtered against the brand's allowed stacks
   (`Object.keys(pkg.storefronts)`). Choosing collapses to a value summary + ✓ and auto-advances.
2. **Sign in to Adobe** — ACCS only, when not signed in: amber "key" gate + message + `AdobeAuthStep` body
   (NOOP `setCanProceed`). Connection/Business/Catalog stay **locked** until signed in. One shared Adobe session.
3. **Connection** — `ConnectStoreStepContent section="connection"`. "Save & continue" collapses + advances.
4. **Business Structure** — `section="business-structure"` (Website→Store→Store-View). Advancing needs a store view.
5. **Catalog** — `section="catalog"` (Catalog Service + ACO, package-gated: `buildright` required, others
   excluded). **Locked** ("Choose a store view first") until a store view is chosen.

Section states: `current` (open) / `done` (✓ + value) / `upcoming` (greyed, openable) / `locked` (greyed,
one-line reason, not openable). Smooth `grid-rows` expand. No "Architecture" header/modal. Derived Architecture
label (e.g. "Edge Delivery + ACCS", or "frontend pending") shows read-only at the **top of the summary column**.

---

## Invariants (do not break)

- **Mesh dual-flow** (`selectedOptionalDependencies` / `hasMeshInDependencies`) and the **`MESH_ENDPOINT`→config.json**
  edge — route every backend selection through `useProjectBuilder.onStackSelect` (unchanged) so its mesh reset +
  edsConfig/addon/block-library seed + `onArchitectureChange` downstream reset still fire.
- **Config-driven** only (`stacks.json`, `demo-packages.json`) — render generically; never hardcode brands/stacks.
- **One stable `ConnectStoreStepContent` instance** at a fixed JSX position; only its `section` prop flips, so its
  store-discovery/config hook state survives section switches (no unmount/remount).
- File <500 lines, function <50 lines.

---

## Files

**CREATE** (each with adjacent test, written first):
- `src/features/project-creation/ui/steps/commerceSections.ts` — pure: (a) ordered section-state model
  (`current|done|upcoming|locked`+reason+value) transcribed from prototype `renderCommerce()`; (b)
  `resolveStackForBackend(stacks, pkg, backend, frontend?)` → `{ stackId | null, candidates, ambiguous }` and a
  provisional backend-keyed stack for config. Replaces the deleted `commerceTabStatuses`.
- `src/features/project-creation/ui/components/GuidedAccordion.tsx` — presentational single-expand accordion
  (`{ sections, openId, onOpen }`); renders marker/title/value/lock-reason + slide. Inline-now (one consumer);
  the Storefront slice is where it generalizes to a shared primitive.
- `src/features/project-creation/ui/components/CommerceSummary.tsx` — right-column summary: read-only derived
  Architecture label (or "frontend pending") + grouped Commerce rows with "Not set" placeholders + ✓
  (mirrors prototype `renderSummary()`).

**MODIFY:**
- `src/features/project-creation/ui/steps/CommerceStep.tsx` — full rebuild: `TwoColumnLayout` (accordion left /
  summary right); local `openSection` state + pure `firstOpenSection` seed; "Save & continue" collapses current →
  advances to next non-done/non-locked; Backend select → `resolveStackForBackend` → persist `selectedBackend` +
  (when unique) `onStackSelect`; sign-in via `AdobeAuthStep`; one `ConnectStoreStepContent` at stable position.
- `src/types/webview.ts` — add persisted `selectedBackend?: string` to `WizardState` (source of truth for the
  backend choice + the "frontend pending" display; `selectedStack` stays the downstream key).
- `src/features/project-creation/ui/steps/tileStatus.ts` — delete `commerceTabStatuses` (tab vocabulary, dead in
  v6); **keep** `isCommerceConfigured` + `isAdobeSignedIn`.
- `tests/.../steps/CommerceStep.test.tsx` — rewrite for accordion/summary/two-column (mock `ConnectStoreStepContent`
  + `AdobeAuthStep` as today).
- `tests/.../steps/tileStatus.test.ts` — drop the `commerceTabStatuses` blocks.

**DELETE** (no soft-deprecation):
- `src/features/project-creation/ui/components/SequencedTabs.tsx` + `tests/.../SequencedTabs.test.tsx`
- `src/features/project-creation/ui/components/ArchitectureSummary.tsx` + its test

**AUDIT the other uncommitted worktree edits** (`custom-spectrum.css`, `useWizardState.ts`, `stepFiltering.ts`,
`adobeMcpUpdateChecker.ts`, `useWizardState-dualFlow.test.tsx`): keep reusable infra; revert v3-tab/Architecture-only
bits; add v6 accordion + summary-column CSS.

**UNCHANGED (verified):** `ConnectStoreStepContent.tsx` and its `ConnectStoreStepContent.sections.test.tsx`
(the `section` prop + its tests already cover connection/business-structure/catalog); `useProjectBuilder.ts`;
`buildYourProjectAreas.ts`; `BuildYourProjectStep.tsx` (passes the same props).

---

## Build sequence (TDD — RED first each step)

1. **`commerceSections.ts`** (+`selectedBackend` type) — pure section-state model + `resolveStackForBackend`
   (unique / ambiguous / provisional). Tests (~16): section ordering, ACCS sign-in gate locks rest, catalog
   locked until store view, unique-resolution per brand, ambiguous (citisignal+PaaS) → `ambiguous:true`, value/label.
2. **`GuidedAccordion.tsx`** — controlled single-expand render. Tests (~10): only `openId` open, locked not
   openable + shows reason, done shows value+✓, `onOpen` fires for openable.
3. **`CommerceSummary.tsx`** — derived arch label / "frontend pending", grouped rows, "Not set" placeholders,
   ✓ on done. Tests (~8).
4. **`CommerceStep.tsx` rebuild** — two-column wiring; Backend→`onStackSelect`/`selectedBackend`; sign-in;
   one stable `ConnectStoreStepContent`; Save & continue auto-advance; gate `useCanProceedAll([isCommerceConfigured(state)])`.
   Rewrite `CommerceStep.test.tsx` (~18): single ConnectStore instance (same DOM node across section switch =
   no remount), mesh-reset on backend pick, gate booleans, locked reasons, "frontend pending" for ambiguous brand,
   sign-in gate. Trim `tileStatus.test.ts`.
5. **Delete** `SequencedTabs`/`ArchitectureSummary` (+tests); audit/revert v3-only css/infra; add v6 CSS. REFACTOR
   pass to keep `CommerceStep.tsx` < 500 / functions < 50.

---

## Verification

- Inner-loop gate after each step: `/gate` (scoped Jest → file, never piped to tail; `tsc --noEmit`; eslint on
  changed files).
- Before commit: full `npm run lint` + `npx tsc --noEmit` + `npx jest --no-coverage` (CI lints the whole repo).
- **F5 manual check** (preview loop — run `npm run watch:all`, reload the EDH window with Cmd+R): walk Backend →
  (ACCS gate) → Connection → Business Structure (pick a store view) → Catalog unlocks → done; confirm the summary
  column updates, single-expand + auto-advance work, and a multi-frontend brand (citisignal + PaaS) shows
  "frontend pending" without blocking. Compare against `prototype-v6-interactive.html`.

---

## Deferred to later slices (explicit)
- **Storefront slice:** frontend choice (resolves the pending stack), and `GuidedAccordion` generalizes to a shared primitive.
- **Integrations slice:** wire the shipped in-app Adobe I/O provisioning.
- **Cleanup slice:** remove the Architecture concept from `useProjectBuilder`/`buildYourProjectAreas`; `selectedStack` stays the single downstream key (via the `selectedBackend` bridge) until then.
