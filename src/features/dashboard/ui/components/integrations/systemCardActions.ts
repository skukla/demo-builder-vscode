/**
 * A system card's verbs that differ from an integration's: its screen, its fill from
 * Commerce and its reset all go through the integration that uses it — the extension
 * holds the screen key and runs the fill and the reset. The screen and the fill name
 * this ERP, since an integration can serve several (AB-16); the reset covers them all. Everything else (redeploy,
 * update, remove) is the ordinary keyed path with the system's own id.
 *
 * Split from `IntegrationsGrid.tsx` when the fill joined the reset (AB-26y).
 *
 * @module features/dashboard/ui/components/integrations/systemCardActions
 */

import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** What the grid does for the two verbs that need more than a message. */
export interface SystemCardHandlers {
    /** Ask before a reset: the INTEGRATION's id and the ERP's name, for the dialog. */
    confirmReset: (pending: { id: string; erpName: string }) => void;
    /** Fill this ERP now: the integration's id, the ERP's name for the modal, and the ERP's id. */
    loadErpData: (id: string, erpName: string, erp: string) => void;
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
    if (action === 'reset-records') {
        if (integrationId) handlers.confirmReset({ id: integrationId, erpName: model.name });
        return true;
    }
    return false;
}
