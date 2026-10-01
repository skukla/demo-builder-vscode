/**
 * The flyout's actions, visible as a list rather than behind a kebab (owner,
 * 2026-10-01: "the three dots menus are hard to see and easy to miss").
 *
 * Quiet rows — an icon and a plain label, the weight of the rest of the panel, never
 * an accent button. The verbs are the card's own `menuActions`, named by the same
 * {@link actionRowFor} the card's menu uses, so the list and the menu cannot drift.
 * Removal goes last, behind a divider, in the danger colour.
 *
 * @module features/dashboard/ui/components/integrations/FlyoutActions
 */

import React from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { actionRowFor } from '@/core/ui/components/integrations/IntegrationActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

const DESTRUCTIVE: ReadonlySet<CardAction> = new Set(['remove', 'remove-anyway']);

export interface FlyoutActionsProps {
    model: IntegrationCardModel;
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
}

/**
 * The list, or nothing when the card offers no action (mid-deploy every one would race
 * the runner, so the model offers none).
 */
export function FlyoutActions({ model, onAction }: FlyoutActionsProps): React.ReactElement | null {
    if (model.menuActions.length === 0) return null;
    const safe = model.menuActions.filter((action) => !DESTRUCTIVE.has(action));
    const destructive = model.menuActions.filter((action) => DESTRUCTIVE.has(action));
    return (
        <section className="integration-panel-section" aria-label="Actions">
            <div className="integration-panel-section-label">Actions</div>
            <ul className="integration-panel-actions">
                {safe.map((action) => (
                    <ActionRow key={action} model={model} action={action} onAction={onAction} />
                ))}
                {destructive.length > 0 && safe.length > 0 && (
                    <li className="integration-panel-actions-divider" aria-hidden="true" />
                )}
                {destructive.map((action) => (
                    <ActionRow key={action} model={model} action={action} onAction={onAction} danger />
                ))}
            </ul>
        </section>
    );
}

function ActionRow({
    model,
    action,
    onAction,
    danger = false,
}: FlyoutActionsProps & { action: CardAction; danger?: boolean }): React.ReactElement {
    const { label, icon } = actionRowFor(model, action);
    return (
        <li>
            <button
                type="button"
                className={danger ? 'integration-panel-action is-danger' : 'integration-panel-action'}
                onClick={() => onAction(model, action)}
            >
                <span className="integration-panel-action-icon" aria-hidden="true">
                    {renderMenuIcon(icon)}
                </span>
                {label}
            </button>
        </li>
    );
}
