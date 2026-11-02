/**
 * What the Remove confirm says a removal reaches beyond the card itself: each part a short sentence
 * of its own (owner, 2026-11-02). Split from `IntegrationsGrid` to keep that file within its size
 * limit.
 *
 * @module features/dashboard/ui/components/integrations/removalConsequence
 */

import type { IntegrationCardModel } from './integrationCardModel';
import { andList } from '@/core/utils/andList';

/**
 * What a removal cannot undo for an app installed in Commerce (AB-12): App Management keeps
 * its own record of an app the SC associated there, and nothing here can clear it.
 */
const APP_MANAGEMENT_REMOVAL_SENTENCE =
    'It does not clear a listing under Apps > App Management in Commerce Admin. If you associated it there, unassociate it first.';

/** What the remove reaches beyond the card, if anything, as sentences. */
export function removalConsequence(target: IntegrationCardModel | undefined): string | undefined {
    if (target?.isMesh) {
        // The extension's own warning says the same after the removal (`MESH_NEEDED_NOTE`).
        if (target.neededByDemo) return "This demo needs the API Mesh, and without it the storefront won't work.";
        return 'Your storefront loses its API Mesh endpoint until you deploy a new mesh.';
    }
    // A linked pair goes together (decision 2), whichever card asked.
    const linked = target?.linked ? linkedRemovalConsequence(target) : undefined;
    const appManagement = target?.installation ? APP_MANAGEMENT_REMOVAL_SENTENCE : undefined;
    const storeSetup = target?.linked ? storeSetupConsequence(target) : undefined;
    return [linked, storeSetup, appManagement].filter(Boolean).join(' ') || undefined;
}

/**
 * What removal undoes in Commerce first (erpSetupTeardown, 2026-10-19): the integration its
 * ERPs' tags, erp_owner on the sets Demo Builder added it to and the store preparation; an ERP
 * its own tags. Said before the click, as every removal consequence is.
 */
function storeSetupConsequence(target: IntegrationCardModel): string {
    if (target.isSystem) return "It first clears its products' ERP tags in Commerce.";
    return 'It first undoes its store setup in Commerce: the ERP tags on products, erp_owner on the attribute sets Demo Builder added it to, and what the demo setup applied.';
}

/**
 * What removing a linked card also removes: the other card, and the system's
 * records, which removal deletes before the undeploy.
 */
function linkedRemovalConsequence(target: IntegrationCardModel): string {
    const names = andList((target.linked?.cards ?? []).map((card) => card.name));
    // An ERP added from the integration's card goes alone (AB-16).
    if (target.removesAlone) return `It also deletes its records, and ${names} stops sending it orders.`;
    return target.isSystem
        ? `It also deletes its records and removes ${names}.`
        : `It also removes ${names}, with its records.`;
}
