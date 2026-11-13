/**
 * A failed install of the demo's datapack, as integration cards show a failed deploy (step-04 S8;
 * decisions J6-1, J6-2): the shared `IntegrationStatusLabel` (the error dot and "Install failed",
 * from the status vocabulary's datapack table) on the card, and in the flyout the same label under
 * the title with the reason under it, the integration flyout's health line. The integration
 * flyout's own `HealthLine` stays with it: it carries an install aside and a link this one has not.
 *
 * Styled by `integration-cards.css`, which the Datapacks bundle's entry imports.
 *
 * @module features/data-installer/ui/components/FailedHealthLine
 */

import React from 'react';
import type { HeldFailure } from '../hooks/useProjectHolding';
import { IntegrationStatusLabel, type IntegrationStatusLabelProps } from '@/core/ui/components/integrations/IntegrationStatusLabel';
import { getDatapackStatusDisplay, severityToDot } from '@/core/ui/utils/statusVocabulary';

/** The label's model, from the vocabulary; a vocabulary without the entry fails at load. */
function failedModel(): IntegrationStatusLabelProps['model'] {
    const entry = getDatapackStatusDisplay('install-failed');
    if (!entry) throw new Error('The status vocabulary has no install-failed entry.');
    return { dotVariant: severityToDot(entry.severity), status: 'error', statusLabel: entry.label };
}

const FAILED_MODEL = failedModel();

/** The card's status line under the name: the dot and "Install failed". */
export function InstallFailedLine(): React.JSX.Element {
    return (
        <div className="integration-card-statusline">
            <IntegrationStatusLabel model={FAILED_MODEL} />
        </div>
    );
}

/** The flyout's health line on a failed install: the label, and the reason under it. */
export function FailedHealthLine({ reason }: { reason: string }): React.JSX.Element {
    return (
        <div className="integration-panel-health">
            <span className="integration-statusline">
                <IntegrationStatusLabel model={FAILED_MODEL} />
            </span>
            <span className="integration-panel-status-message">{reason}</span>
        </div>
    );
}

/**
 * The flyout's head: the title, then the close button. On a failed install, the integration
 * flyout's head, with the health line under the title. Each class list is written out, so the
 * stylesheet scan can read it.
 */
export function FailedHead({ failed, close, children }: { failed: HeldFailure | undefined; close: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
    if (!failed) {
        return (
            <div className="db-drawer-head">
                {children}
                {close}
            </div>
        );
    }
    return (
        <div className="db-drawer-head integration-panel-head">
            <div className="integration-panel-heading">
                {children}
                <FailedHealthLine reason={failed.reason} />
            </div>
            {close}
        </div>
    );
}
