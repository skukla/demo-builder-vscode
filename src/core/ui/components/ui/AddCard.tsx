/**
 * AddCard — "add another" as a dashed card at the END of a card grid (PL-62).
 *
 * Owner decision, 2026-09-21: on every grid where an SC adds to a set, adding is
 * a card in the grid, not a button in the header. Extracted from the Welcome
 * step's "Add a demo package" card (BrandGallery), which was the first one.
 *
 * The HOST passes its own card-shape class (`cardClassName`) so the card has its
 * neighbours' size, border and padding; this component adds only what makes it
 * an invitation — the dashed border, the "+", the centring (`add-card.css`).
 * A bundle rendering it must import `@/core/ui/styles/add-card.css` (ADR-017 §6;
 * `tests/sop/stylesheet-bundles.test.ts` fails the build if it does not).
 *
 * Rules every host follows (PL-62's open questions, answered in its log):
 *   - it is not an item: leave it out of counts, and hide it while a filter
 *     narrows the grid (a card that cannot match a search reads as a result);
 *   - it is the grid's LAST cell, so it renders inside the grid element.
 *
 * @module core/ui/components/ui/AddCard
 */

import React from 'react';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { cn } from '@/core/ui/utils/classNames';

export interface AddCardProps {
    /** What adding does, as a person reads it: "Add an integration". */
    name: string;
    /** Optional second line; also part of the accessible name. */
    description?: string;
    /** Opens the host's add flow. */
    onOpen: () => void;
    /** The host grid's card class, so the card is shaped like its neighbours. */
    cardClassName?: string;
    /** Dim with the other cards (e.g. once one is selected). */
    isDimmed?: boolean;
    /** Optional test id passthrough. */
    testId?: string;
}

/** The dashed add card. */
export function AddCard({
    name,
    description,
    onOpen,
    cardClassName,
    isDimmed = false,
    testId,
}: AddCardProps): React.ReactElement {
    const handleKeyDown = useActivateOnKey(onOpen);
    return (
        <div
            role="button"
            tabIndex={0}
            data-testid={testId}
            onClick={onOpen}
            onKeyDown={handleKeyDown}
            className={cn('add-card', cardClassName, isDimmed && 'dimmed')}
            aria-label={description ? `${name}: ${description}` : name}
        >
            <span className="add-card-name">{name}</span>
            {description ? <span className="add-card-description">{description}</span> : null}
        </div>
    );
}
