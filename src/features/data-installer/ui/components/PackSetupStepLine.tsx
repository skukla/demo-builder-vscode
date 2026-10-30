/**
 * The pack's one Admin step (datapack-engine step 12), as the side panel shows it: one quiet line
 * (owner, 2026-10-30). Open: "1 step left in the Admin" with Show step, which opens the step in
 * the setup guide's own shape (`PackSetupStepDialog`). Done: a green check mark and what the Check
 * found, with no box around it.
 *
 * It replaced an amber `InlineNotice` with the whole Where / Enter / Then / Why table and two
 * buttons under it, which the owner read as too noisy for a side panel. The house notice was
 * considered for the done line and not used: it draws a bordered box, and a finished step needs
 * none.
 *
 * @module features/data-installer/ui/components/PackSetupStepLine
 */

import { Button } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** A done step whose check left no sentence (none does today; a record could). */
const DONE_LINE = 'The Admin step is done.';

export interface PackSetupStepLineProps {
    item: SetupChecklistItem;
    /** Open the step's dialog. */
    onShow: () => void;
}

export function PackSetupStepLine({ item, onShow }: PackSetupStepLineProps): React.JSX.Element {
    if (item.state === 'done') {
        return (
            <p className="datapack-setup-line" data-testid="pack-setup-step">
                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                <span>{item.note ?? DONE_LINE}</span>
            </p>
        );
    }
    return (
        <div className="datapack-setup-line" data-testid="pack-setup-step">
            <span>1 step left in the Admin</span>
            <Button variant="secondary" onPress={onShow}>
                Show step
            </Button>
        </div>
    );
}
