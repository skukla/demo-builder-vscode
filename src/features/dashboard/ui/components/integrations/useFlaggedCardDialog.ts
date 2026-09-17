/**
 * A confirm that opens by itself the moment a card becomes flagged, and that
 * the card's menu can open too.
 *
 * Two flags use it: an update Commerce refused (`installation.needsReinstall`,
 * offering Reinstall) and a removal that stopped on an unfinished clean-up
 * (`removalStopped`, offering Remove anyway). In both, the extension records the
 * flag and the snapshot push brings it here; the dialog opens once for a card
 * that has just gained it. Cards already flagged when the screen opened stay
 * quiet: the SC did not just act on them, and the card's menu still offers it.
 *
 * @module features/dashboard/ui/components/integrations/useFlaggedCardDialog
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';

export interface FlaggedCardDialog {
    /** The card awaiting confirmation, or null while closed. */
    pending: IntegrationCardModel | null;
    open: (card: IntegrationCardModel) => void;
    close: () => void;
}

/**
 * @param cards - the grid's current cards
 * @param isFlagged - whether a card carries the flag; must be a stable reference
 * @returns the dialog's state and its two controls
 */
export function useFlaggedCardDialog(
    cards: IntegrationCardModel[],
    isFlagged: (card: IntegrationCardModel) => boolean,
): FlaggedCardDialog {
    const [pending, setPending] = useState<IntegrationCardModel | null>(null);
    // Seeded from the first render, so a flag that predates the screen stays quiet.
    const seen = useRef<Set<string> | null>(null);

    useEffect(() => {
        const now = new Set(cards.filter(isFlagged).map((card) => card.id));
        const before = seen.current;
        seen.current = now;
        if (!before) return;
        const fresh = cards.find((card) => now.has(card.id) && !before.has(card.id));
        if (fresh) {
            setPending(fresh);
        }
    }, [cards, isFlagged]);

    const open = useCallback((card: IntegrationCardModel): void => setPending(card), []);
    const close = useCallback((): void => setPending(null), []);
    return { pending, open, close };
}
