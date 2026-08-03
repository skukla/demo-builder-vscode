# Step 01 — Page-level destination control on the Integrations surface

## PARTIALLY SHIPPED 2026-08-03 — the DISPLAY half is done

The destination now appears in the Integrations action band
(`IntegrationsScreen.tsx`, `.integrations-destination*`). Acceptance 1's first
clause — "Integrations page shows the destination" — is met.

What remains is the CONTROL half, and it is still blocked on the same open
question: after a change, already-deployed integrations keep pointing at the old
workspace, and nobody has decided whether that is a copy or a stale-state
problem. Answer that before building `Change`.

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
| `src/features/dashboard/ui/integrationsSurface/IntegrationsScreen.tsx` | Render `DestinationContext` in the action band (beside the `N integrations` count). `onChange` opens the flow adapter in destination mode. |
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
2. Completing the change updates the page line and every flyout's Destination row.
3. Cancelling changes nothing.
4. Flyout has no destination control.
5. `gate` green.
