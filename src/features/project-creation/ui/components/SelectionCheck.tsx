/**
 * SelectionCheck — the ONE selection checkmark used across every "pick this" card in the
 * wizard (Demo Setup package cards, Commerce backend cards, Storefront block-library
 * cards, Integrations service cards). A single blue ✓ so selection reads identically
 * everywhere, instead of the former mix (green CheckmarkCircle / bare blue check / filled
 * blue badge).
 *
 * `corner` pins it to the card's top-right (for whole-card selects); omit it to render
 * inline (e.g. the Integrations card, whose top-right holds the Add/Remove button).
 *
 * @module features/project-creation/ui/components/SelectionCheck
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface SelectionCheckProps {
    /** Pin to the card's top-right corner (the card must be position:relative). */
    corner?: boolean;
    /** Optional test id passthrough. */
    testId?: string;
}

/**
 * The shared selection checkmark.
 *
 * @param props - `corner` placement + optional `testId`
 * @returns the check element
 */
export const SelectionCheck: React.FC<SelectionCheckProps> = ({ corner = false, testId }) => (
    <span
        className={cn('selection-check', corner && 'selection-check-corner')}
        aria-hidden="true"
        data-testid={testId}
    >
        <svg viewBox="0 0 12 12" width="14" height="14" focusable="false">
            <path
                d="M2 6.2 4.6 9 10 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    </span>
);
