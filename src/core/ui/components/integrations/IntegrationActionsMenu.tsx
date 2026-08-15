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
    'sign-in': { label: 'Sign in', icon: 'admin' },
    // The deliberate ones.
    open: { label: 'Open', icon: 'globe' },
    redeploy: { label: 'Redeploy', icon: 'redeploy' },
    'manage-apis': { label: 'Manage APIs', icon: 'apiAccess' },
    remove: { label: 'Remove', icon: 'delete' },
};

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
                const row = MENU_ROWS[action];
                const label = row?.label ?? action;
                return (
                    <Item key={action} textValue={label}>
                        {renderMenuIcon(row?.icon)}
                        <Text>{label}</Text>
                    </Item>
                );
            })}
        </CardActionsMenu>
    );
}
