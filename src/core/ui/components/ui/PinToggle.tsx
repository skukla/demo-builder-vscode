/**
 * PinToggle — the pin on a card: one press pins or unpins it (owner, 2026-10-28).
 *
 * Pin was a row in the project card's menu, which had grown to twelve rows and no longer
 * fit a window. On the card it is one press, and which projects are pinned shows at a
 * glance. A pinned card shows its pin always; an unpinned card shows it while the card is
 * hovered or focused, keeping its space while hidden so nothing beside it moves. The
 * component's own rules live in shared-ui.css; which card reveals it on hover is that
 * card's feature's to say (project-cards.css for the Projects list).
 *
 * Without an `onToggle` it is the plain pin mark cards showed before, for a pinned item
 * only, so a card that cannot pin still says which items are pinned.
 *
 * @module core/ui/components/ui/PinToggle
 */

import { ActionButton } from '@adobe/react-spectrum';
import PinOn from '@spectrum-icons/workflow/PinOn';
import React, { useCallback } from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface PinToggleProps {
    pinned: boolean;
    /** What is pinned, for the button's name: "Pin project", "Unpin project". */
    subject: string;
    /** Pins or unpins. Absent: the plain mark, and nothing for an unpinned item. */
    onToggle?: () => void;
}

/**
 * The pin on a card.
 *
 * @param props - whether it is pinned, what it is, and the toggle
 * @returns the pin button, the plain mark, or nothing
 */
export function PinToggle({ pinned, subject, onToggle }: PinToggleProps): React.ReactElement | null {
    // Containment: a press must never reach the card behind it and open it.
    const contain = useCallback((event: React.SyntheticEvent): void => {
        event.stopPropagation();
    }, []);

    if (!onToggle) {
        return pinned ? (
            <span aria-label="Pinned" className="pin-indicator">
                <PinOn size="XS" />
            </span>
        ) : null;
    }
    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; the button inside takes the interaction
        <span
            onClick={contain}
            onKeyDown={contain}
            className={cn('pin-toggle', pinned ? 'pin-toggle--pinned' : 'pin-toggle--unpinned')}
        >
            <ActionButton
                isQuiet
                aria-label={`${pinned ? 'Unpin' : 'Pin'} ${subject}`}
                aria-pressed={pinned}
                onPress={onToggle}
            >
                <PinOn size="XS" />
            </ActionButton>
        </span>
    );
}
