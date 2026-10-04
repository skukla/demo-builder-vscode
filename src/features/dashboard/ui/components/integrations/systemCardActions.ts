/**
 * The ERP verbs that need more than a message: an ERP's screen and its fill go through
 * the integration that serves it (the extension holds the screen key and runs the fill),
 * naming this ERP since an integration can serve several (AB-16); so does its simulated
 * downtime, which opens a modal (AB-59). On the INTEGRATION's
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
import type { ErpDemoControlTarget } from '@/features/dashboard/ui/hooks/useErpDemoControls';

/** What the grid does for the two verbs that need more than a message. */
export interface SystemCardHandlers {
    /** Ask before a reset: the INTEGRATION's id and the names of every ERP it resets. */
    confirmReset: (pending: { id: string; erpNames: string[] }) => void;
    /** Fill from Commerce: the integration's id, the name for the modal, and one ERP's id (or every ERP). */
    loadErpData: (id: string, erpName: string, erp?: string) => void;
    /** Open an ERP's simulated-downtime modal (AB-59). */
    openDowntime: (target: ErpDemoControlTarget) => void;
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
    if (action === 'simulate-downtime') {
        if (integrationId) {
            handlers.openDowntime({ id: integrationId, erp: model.id, name: model.name });
        }
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

/** The card verbs whose whole job happens in the extension's own dialogs (AB-1c). */
const REPOSITORY_MESSAGES: Partial<Record<CardAction, string>> = {
    'save-to-github': 'promoteAppBuilderComponent',
    'delete-github-repo': 'unpromoteAppBuilderComponent',
};

/**
 * Saving a blank-starter app to its own GitHub repository, and the undo: the
 * extension asks where, confirms, and runs it; the component snapshot push then
 * refreshes the card.
 *
 * @returns whether the action was handled here
 */
export function handleRepositoryAction(model: IntegrationCardModel, action: CardAction): boolean {
    const message = REPOSITORY_MESSAGES[action];
    if (!message) return false;
    webviewClient.postMessage(message, { id: model.componentId ?? model.id });
    return true;
}
