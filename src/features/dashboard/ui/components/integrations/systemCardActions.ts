/**
 * The ERP verbs that need more than a message: an ERP's screen and its fill go through
 * the integration that serves it (the extension holds the screen key and runs the fill),
 * naming this ERP since an integration can serve several (AB-16). On the INTEGRATION's
 * card, the fill covers every ERP and the reset is offered — the reset always covers
 * them all (AB-16n), so it is the integration's verb, not an ERP's (owner, 2026-10-01).
 * Everything else (redeploy, update, remove) is the ordinary keyed path.
 *
 * Split from `IntegrationsGrid.tsx` when the fill joined the reset (AB-26y).
 *
 * @module features/dashboard/ui/components/integrations/systemCardActions
 */

import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** What the grid does for the two verbs that need more than a message. */
export interface SystemCardHandlers {
    /** Ask before a reset: the INTEGRATION's id and the names of every ERP it resets. */
    confirmReset: (pending: { id: string; erpNames: string[] }) => void;
    /** Fill from Commerce: the integration's id, the name for the modal, and one ERP's id (or every ERP). */
    loadErpData: (id: string, erpName: string, erp?: string) => void;
}

/**
 * Route a system card's own verb.
 *
 * @param model - the system card
 * @param action - the verb pressed
 * @param handlers - the grid's confirm and fill
 * @returns whether the action was handled here
 */
export function handleSystemAction(
    model: IntegrationCardModel,
    action: CardAction,
    handlers: SystemCardHandlers,
): boolean {
    const integrationId = model.linked?.cards[0]?.id;
    if (action === 'open') {
        if (integrationId) webviewClient.postMessage('openErpScreen', { id: integrationId, erp: model.id });
        return true;
    }
    if (action === 'load-demo-data') {
        if (integrationId) handlers.loadErpData(integrationId, model.name, model.id);
        return true;
    }
    return false;
}

/**
 * The integration's ERP verbs: fill every ERP it serves, or reset them all (confirmed first).
 *
 * @returns whether the action was handled here
 */
export function handleIntegrationErpAction(
    model: IntegrationCardModel,
    action: CardAction,
    handlers: SystemCardHandlers,
): boolean {
    const erpNames = model.linked?.cards.map((card) => card.name) ?? [];
    if (action === 'load-demo-data') {
        handlers.loadErpData(model.id, erpNames.length === 1 ? erpNames[0] : 'the ERPs');
        return true;
    }
    if (action === 'reset-records') {
        handlers.confirmReset({ id: model.id, erpNames });
        return true;
    }
    return false;
}
