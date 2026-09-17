/**
 * The cards linked to this one, as a flyout row (linked cards plan, step 3):
 * an integration lists the systems it Uses, a system names the integration it is
 * Used by. Each name opens that card's own flyout, so the other half's status,
 * screen and verbs live in one place — on its card — rather than being printed
 * a second time here.
 *
 * Split from `IntegrationDetailPanel` so the panel stays within its size limit.
 *
 * @module features/dashboard/ui/components/integrations/LinkedSection
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { PanelRow } from './PanelRow';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';

export interface LinkedSectionProps {
    model: IntegrationCardModel;
    /** Select another card by id — the grid swaps the flyout to it. */
    onOpenLinked: (id: string) => void;
}

/**
 * Render the Uses / Used by row, or nothing for a card that stands alone.
 *
 * @param props - the card model and the grid's selection setter
 * @returns the row, or null
 */
export function LinkedSection({ model, onOpenLinked }: LinkedSectionProps): React.ReactElement | null {
    const linked = model.linked;
    if (!linked?.cards.length) return null;
    return (
        <PanelRow label={linked.label}>
            {linked.cards.map((card) => (
                <span key={card.id} className="integration-statusline" data-testid="linked-card">
                    <StatusDot variant={card.dotVariant} size={6} />
                    {/* ONE child: Spectrum's Link without an href calls
                        React.Children.only. A two-child label threw at render and
                        blanked the whole surface on 2026-09-16; the suites mock
                        @adobe/react-spectrum and never saw it. */}
                    <Link isQuiet onPress={() => onOpenLinked(card.id)}>
                        {`${card.name} · ${card.statusLabel}`}
                    </Link>
                </span>
            ))}
        </PanelRow>
    );
}
