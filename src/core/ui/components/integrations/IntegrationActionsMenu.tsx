/**
 * IntegrationActions — how one integration's actions are presented: the
 * at-most-one face verb, and the overflow menu behind it.
 *
 * A thin composition over the shared vocabulary, NOT a new menu: the kebab shell
 * is `core/ui/components/ui/CardActionsMenu` and every glyph comes from
 * `menuIcons.renderMenuIcon`, so "open" and "delete" draw the same icon here as
 * on the project card. What lives here is only the integration's own label/icon
 * mapping.
 *
 * Extracted when the flyout's button BAR became a kebab (2026-08-03): the bar
 * was the same actions as the card's menu wearing a different control, and two
 * lists of the same thing drift. It moved here from the dashboard folder when
 * the wizard became a second consumer of {@link IntegrationCard} — the card
 * renders this menu, so the two travel together.
 *
 * Renders nothing when the model offers nothing — mid-deploy every item would
 * race the runner, so the model returns an empty list and this disappears rather
 * than presenting a menu of things you cannot do.
 *
 * @module core/ui/components/integrations/IntegrationActionsMenu
 */

import { Item, Text } from '@adobe/react-spectrum';
import React from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel.types';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

/**
 * Label + icon per menu action — EVERY action, since the kebab is the only
 * control a card has. Cards carry no face button (Spectrum: "Don't use quick
 * actions"), so a verb missing from this map renders as its raw id with no icon.
 *
 * Rename is deliberately absent: it is the name's own inline pencil, matching
 * ProjectCard.
 */
const MENU_ROWS: Partial<Record<CardAction, { label: string; icon: string }>> = {
    // The status verbs — what the card is asking for, listed first by the model.
    deploy: { label: 'Deploy', icon: 'play' },
    update: { label: 'Update', icon: 'redeploy' },
    retry: { label: 'Retry', icon: 'reset' },
    install: { label: 'Install into Commerce', icon: 'play' },
    reinstall: { label: 'Reinstall in Commerce', icon: 'reset' },
    'sign-in': { label: 'Sign in', icon: 'admin' },
    // The deliberate ones.
    open: { label: 'Open', icon: 'globe' },
    'open-admin': { label: 'Open Commerce Admin', icon: 'admin' },
    redeploy: { label: 'Redeploy', icon: 'redeploy' },
    settings: { label: 'Settings', icon: 'settings' },
    'manage-apis': { label: 'Manage APIs', icon: 'apiAccess' },
    // The ERP integration's: another ERP beside the one it has (AB-16).
    'add-erp': { label: 'Add another ERP', icon: 'add' },
    remove: { label: 'Remove', icon: 'delete' },
    'remove-anyway': { label: 'Remove anyway', icon: 'delete' },
    // A system card's own verbs.
    'load-demo-data': { label: 'Fill from Commerce', icon: 'loadData' },
    // Its simulated downtime (AB-59), in a modal.
    'simulate-downtime': { label: 'Simulate downtime', icon: 'downtime' },
    // Tag Commerce products for this ERP, and put the tags back (AB-74).
    'assign-products': { label: 'Assign products', icon: 'edit' },
    'undo-assignment': { label: 'Undo last assignment', icon: 'reset' },
    // The integration's alone: a reset covers every ERP it serves (owner, 2026-10-01).
    'reset-records': { label: 'Reset ERPs', icon: 'reset' },
    // A blank-starter app's own repository (AB-1c), and its undo.
    'save-to-github': { label: 'Save to GitHub', icon: 'export' },
    'delete-github-repo': { label: 'Delete its GitHub repository', icon: 'delete' },
};

/**
 * An action's label and icon on THIS card. The few that read differently per card say
 * which thing they act on: "Open" is a system's own screen or an integration's Developer
 * Console workspace, and an integration's fill covers every ERP it serves. Shared by the
 * card's menu and the flyout's action list, so the two can never name a verb differently.
 *
 * @param model - the card the action is on
 * @param action - the verb
 * @returns its label and icon name
 */
export function actionRowFor(
    model: IntegrationCardModel,
    action: CardAction,
): { label: string; icon?: string } {
    if (action === 'open') {
        return { label: model.isSystem ? `Open ${model.name}` : 'Open in Developer Console', icon: 'globe' };
    }
    if (action === 'load-demo-data' && !model.isSystem) {
        return { label: 'Fill ERPs from Commerce', icon: 'loadData' };
    }
    const row = MENU_ROWS[action];
    return { label: row?.label ?? action, ...(row?.icon ? { icon: row.icon } : {}) };
}

export interface IntegrationActionsMenuProps {
    model: IntegrationCardModel;
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
    /** Extra class for the trigger (the card hides its own until hover). */
    className?: string;
}

/**
 * The overflow menu for an integration card or its detail flyout.
 *
 * @param props - the card model, the action sink, and an optional trigger class
 * @returns the menu, or null when the model offers no actions
 */
export function IntegrationActionsMenu({
    model,
    onAction,
    className,
}: IntegrationActionsMenuProps): React.ReactElement | null {
    if (model.menuActions.length === 0) return null;
    return (
        <CardActionsMenu
            ariaLabel={`More actions for ${model.name}`}
            className={className}
            onAction={(key) => onAction(model, key as CardAction)}
        >
            {model.menuActions.map((action) => {
                const { label, icon } = actionRowFor(model, action);
                return (
                    <Item key={action} textValue={label}>
                        {renderMenuIcon(icon)}
                        <Text>{label}</Text>
                    </Item>
                );
            })}
        </CardActionsMenu>
    );
}
