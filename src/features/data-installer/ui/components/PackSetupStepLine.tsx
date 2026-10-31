/**
 * The pack's one Admin step (datapack-engine step 12), as the side panel shows it while the step is
 * open: one quiet line, "1 step left in the Admin", with Show step, which opens the step in the
 * setup guide's own shape (`PackSetupStepDialog`) (owner, 2026-10-30).
 *
 * It replaced an amber `InlineNotice` with the whole Where / Enter / Then / Why table and two
 * buttons under it, which the owner read as too noisy for a side panel. A done step shows nothing
 * here: the dialog already said it was done, and nothing is left to do (owner, 2026-10-31; the
 * green check-mark line it had was removed).
 *
 * @module features/data-installer/ui/components/PackSetupStepLine
 */

import { Button } from '@adobe/react-spectrum';
import React from 'react';

export interface PackSetupStepLineProps {
    /** Open the step's dialog. */
    onShow: () => void;
}

export function PackSetupStepLine({ onShow }: PackSetupStepLineProps): React.JSX.Element {
    return (
        <div className="datapack-setup-line" data-testid="pack-setup-step">
            <span>1 step left in the Admin</span>
            <Button variant="secondary" onPress={onShow}>
                Show step
            </Button>
        </div>
    );
}
