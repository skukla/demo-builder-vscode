/**
 * Offer the reinstall the moment an update ends in a refused upgrade.
 *
 * Watches the cards for one that has just started needing a reinstall — the
 * install pass behind an update recorded `needsReinstall` and the snapshot push
 * brought it here — and calls `onPrompt` for it once. Cards that already
 * needed one when the screen opened are not prompted: the SC did not just act
 * on them, and the card's menu still offers the reinstall.
 *
 * @module features/dashboard/ui/components/integrations/useReinstallPrompt
 */

import { useEffect, useRef } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';

function idsNeedingReinstall(cards: IntegrationCardModel[]): Set<string> {
    return new Set(cards.filter((card) => card.installation?.needsReinstall).map((card) => card.id));
}

/**
 * @param cards - the grid's current cards
 * @param onPrompt - called with a card that has just come to need a reinstall
 */
export function useReinstallPrompt(
    cards: IntegrationCardModel[],
    onPrompt: (card: IntegrationCardModel) => void,
): void {
    // Seeded from the first render, so a refusal that predates the screen stays quiet.
    const seen = useRef<Set<string> | null>(null);
    const prompt = useRef(onPrompt);
    prompt.current = onPrompt;

    useEffect(() => {
        const now = idsNeedingReinstall(cards);
        const before = seen.current;
        seen.current = now;
        if (!before) return;
        const fresh = cards.find((card) => now.has(card.id) && !before.has(card.id));
        if (fresh) {
            prompt.current(fresh);
        }
    }, [cards]);
}
