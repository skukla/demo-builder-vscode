/**
 * FlowDestinationLine — the Add Integration flow's committed Adobe destination, as a line over the
 * stage with its own Change. Split out of `AddIntegrationFlowModal` when the create window (walk
 * F286) took that file past its size limit; the modal keeps the windows and the footer.
 *
 * @module features/project-creation/ui/components/integration-flow/FlowDestinationLine
 */

import React from 'react';
import type { FlowStageId } from './flowStages';
import { DestinationContext as SharedDestinationContext } from '@/core/ui/components/ui/DestinationContext';
import type { AdobeAuthSessionState } from '@/types/webview';

/** Stages that ARE the destination picker — the line would be redundant there. */
const DEST_PICKER_STAGES: ReadonlySet<string> = new Set([
    'dest-signin',
    'dest-project',
    'dest-workspace',
]);

/**
 * The committed destination as a persistent context LINE, not a stage.
 *
 * It replaced the `dest-summary` step, whose only job was confirming a destination
 * the user never chose (it appears only when one is already committed) — a whole
 * modal step for zero decisions. As a line the destination stays visible while the
 * user does the real work, and the flow loses a click on EVERY add.
 *
 * Gated on the STAGE rather than on `draft.changingDestination`: that flag never
 * resets once set, so gating on it would hide the line for the rest of the session
 * after one Change.
 *
 * @param props - wizard state (the committed destination) and the Change action
 * @returns the line, or null when there is no committed destination to show
 */
export function FlowDestinationLine({
    state,
    stage,
    onChange,
}: {
    state: AdobeAuthSessionState;
    stage: FlowStageId;
    onChange: () => void;
}): React.ReactElement | null {
    // The stage gate stays HERE, not in the shared component: hiding the line
    // while the user is on the picker stages is this modal's concern.
    if (DEST_PICKER_STAGES.has(stage)) return null;
    return (
        <SharedDestinationContext
            project={state.adobeProject?.title || state.adobeProject?.name || ''}
            onChange={onChange}
            className="dest-context--block"
        />
    );
}
