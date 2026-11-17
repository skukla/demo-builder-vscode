/**
 * The integration flyout's actions, visible as a list rather than behind a kebab (owner,
 * 2026-10-01: "the three dots menus are hard to see and easy to miss"), drawn by the shared
 * {@link FlyoutActionList}.
 *
 * The verbs are the card's own `menuActions`, named by the same {@link actionRowFor} the card's
 * menu uses, so the list and the menu cannot drift. Removal goes last, behind a divider, in the
 * danger colour.
 *
 * @module features/dashboard/ui/components/integrations/FlyoutActions
 */

import React from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { actionRowFor } from '@/core/ui/components/integrations/IntegrationActionsMenu';
import { FlyoutActionList } from '@/core/ui/components/ui/FlyoutActionList';

const DESTRUCTIVE: ReadonlySet<CardAction> = new Set(['remove', 'remove-anyway', 'delete-github-repo']);

export interface FlyoutActionsProps {
    model: IntegrationCardModel;
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
}

/**
 * The list, or nothing when the card offers no action (mid-deploy every one would race
 * the runner, so the model offers none).
 */
export function FlyoutActions({ model, onAction }: FlyoutActionsProps): React.ReactElement | null {
    const rows = model.menuActions.map((action) => ({
        key: action,
        ...actionRowFor(model, action),
        danger: DESTRUCTIVE.has(action),
    }));
    return <FlyoutActionList rows={rows} onAction={(key) => onAction(model, key as CardAction)} />;
}
