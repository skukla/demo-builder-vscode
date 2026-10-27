/**
 * The Integrations screen's hold on the setup guide (AB-26x): which card's guide is open and
 * on which step, the trip out of it for a step's confirm and progress and back (AB-81), and
 * the progress modal's way into it after another operation. Split out of
 * `SetupGuideModal.tsx` (2026-10-26). A hook: in the webviews the hooks are the service
 * layer (ADR-017).
 *
 * @module features/dashboard/ui/components/integrations/useSetupGuide
 */

import { useCallback, useRef, useState } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import type { SetupGuideModalProps } from './SetupGuideModal';
import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** Which card's guide is open, for the grid: a way to open one, and the modal's props. */
export interface SetupGuideControls {
    open: (cardId: string, stepId?: string) => void;
    modal: SetupGuideModalProps;
    /**
     * The trip out of the guide and back (owner, 2026-10-26): a step's run that stops on a
     * question closes the guide for the progress window, which asks it, and the SC lands back
     * on that step when they close it, rather than being offered "Open demo setup" for the
     * guide they left.
     */
    away: {
        /** Remember the step the SC left the guide from. */
        leave: (cardId: string, stepId: string) => void;
        /** Reopen the guide on that step, if the SC left one; else nothing. */
        comeBack: () => void;
        /** Whether the SC is away from the guide and will come back to it. */
        pending: boolean;
    };
}

interface GuideAt {
    cardId: string;
    stepId?: string;
}

/**
 * The grid's hold on the guide. The card is looked up from `cards` on every render, so the
 * open guide redraws when the extension pushes the saved steps back.
 *
 * @param cards - the grid's current cards
 * @returns the opener, the modal's props, and the trip away and back
 */
export function useSetupGuide(cards: IntegrationCardModel[]): SetupGuideControls {
    const [at, setAt] = useState<GuideAt | null>(null);
    // Held in a ref as well, so `comeBack` keeps one identity: the progress modal's close
    // feeds its auto-close timer, and a new function each time would restart it.
    const [left, setLeft] = useState<GuideAt | null>(null);
    const leftRef = useRef<GuideAt | null>(null);
    const open = useCallback((cardId: string, stepId?: string) => setAt({ cardId, stepId }), []);
    const close = useCallback(() => setAt(null), []);
    const openAdmin = useCallback(() => webviewClient.postMessage('openAdminPanel', {}), []);
    const leave = useCallback((cardId: string, stepId: string) => {
        leftRef.current = { cardId, stepId };
        setLeft(leftRef.current);
    }, []);
    const comeBack = useCallback(() => {
        if (!leftRef.current) return;
        setAt(leftRef.current);
        leftRef.current = null;
        setLeft(null);
    }, []);
    return {
        open,
        modal: {
            model: cards.find((card) => card.id === at?.cardId) ?? null,
            onClose: close,
            onOpenAdmin: openAdmin,
            ...(at?.stepId ? { startAt: at.stepId } : {}),
        },
        away: { leave, comeBack, pending: left !== null },
    };
}

/**
 * What the progress modal offers when an operation on a card with setup still open succeeds:
 * a way straight into the guide (AB-26x). Undefined otherwise.
 *
 * @param cards - the screen's cards
 * @param operationId - the operation the progress modal shows (a component id), if any
 * @param openGuide - opens a card's guide
 */
export function setupNextStep(
    cards: IntegrationCardModel[],
    operationId: string | undefined,
    openGuide: (cardId: string) => void,
): { action: string; onPress: () => void } | undefined {
    if (!operationId) return undefined;
    const card = cards.find((candidate) => (candidate.componentId ?? candidate.id) === operationId);
    const open = (card?.setupChecklist ?? []).filter(isLeftToDo).length;
    if (!card || open === 0) return undefined;
    // The button alone: a "Next: 1 setup step …" sentence above it said the same thing and
    // made the result busy (owner, 2026-10-26).
    return {
        action: 'Open demo setup',
        onPress: () => openGuide(card.id),
    };
}
