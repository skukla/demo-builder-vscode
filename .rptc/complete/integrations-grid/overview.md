# Dashboard integrations card-grid + detail drawer (prototype 2)

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:feat "Plan is approved, continue to implementation"`. Work happens in the
> worktree `…/demo-builder-vscode.worktrees/feature/integrations-grid` (branch
> `feature/integrations-grid`, created off develop @ `cfe4e6a2`). Mirror this plan to
> `.rptc/plans/integrations-grid/overview.md` on implementation start.

## Context

The dashboard renders App Builder integrations as stacked rows (`AppBuilderComponentsList` +
`AppBuilderComponentRow`/`MeshComponentRow`). The approved prototype
(`.rptc/research/app-builder-integration-model/prototype-integrations-grid.html`) replaces this
with a **card grid + right detail drawer**: each integration is a calm card (name, status dot,
one mono source line, AT MOST ONE face affordance), the mesh is a peer card with an accent left
border, and all detail/actions live in a 392px slide-in drawer. Pure presentation over the merged
keyed `appBuilderComponents` data — the id-scoped messages (`deploy/redeploy/verify/rename/
removeAppBuilderComponent`, `openLiveSite`) and both status channels already exist.

**Design spine (merged from two architect passes):**
- New module directory `src/features/dashboard/ui/components/integrations/` behind an
  **unchanged `IntegrationsBlock` props surface** (screen wiring untouched).
- One pure derivation file `integrationCardModel.ts` — `deriveIntegrationCard(entry, override)`
  + `deriveMeshCard(statusDisplay, status, meshEntry, isActionDisabled)` → a single
  `IntegrationCardModel` consumed by card face, drawer body, drawer action bar. The
  mesh/integration asymmetry lives ONLY here. React-free, fully matrix-tested.
- **Verified functional gap that must be fixed (not optional):** the webview's component map is
  seeded once; `addAppBuilderComponent` pushes `'deploying'` for an id with no row (dropped) and
  remove pushes nothing — added cards never appear, removed cards linger. Fix: a new
  `appBuilderComponentsSnapshot` push (extension → webview, fresh persisted map) sent after
  add/deploy/redeploy terminal, remove success, rename success (`postComponentsSnapshot` helper
  beside `postRowStatus`; `sendAppBuilderComponentsSnapshot` beside the row-status sender in
  `showDashboard.ts`), plus pending-card synthesis in the model builder for unknown-id
  `deploying` overrides.
- Hand-rolled `Drawer.tsx` primitive (NO Spectrum Tray — mobile-only + unmocked): always-mounted
  fixed divs, `.open` toggles `translateX(100%)→0` (.22s), `visibility:hidden` when closed,
  scrim click + Esc close (Esc skipped when `event.defaultPrevented` so stacked Spectrum dialogs
  own their own Esc), focus captured on open (✕ button) and restored to the opener on close,
  minimal Tab wrap (~15 lines), `role="dialog"` + `aria-modal`. Dashboard-local,
  promotion-ready (core move at 2nd consumer).
- In-drawer rename: `InlineRenameField` (core forms) + the existing `renameAppBuilderComponent`
  message widened with optional `name` payload — payload present → skip `showInputBox`, run the
  SAME validation chain (`validateRenameInput` + `takenIntegrationNames` + catalog/mesh gates),
  return `{success:false, error}` for inline display; no-payload path byte-identical.
- Add flow: add tile (last grid cell — it IS the empty state; "No integrations yet." dies) +
  header "+ Add integration" button → `AddIntegrationModal` (DialogContainer + core `Modal`, the
  `ManageApisModal` hosting pattern) wrapping today's picker content/messages verbatim (catalog
  buttons → `addAppBuilderComponent {id}`; custom URL via `parseGitHubUrl` → `{source}`).
- `stale` surfaced distinctly (warning dot, "Update available", Update action). Path verified:
  persisted union + push union both carry it; NO producer writes it yet (dormant by design —
  staleness detector is backlog).

## The model contract (implement exactly)

Types: `CardStatus` (`not-deployed|deploying|deployed|stale|error` + mesh-only
`needs-auth|checking`), `FaceAction` (attention kinds or `{kind:'open', url}`), `BarAction`
(`{action, label, emphasis: primary|secondary|danger, disabled?}`), `IntegrationCardModel`
(`id, isMesh, name, kindLabel, sourceLine, sourceIsAi, status, statusLabel, dotVariant, message?,
url?, urlLabel: 'Endpoint'|'App URL', deployedUrls?, apis?, lastDeployed?, faceAction, barActions,
canRename`).

Integration matrix: not-deployed → neutral dot, face Deploy, bar Deploy(primary)·Manage APIs·
Remove(danger) · deploying → info dot + pulse, no face, empty bar · deployed → success, face
Open↗ (if url), bar Redeploy·Verify·Manage APIs·Remove · stale → warning "Update available",
face Update, bar Update(primary)·Verify·Manage APIs·Remove · error → error dot, face Retry, bar
Retry(primary)·Manage APIs·Remove. (Manage APIs pre-deploy is NEW and intended — `setConsoleApis`
is workspace-scoped, not deployment-scoped.)

Mesh matrix (statusLabel = `statusDisplay.text`; all actions carry `disabled:isActionDisabled`;
canRename false; NO Manage APIs/Remove anywhere): checking → neutral, nothing · needs-auth →
warning, Sign in · not-deployed → Deploy · deploying → pulse · deployed → success, Open↗
(endpoint), bar Redeploy · config-changed/update-declined/config-incomplete → stale/warning,
Update · error → Retry. Mesh card = `.integration-card--mesh` accent left border; "Data layer"
role tag in the drawer only.

kindLabel: catalog id → 'Pre-built'; source matches the blank catalog entry's source →
'Custom · built with AI' + sourceLine 'Built with AI' (`sourceIsAi`); else 'Imported repo' +
mono owner/repo. `canRename` = integration-kind AND non-catalog (the existing rule, one home).
Override precedence identical to today's merge (status/name overrides win; name survives
name-less pushes). Dispatch: ONE `handleAction(model, action)` switch in the grid — mesh routes
to `onDeployMesh`/`onReAuthenticate`, integrations to keyed messages; face `open` →
`openLiveSite` with stopPropagation (containment span per `InlineRenameField.tsx:123`).

## Files

NEW (in `integrations/`): `integrationCardModel.ts` (~200) · `Drawer.tsx` (~90) ·
`IntegrationCard.tsx` (~110) · `IntegrationDrawer.tsx` (~170) · `AddIntegrationModal.tsx` (~110)
· `IntegrationsGrid.tsx` (~250, hosts the shared RemoveDialog/ManageApisModal singletons +
drawer + add modal; drawer model looked up fresh each render → live updates; selected card
removed → drawer closes). MOVED: `useRowStatusOverrides` → `ui/hooks/` (byte-compatible).

MODIFIED: `IntegrationsBlock.tsx` (props FROZEN; internally builds mesh descriptor inputs instead
of a ReactNode row) · `handlers/appBuilderComponentHandlers.ts` (rename payload +
`postComponentsSnapshot`) · `commands/showDashboard.ts` (snapshot sender; stale comments) ·
`core/ui/styles/custom-spectrum.css` (new ~120-line section) · `types/messages.ts` if the
snapshot message needs a MessageType entry (check registry pins).

DELETED outright (+ suites): `AppBuilderComponentsList.tsx`, `AppBuilderComponentRow.tsx`,
`MeshComponentRow.tsx`, `appBuilderComponentStates.tsx` (verified: no consumers outside the
dying set; project-creation's AppBuilderComponentRow is a different local component).
KEPT: `AppBuilderComponentRemoveDialog`, `ManageApisModal`, `StatusDot`, `useDashboardStatus`,
all handlers/runner (except the rename widening).

## CSS (custom-spectrum.css, tokens flip light/dark; grid/drawer/scrim are PLAIN DIVS — Flex 450px cap)

`.integrations-grid` repeat(auto-fill,minmax(268px,1fr)) gap 16 padding 8 ·
`.integration-card` gray-50 bg / 1px gray-300 / radius 8 (family consistency over prototype's
10px) / padding 16 / flex column / min-height 128 / hover gray-75 + translateY(-2px) + shadow +
gray-400 border / focus-visible blue-400 outline (all per `.project-card-spectrum:2732`) ·
`--mesh` 3px blue-400 left border · name 15px/600 ellipsis · status 12px gray-600 (+ error
modifier) · source 12px mono gray-500 ellipsis (`--ai` italic sans) · foot margin-top:auto ·
`.integration-dot--deploying` pulse keyframes + prefers-reduced-motion off ·
`.integration-add-tile` 1.5px dashed / same min-height / centered / hover blue accent ·
`.db-drawer-scrim` fixed inset 0 rgba(0,0,0,.42) z-100 · `.db-drawer` fixed right 392px
max-width 92vw / gray-50 / left border / lift shadow / z-101 / translateX(100%) + visibility
hidden ↔ `.open` / .22s cubic-bezier(.4,0,.2,1) / reduced-motion no transition / column flex ·
head/body(scroll)/actions sections · `.integration-drawer-row` key 96px gray-600, value gray-800
min-width 0 (mono modifier). Zero static inline styles (SOP test); StatusDot rides its existing
variants.

## TDD steps (RED-first; suites under tests/features/dashboard/…)

1. **Backend seams**: rename `{id, name}` payload (skips showInputBox, same validation, error
   round-trip via `webviewClient.request`; no-payload pins untouched) + snapshot channel
   (`postComponentsSnapshot` after add terminal/deploy terminal/remove success/rename success;
   `sendAppBuilderComponentsSnapshot`; payload = fresh persisted map). Extend the handler suite;
   watch the dashboardHandlersMap count pin if a new registration lands.
2. **`integrationCardModel.ts`** (pure): full status matrices both producers; ≤1 faceAction
   pinned across every status; stale distinct; override-merge semantics PORTED from the list
   suite as pure tests; pending-card synthesis (unknown-id deploying override → card with
   catalog-name ?? id); canRename matrix; kindLabel/AI-caption derivation; mesh disabled
   propagation; primaryUrl (url ?? first deployedUrls).
3. **`Drawer.tsx`** + scrim/drawer CSS: closed=hidden/aria-hidden; open class; scrim/Esc/✕
   close; defaultPrevented Esc ignored; focus to ✕ on open, restored to opener on close;
   Tab wrap.
4. **`IntegrationCard.tsx`** + card/tile CSS: render pins; click/Enter/Space → onOpen; face
   action fires WITHOUT onOpen (stop-propagation pin); deploying → pulse + no affordance;
   Open link → openLiveSite; mesh class; ai caption modifier.
5. **`IntegrationDrawer.tsx`**: rows render only when data exists; bar per model (emphasis,
   disabled); every action → onAction; rename field only when canRename, commit posts
   request({id,name}), error stays inline; mesh negatives (no rename/manage-apis/remove; role
   tag; endpoint mono).
6. **`AddIntegrationModal.tsx`**: port the 4 picker tests verbatim + closes on post/cancel.
7. **`IntegrationsGrid.tsx` cutover**: port every non-picker list-suite scenario (mesh card
   FIRST; per-card override isolation; remove-confirm trio; shared ManageApis trio); snapshot
   lands/drops/refreshes cards (drawer live while open; closes when its card is removed); add
   tile last + empty state; header count + add button; mesh routes to callbacks never keyed
   messages. Rewire `IntegrationsBlock` (assert props frozen). DELETE the four superseded
   components + suites. Rewrite `ProjectDashboardScreen-integrations.test.tsx` against the grid.
8. **Gate + visual pass**: `gate` scoped to tests/features/dashboard + tsc + eslint (+ the
   inline-styles SOP test); Extension Dev Host: light/dark, drawer slide + Esc/scrim + focus
   return, modal-over-drawer stacking (Remove/ManageApis opened FROM the drawer), rename
   in place, add modal → card appears via snapshot, remove → card drops, deploying pulse,
   reduced-motion, mesh accent card; preview `stale` by hand-editing a manifest status.

## Reuse (don't re-derive)
`.projects-grid`/`.project-card-spectrum` CSS precedents · `ProjectCard.tsx` div-card keyboard
pattern · `StatusDot` variants · `InlineRenameField` + `useInlineRename` request contract ·
`ManageApisModal` DialogContainer hosting · `parseGitHubUrl` · `postRowStatus` dynamic-import
pattern · `listAppBuilderComponents` · `getAppBuilderComponentEntry` (webview-safe).

## YAGNI (explicitly cut)
Core-ui Drawer promotion (1 consumer) · wizard's staged add modal (cross-feature) · name field /
kind cards in the add modal · integration `stale` PRODUCER (backlog) · Destination row/banner
(workspace name not in init payload) · mesh Verify (no message exists) · mesh Open↗ card link
(GraphQL POST endpoint isn't browsable — endpoint mono in drawer; deliberate prototype deviation)
· toasts/preview-picker (prototype demo chrome) · optimistic remove (snapshot is truth) · full
react-aria FocusScope (transitive dep; minimal trap suffices) · deployed-URL-on-first-push
channel widening (pre-existing gap, unchanged).

## Risks
Spectrum modal (portal to body-end) over drawer stacking + double-Esc → defaultPrevented guard +
Step-8 manual check (fallback: close drawer before opening modals) · press-bubbling from face
buttons → containment span, test-pinned · snapshot/override race → same terminal values, override
precedence · pinned-suite churn masking regressions → scenarios ported test-by-test, cutover
isolated in Step 7 · custom-spectrum.css growth → contained section, decomposition is existing
backlog.

## Verification (end-to-end)
1. Scoped jest per step → full `gate` before commit.
2. Dev Host (worktree, `npm run watch:all`): grid renders (mesh accent card first, integration
   cards, add tile); card click → drawer slides in; every action routes correctly; add modal →
   new card appears WITHOUT reload; remove → card drops WITHOUT reload; rename inline in drawer
   (duplicate rejected inline); light + dark; reduced motion respected.
3. Regression: wizard untouched; extension-side rename (no payload) still shows input box.
