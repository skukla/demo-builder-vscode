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
 * It sits beside its consumers rather than in `core/ui` because both of them —
 * {@link IntegrationCard} and {@link IntegrationDetailPanel} — are in this
 * folder. Extracted when the flyout's button BAR became a kebab (2026-08-03):
 * the bar was the same actions as the card's menu wearing a different control,
 * and two lists of the same thing drift.
 *
 * Renders nothing when the model offers nothing — mid-deploy every item would
 * race the runner, so the model returns an empty list and this disappears rather
 * than presenting a menu of things you cannot do.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationActions
 */

import { Button, Item, Text } from '@adobe/react-spectrum';
import React from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

/**
 * Label + icon per menu action.
 *
 * `redeploy` lives in the MENU, not on the card face: a deployed card is calm by
 * design — a visible face button means the card needs you — so redeploying a
 * healthy integration is a deliberate action, which is what a kebab is for.
 *
 * Rename is deliberately absent: it is the name's own inline pencil, matching
 * ProjectCard.
 */
const MENU_ROWS: Partial<Record<CardAction, { label: string; icon: string }>> = {
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

/** The attention verb's label, keyed by the face action's kind. */
const FACE_LABELS: Record<string, string> = {
    deploy: 'Deploy',
    update: 'Update',
    retry: 'Retry',
    'sign-in': 'Sign in',
};

/**
 * The at-most-one attention verb — Deploy / Update / Retry / Sign in.
 *
 * Shared by the card face and the detail flyout so the two never disagree on
 * which verb is urgent, or on what it is called.
 *
 * @param props - the card model and the action sink
 * @returns the button, or null when the card needs nothing
 */
export function IntegrationFaceButton({
    model,
    onAction,
}: Omit<IntegrationActionsMenuProps, 'className'>): React.ReactElement | null {
    const face = model.faceAction;
    if (!face) return null;
    return (
        <Button variant="accent" isDisabled={face.disabled} onPress={() => onAction(model, face.kind)}>
            {FACE_LABELS[face.kind]}
        </Button>
    );
}
