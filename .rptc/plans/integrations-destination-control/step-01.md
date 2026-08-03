# Step 01 — Page-level destination control on the Integrations surface

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
