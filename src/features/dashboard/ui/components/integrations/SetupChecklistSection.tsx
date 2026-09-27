/**
 * The integration flyout's demo setup line (AB-26x): how far the SC is through what they
 * prepare in Commerce Admin for this integration's demo, and the way into the guide.
 *
 * Only the summary lives here. The steps themselves — what, why, where, and the ways to
 * mark them — are in `SetupGuideModal`, one at a time (owner, 2026-09-27: the full list in
 * the flyout read badly). The grid opens the guide, as it opens Settings. Built from the
 * flyout's own row (`PanelRow`) so it reads like the rest of the panel.
 *
 * @module features/dashboard/ui/components/integrations/SetupChecklistSection
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { PanelRow } from './PanelRow';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { setupSummary } from '@/features/app-builder/services/setupChecklist';

export interface SetupChecklistSectionProps {
    model: IntegrationCardModel;
    /** Opens the setup guide for this integration (the grid's 'setup-guide' action). */
    onOpenGuide: () => void;
}

/**
 * The summary and the way into the guide, or nothing for an integration without steps.
 *
 * @param props - the card model and the open-guide action
 * @returns the row, or null
 */
export function SetupChecklistSection({ model, onOpenGuide }: SetupChecklistSectionProps): React.ReactElement | null {
    const items = model.setupChecklist;
    if (!items || items.length === 0) return null;
    const open = items.some((item) => item.state === 'open');
    return (
        <PanelRow label="Demo setup">
            <span className="integration-statusline">
                <StatusDot variant={open ? 'warning' : 'success'} size={6} />
                <span>{setupSummary(items)}</span>
                <Link isQuiet onPress={onOpenGuide}>
                    {open ? 'Open setup guide' : 'Review setup'}
                </Link>
            </span>
        </PanelRow>
    );
}
