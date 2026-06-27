/**
 * IntegrationCard — one deployable in the Integrations area's "Deployables" sub-step.
 *
 * A soft grid TILE matching the projects-home card grid (gray-50, 8px radius, subtle
 * border): name on top, a muted description in the middle, and a footer row with the
 * status pill + optional action. Tiles lay out in a responsive grid and pair with the
 * dashed "add an integration" tile (same dimensions) so a filled deployable and an
 * empty slot read as the same family. Presentational only — the parent owns status +
 * handlers.
 *
 * @module features/project-creation/ui/components/IntegrationCard
 */

import { Button } from '@adobe/react-spectrum';
import React from 'react';

/** A deployable card's status pill (tone drives the .int-pill-* color). */
export interface IntegrationCardStatus {
    label: string;
    tone: 'on' | 'off' | 'na';
}

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
    /** Status pill. */
    status: IntegrationCardStatus;
    /** Optional action button (omitted for an N/A card). */
    action?: IntegrationCardAction;
}

/**
 * A single deployable card.
 *
 * @param props - name, description, status pill, optional action
 * @returns the card element
 */
export function IntegrationCard({
    name,
    description,
    status,
    action,
}: IntegrationCardProps): React.ReactElement {
    return (
        <div className="int-card">
            <div className="int-card-name">{name}</div>
            <div className="int-card-desc">{description}</div>
            <div className="int-card-footer">
                <span className={`int-pill int-pill-${status.tone}`}>{status.label}</span>
                {action && (
                    <Button variant={action.variant ?? 'secondary'} onPress={action.onPress}>
                        {action.label}
                    </Button>
                )}
            </div>
        </div>
    );
}
