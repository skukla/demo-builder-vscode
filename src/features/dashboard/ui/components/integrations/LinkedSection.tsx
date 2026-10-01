/**
 * The cards connected to this one, as the flyout's first row (linked cards plan, step
 * 3): an integration lists the systems it connects, a system names its integration —
 * both under one label, "Connected to" (owner, 2026-10-01), one name per line so a long
 * name never wraps into the next. Each name opens that card's own flyout, so the other
 * half's status, screen and verbs live in one place — on its card.
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
 * Render the "Connected to" row, or nothing for a card that stands alone.
 *
 * @param props - the card model and the grid's selection setter
 * @returns the row, or null
 */
export function LinkedSection({
    model,
    onOpenLinked,
}: LinkedSectionProps): React.ReactElement | null {
    const linked = model.linked;
    if (!linked?.cards.length) return null;
    return (
        <PanelRow label="Connected to">
            {linked.cards.map((card) => (
                <span
                    key={card.id}
                    className="integration-statusline integration-panel-linked"
                    data-testid="linked-card"
                >
                    <StatusDot variant={card.dotVariant} size={6} />
                    {/* ONE child: Spectrum's Link without an href calls
                        React.Children.only. A two-child label threw at render and
                        blanked the whole surface on 2026-09-16; the suites mock
                        @adobe/react-spectrum and never saw it. */}
                    {/* The dot already says "deployed"; the word is spelled out only
                        when the state is the news (owner, 2026-10-01). */}
                    <Link isQuiet onPress={() => onOpenLinked(card.id)}>
                        {card.status === 'deployed'
                            ? card.name
                            : `${card.name} · ${card.statusLabel}`}
                    </Link>
                </span>
            ))}
        </PanelRow>
    );
}
