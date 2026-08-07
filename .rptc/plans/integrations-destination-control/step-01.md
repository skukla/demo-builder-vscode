# Step 01 — Page-level destination control on the Integrations surface

## PARTIALLY SHIPPED 2026-08-03 — the DISPLAY half is done

The destination now appears in the Integrations action band
(`IntegrationsScreen.tsx`, `.integrations-destination*`). Acceptance 1's first
clause — "Integrations page shows the destination" — is met.

What remains is the CONTROL half. **The blocking question is ANSWERED
(2026-08-07): a change MOVES every integration to the new destination** —
delete-and-recreate. See the overview's overturned decision 5.

Two things must be built, not one. A live check that day found the destination
choice never leaves the webview at all: `updateState` writes to local React
state, the add payload carries no destination, and the deploy reads the persisted
`project.adobe`, which nothing writes. So "Change" needs PERSISTENCE first, then
MIGRATION on top. The acceptance below predates both findings.

Two decisions from the display pass that constrain the rest:

- **No shared `DestinationContext` component was extracted.** The band renders a
  plain keyed line; the modal keeps its own. One consumer each with different
  affordances (the modal's carries `Change` and a bottom border), so Rule of
  Three says wait. Extract when `Change` ships and there are two real consumers
  to shape the interface — the extraction row in the file table below still
  stands, just not yet.
- **The flyout's Destination row was KEPT** (acceptance 4 is unaffected — it
  bans a per-card *control*, not the display). If it later reads as redundant
  against the band, `IntegrationDetailPanel.test.tsx` now pins it, so removing it
  is a deliberate act rather than a silent regression.

The `.intflow-dest-context*` → `.dest-context*` rename has NOT happened; it
belongs with the extraction.

The original plan follows.

## Goal

From the Integrations page, see the current Adobe project/workspace and change it, without
starting an Add Integration flow.

## Files

| File | Change |
|---|---|
| `src/core/ui/components/ui/DestinationContext.tsx` *(new)* | Extract from `AddIntegrationFlowModal`'s local `DestinationContext`: renders `{project} · {workspace}` + a `Change` button. Props: `project`, `workspace`, `onChange`. Returns `null` when either is missing. |
| `src/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal.tsx` | Delete the local `DestinationContext`; import the shared one. Keep the `DEST_PICKER_STAGES` gate here — hiding the line on the picker stages is the MODAL's concern, not the component's. |
| `src/core/ui/components/layout/PageHeader.tsx` | Widen `subtitle?: string` → `React.ReactNode`. One line, strictly backward compatible (all 6 string consumers stay valid); `{subtitle}` already renders inside a Spectrum `<Text>`, which takes nodes. |
| `src/features/dashboard/ui/integrationsSurface/IntegrationsScreen.tsx` | ~~Render in the action band~~ — **CORRECTED 2026-08-07.** The display half shipped in the page HEADER crumb (`formatHeaderSubtitle`), not the band, and its docblock says that was deliberate: the destination is a property of the PROJECT while the band is about acting on the list. So the control joins it in the header; putting `Change` in the band would split display from control. `onChange` opens the flow adapter in destination mode. |
| `src/features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter.tsx` | Accept a `mode` prop (`'add' | 'destination'`, default `'add'`) instead of the hardcoded `mode="add"` on line ~182. |
| `src/core/ui/styles/custom-spectrum.css` | Rename `.intflow-dest-context*` to a neutral `.dest-context*` (it is no longer intflow-only). Page placement may need a horizontal variant — the modal's is a full-width line with a bottom border; the action band wants inline, no border. |

## Do NOT

- Add a `change-destination` bar action to `integrationCardModel.ts`. Tried and reverted —
  see the overview. The destination is project-scoped; a per-card control misrepresents it.
- Make the flyout's `Destination` row interactive.
- Introduce an org picker of any kind (`adobe-org-context`: sign-in owns org selection).

## Tests

- `tests/features/dashboard/ui/integrationsSurface/IntegrationsScreen.test.tsx` — the band
  shows `{project} · {workspace}`; `Change` opens the adapter with `mode="destination"`;
  nothing renders when the project has no committed destination.
- `tests/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal.later-and-variants.test.tsx`
  — existing `Change on the destination CONTEXT LINE re-enters dest-project` must still pass
  after the extraction (it is the regression net for the modal side).
- A new shared-component suite for `DestinationContext` (renders, omits when incomplete,
  fires `onChange`).

## Watch out for

- **The webview handler-coverage guard** (`tests/core/communication/webviewHandlerCoverage.test.ts`)
  will fail if the destination flow reaches a message the integrations panel does not
  register. That is the guard working — register the handler, do not weaken the test. It
  already caught `switchOrg` this way.
- `mode="destination"` renders `destinationStages(slice)`, which starts at `dest-signin` when
  signed out. Confirm the integrations panel answers `check-auth` / `authenticate` (it does
  as of `47254ac9`).
- The modal is `fitContent`; a stage set this short should collapse to it. If the dialog
  looks oversized, check the container's `type` FIRST (`spectrum-webview-ui` — a
  `type="fullscreen"` DialogContainer outranks every size and CSS override).

## Acceptance

1. Integrations page shows the destination; `Change` opens the project/workspace stages only.
2. Completing the change PERSISTS to `project.adobe` and updates the page line and every
   flyout's Destination row (today it persists nowhere — see the note above).
3. Completing the change MOVES every existing integration, the mesh included, to the new
   destination: undeploy from the old target, redeploy to the new one via the keyed runner,
   re-subscribing APIs against the new workspace (the subscribe PUT is a full union — a
   missed re-subscribe silently strips them). Per-component outcomes recorded through
   `recordDeployOutcome`; a half-moved project must not read as finished.
4. Cancelling changes nothing.
5. Flyout has no destination control.
6. `gate` green.
