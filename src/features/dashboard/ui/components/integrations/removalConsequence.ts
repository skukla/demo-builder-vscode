/**
 * What the Remove confirm says a removal reaches beyond the card itself. Split from
 * `IntegrationsGrid` to keep that file within its size limit.
 *
 * @module features/dashboard/ui/components/integrations/removalConsequence
 */

import type { IntegrationCardModel } from './integrationCardModel';
import { MESH_NEEDED_NOTE } from '@/features/components/services/demoPackageLoader';

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
        if (target.neededByDemo) return MESH_NEEDED_NOTE;
        return 'Your storefront loses its API Mesh endpoint until you deploy a new mesh.';
    }
    // A linked pair goes together (decision 2), whichever card asked.
    const linked = target?.linked ? linkedRemovalConsequence(target) : undefined;
    const appManagement = target?.installation ? APP_MANAGEMENT_REMOVAL_NOTE : undefined;
    const storeSetup = target?.linked ? storeSetupConsequence(target) : undefined;
    return [linked, storeSetup, appManagement].filter(Boolean).join(' ') || undefined;
}

/**
 * What removal undoes in Commerce first (erpSetupTeardown, 2026-10-19): the integration its
 * ERPs' tags, erp_owner on the sets Demo Builder added it to and the store preparation; an ERP
 * its own tags. Said before the click, as every removal consequence is.
 */
function storeSetupConsequence(target: IntegrationCardModel): string {
    if (target.isSystem) return "Its products' ERP tags are cleared in Commerce first.";
    return 'Its store setup is undone in Commerce first: the ERP tags on products, erp_owner on the attribute sets Demo Builder added it to, and what Prepare this store changed.';
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
