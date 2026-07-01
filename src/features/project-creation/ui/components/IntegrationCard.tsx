/**
 * IntegrationCard — one deployable in the Integrations "Services" screen.
 *
 * A selection-aware, expandable card. Selection uses the Commerce choice-card language
 * (blue border + tint + a ✓ badge via `data-selected` / `.int-card-check`) rather than
 * an On/Off pill; the Add/Remove button is the control. When `selected`, the card
 * expands to host its config (`children`) — the destination sign-in + project/workspace.
 * An N/A card (no applicable deployable for the stack) shows a muted `naLabel` and no
 * action. Presentational only — the parent owns selection state + handlers.
 *
 * @module features/project-creation/ui/components/IntegrationCard
 */

import { Button } from '@adobe/react-spectrum';
import React from 'react';
import { SelectionCheck } from './SelectionCheck';

/** A deployable card's single action button (Add / Remove). */
export interface IntegrationCardAction {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'accent';
}

export interface IntegrationCardProps {
    /** Deployable name (e.g. "API Mesh"). */
    name: string;
    /** One-line description. */
    description: string;
    /** Whether this deployable is selected (drives the blue-check styling + expansion). */
    selected: boolean;
    /** When set, the deployable is N/A for the stack: shows this muted label, no action. */
    naLabel?: string;
    /** Optional action button (Add / Remove); omitted for an N/A card. */
    action?: IntegrationCardAction;
    /** Config revealed inline when the card is selected (e.g. the destination fields). */
    children?: React.ReactNode;
}

/**
 * A single deployable card (selection-aware + expandable).
 *
 * @param props - name, description, selection, optional N/A label / action / children
 * @returns the card element
 */
export function IntegrationCard({
    name,
    description,
    selected,
    naLabel,
    action,
    children,
}: IntegrationCardProps): React.ReactElement {
    const isNa = naLabel !== undefined;
    const showConfig = selected && !isNa && Boolean(children);
    return (
        <div className="int-card" data-selected={selected ? 'true' : undefined}>
            <div className="int-card-head">
                {selected && <SelectionCheck />}
                <div className="int-card-headings">
                    <div className="int-card-name">{name}</div>
                    <div className="int-card-desc">{description}</div>
                </div>
                <div className="int-card-actions">
                    {isNa ? (
                        <span className="int-card-na">{naLabel}</span>
                    ) : (
                        action && (
                            <Button variant={action.variant ?? 'secondary'} onPress={action.onPress}>
                                {action.label}
                            </Button>
                        )
                    )}
                </div>
            </div>
            {showConfig && <div className="int-card-config">{children}</div>}
        </div>
    );
}
