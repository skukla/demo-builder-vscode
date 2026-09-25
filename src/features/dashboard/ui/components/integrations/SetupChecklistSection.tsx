/**
 * The integration flyout's demo setup checklist (AB-26x): what the SC prepares in Commerce
 * Admin for this integration's demo, where, why, and whether it is done.
 *
 * Each step can be marked done or dismissed, and opened again; a step Demo Builder can
 * check itself is ticked by "Check now". "Open Commerce Admin" is the grid's existing
 * open-admin request. Built from the flyout's own rows (`PanelRow`) and Spectrum links, so
 * it reads like the rest of the panel rather than a second design inside it.
 *
 * Split from `IntegrationDetailPanel` so the panel stays within its size limit.
 *
 * @module features/dashboard/ui/components/integrations/SetupChecklistSection
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { PanelRow } from './PanelRow';
import { useSetupChecklist } from './useSetupChecklist';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { setupSummary } from '@/features/app-builder/services/setupChecklist';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface SetupChecklistSectionProps {
    model: IntegrationCardModel;
    /** Opens Commerce Admin (the grid's 'openAdminPanel' request). */
    onOpenAdmin: () => void;
}

const DOT = { open: 'warning', done: 'success', dismissed: 'neutral' } as const;
const WORD = { open: 'To do', done: 'Done', dismissed: 'Dismissed' } as const;

function StepRow({
    item,
    busy,
    onSet,
}: {
    item: SetupChecklistItem;
    busy: boolean;
    onSet: (state: 'done' | 'dismissed' | 'open') => void;
}): React.ReactElement {
    return (
        <div className="integration-setup-step" data-testid="setup-step">
            <span className="integration-statusline">
                <StatusDot variant={DOT[item.state]} size={6} />
                <strong>{item.title}</strong>
                <span className="integration-panel-row-prefix">{WORD[item.state]}</span>
            </span>
            <span>{item.why}</span>
            <span className="integration-panel-row-prefix">{item.where}</span>
            {item.note && <span>{item.note}</span>}
            <span className="integration-statusline">
                {item.state === 'open' ? (
                    <>
                        <Link isQuiet onPress={() => !busy && onSet('done')}>Mark as done</Link>
                        <Link isQuiet onPress={() => !busy && onSet('dismissed')}>Dismiss</Link>
                    </>
                ) : (
                    <Link isQuiet onPress={() => !busy && onSet('open')}>Reopen</Link>
                )}
            </span>
        </div>
    );
}

/**
 * Render the checklist rows, or nothing for an integration that declares no steps.
 *
 * @param props - the card model and the open-admin action
 * @returns the section, or null
 */
export function SetupChecklistSection({ model, onOpenAdmin }: SetupChecklistSectionProps): React.ReactElement | null {
    const actions = useSetupChecklist(model.id);
    const items = model.setupChecklist;
    if (!items || items.length === 0) return null;
    return (
        <PanelRow label="Demo setup">
            <span className="integration-statusline">
                <span>{setupSummary(items)}</span>
                <Link isQuiet onPress={onOpenAdmin}>Open Commerce Admin</Link>
                {items.some((item) => item.checkable && item.state !== 'dismissed') && (
                    <Link isQuiet onPress={() => !actions.busy && actions.check()}>
                        {actions.busy ? 'Checking' : 'Check now'}
                    </Link>
                )}
            </span>
            {items.map((item) => (
                <StepRow key={item.id} item={item} busy={actions.busy} onSet={(state) => actions.setStep(item.id, state)} />
            ))}
            {actions.error && <span role="alert">{actions.error}</span>}
        </PanelRow>
    );
}
