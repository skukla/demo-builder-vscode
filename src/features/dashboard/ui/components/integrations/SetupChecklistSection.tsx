/**
 * The integration flyout's Demo setup section (AB-26x): how far the SC is through what
 * they prepare in Commerce Admin for this integration's demo, the next step by name, and
 * the way into the guide.
 *
 * A plain section of its own — the same heading treatment as Actions, no colour (owner,
 * 2026-10-01: "I can do math. I also don't think a colored call out is needed"). The steps
 * themselves — what, why, where, and the ways to mark them — are in `SetupGuideModal`,
 * one at a time (owner, 2026-09-27). The grid opens the guide, as it opens Settings.
 *
 * @module features/dashboard/ui/components/integrations/SetupChecklistSection
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { nextSetupStep, setupSummary } from '@/features/app-builder/services/setupChecklist';

export interface SetupChecklistSectionProps {
    model: IntegrationCardModel;
    /** Opens the setup guide for this integration (the grid's 'setup-guide' action). */
    onOpenGuide: () => void;
}

/**
 * The summary, the next step and the way into the guide, or nothing for an integration
 * without steps.
 *
 * @param props - the card model and the open-guide action
 * @returns the section, or null
 */
export function SetupChecklistSection({ model, onOpenGuide }: SetupChecklistSectionProps): React.ReactElement | null {
    const items = model.setupChecklist;
    if (!items || items.length === 0) return null;
    const next = nextSetupStep(items);
    return (
        <section className="integration-panel-section" aria-label="Demo setup">
            <div className="integration-panel-section-label">Demo setup</div>
            <div className="integration-panel-setup">
                <span className="integration-panel-setup-line">
                    <span>{setupSummary(items)}</span>
                    <span aria-hidden="true">·</span>
                    <Link isQuiet onPress={onOpenGuide}>
                        {next ? 'Open setup guide' : 'Review setup'}
                    </Link>
                </span>
                {next && (
                    <span className="integration-panel-setup-next">
                        Next: <strong>{next}</strong>
                    </span>
                )}
            </div>
        </section>
    );
}
