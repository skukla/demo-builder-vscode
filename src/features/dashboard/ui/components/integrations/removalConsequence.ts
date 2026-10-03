/**
 * What the Remove confirm says a removal reaches beyond the card itself. Split from
 * `IntegrationsGrid` to keep that file within its size limit.
 *
 * @module features/dashboard/ui/components/integrations/removalConsequence
 */

import type { IntegrationCardModel } from './integrationCardModel';

/**
 * What a removal cannot undo for an app installed in Commerce (AB-12): App Management keeps
 * its own record of an app the SC associated there, and nothing here can clear it.
 */
const APP_MANAGEMENT_REMOVAL_NOTE =
    'If you associated it in Commerce Admin under Apps > App Management, unassociate it there first. ' +
    'Removing it here does not clear that listing.';

/** The dialog's second line: what the remove reaches beyond the card, if anything. */
export function removalConsequence(target: IntegrationCardModel | undefined): string | undefined {
    if (target?.isMesh) {
        return 'Your storefront loses its API Mesh endpoint until you deploy a new mesh.';
    }
    // A linked pair goes together (decision 2), whichever card asked.
    const linked = target?.linked ? linkedRemovalConsequence(target) : undefined;
    const appManagement = target?.installation ? APP_MANAGEMENT_REMOVAL_NOTE : undefined;
    return [linked, appManagement].filter(Boolean).join(' ') || undefined;
}

/**
 * What removing a linked card also removes: the other card, and the system's
 * records, which removal deletes before the undeploy.
 */
function linkedRemovalConsequence(target: IntegrationCardModel): string {
    const names = (target.linked?.cards ?? []).map((card) => card.name).join(' and ');
    // An ERP added from the integration's card goes alone (AB-16).
    if (target.removesAlone)
        return `Its records will be deleted, and ${names} stops sending it orders.`;
    return target.isSystem
        ? `Its records will be deleted, and ${names} will be removed too.`
        : `${names} will be removed too, with its records.`;
}
