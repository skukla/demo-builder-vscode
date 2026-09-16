/**
 * The bound system's section of an integration's flyout (the ERP that comes
 * with the ERP integration; plan step 05, decision 6): its status, its screen
 * and its last deploy, under its own name. Its verbs — Open, Reset, Redeploy —
 * live in the flyout's one kebab, like every other verb.
 *
 * Split from `IntegrationDetailPanel` so the panel stays within its size limit
 * and the section can be read on its own.
 *
 * @module features/dashboard/ui/components/integrations/SystemSection
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { PanelRow } from './PanelRow';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';

export interface SystemSectionProps {
    model: IntegrationCardModel;
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
}

/**
 * Render the system's rows, or nothing for an integration that stands alone.
 *
 * @param props - the card model and the panel's action sink
 * @returns the section, or null
 */
export function SystemSection({ model, onAction }: SystemSectionProps): React.ReactElement | null {
    const system = model.system;
    if (!system) return null;
    return (
        <>
            <div className="integration-panel-group-label" data-testid="system-section">
                {system.name}
            </div>
            <PanelRow label="Status">
                <span className="integration-statusline">
                    <StatusDot variant={system.dotVariant} size={6} />
                    <span
                        className={cn(
                            'integration-card-status',
                            system.status === 'error' && 'integration-card-status--error',
                        )}
                    >
                        {system.statusLabel}
                    </span>
                </span>
                {system.message && (
                    <span className="integration-panel-status-message">{system.message}</span>
                )}
            </PanelRow>
            {system.url && (
                <PanelRow label="Screen">
                    {/* ONE child: Spectrum's Link without an href calls
                        React.Children.only, and `Open {name}` is two children — a
                        string and an expression. That threw at render and took the
                        whole integrations surface down to a blank panel
                        (2026-09-16); the suites never saw it because they mock
                        @adobe/react-spectrum. */}
                    <Link isQuiet onPress={() => onAction(model, 'open-system')}>
                        {`Open ${system.name}`}
                    </Link>
                </PanelRow>
            )}
            {system.lastDeployed && <PanelRow label="Last deploy">{system.lastDeployed}</PanelRow>}
        </>
    );
}
