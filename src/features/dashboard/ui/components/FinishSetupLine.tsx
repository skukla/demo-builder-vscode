/**
 * The project dashboard's plain Finish Setup line (PL-101): "2 steps remaining" with Finish Setup,
 * which opens the guide. Nothing when no step is left to do (all done or skipped).
 *
 * Reused, not rebuilt: it is the integration flyout's Demo Setup line (`SetupChecklistSection`),
 * its markup and its `integration-panel-setup` classes, which the dashboard bundle imports
 * (`integration-cards.css`). That component itself did not fit: it is a flyout section headed
 * "Demo Setup" over an integration's card model, naming the next step, where the owner's words
 * here are the count and Finish Setup alone. Its link stays a literal so the label-case scan
 * reads it.
 *
 * @module features/dashboard/ui/components/FinishSetupLine
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import { stepsRemainingText } from '@/core/ui/utils/stepsRemaining';
import type { FinishSetupStatus } from '@/types/webviewPayloads';

/**
 * @param props - the steps from status, and what Finish Setup opens
 * @returns the line, or null when no step is left to do
 */
export function FinishSetupLine({
    status,
    onOpen,
}: {
    status?: FinishSetupStatus;
    onOpen: () => void;
}): React.ReactElement | null {
    const text = stepsRemainingText(status?.remaining);
    if (!text) return null;
    return (
        <div className="integration-panel-setup dashboard-finish-setup">
            <span className="integration-panel-setup-line">
                <span>{text}</span>
                <Link isQuiet onPress={onOpen}>
                    Finish Setup
                </Link>
            </span>
        </div>
    );
}
