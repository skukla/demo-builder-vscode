/**
 * Each ERP's ownership rule, read through the integration (AB-72): the ERPs an integration
 * serves in a project, by list id and name, and the rule each holds as the integration
 * resolves it. Shared by the "Add another ERP" read (`erpOwnershipSync.ts`) and by every
 * fill (`erpFillForProject.ts`), which needs the OTHER ERPs' rules to decide what one ERP
 * owns. Its own file so neither of those imports the other.
 *
 * @module features/project-creation/services/erpRules
 */

import type { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { ownsRuleOf } from '@/features/app-builder/services/erpOwnership';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';
import type { ErpOwnsEntry } from '@/types/erpOwnership';

/** One ERP the integration serves, as the read names it. */
export interface ListedErpName {
    listId: string;
    name: string;
}

/** The ERPs an integration serves in the project, by list id and name, in link order. */
export function listedErpNames(project: Project, integrationId: string): ListedErpName[] {
    const catalog = getAppBuilderComponentCatalog();
    return systemsUsedBy(project, integrationId, catalog).flatMap((componentId) => {
        const listId = erpListIdOf(project, componentId, catalog);
        const name = project.appBuilderComponents?.[componentId]?.name ?? componentId;
        return listId ? [{ listId, name }] : [];
    });
}

/** The ERPs the integration serves other than one, by list id and name: what a fill reads the rules of. */
export function otherErpNames(project: Project, integrationId: string, listId: string): ListedErpName[] {
    return listedErpNames(project, integrationId).filter((erp) => erp.listId !== listId);
}

/**
 * Each ERP's rule, read off the settings the integration resolves for it.
 *
 * @param client - the integration's client
 * @param erps - the ERPs, by list id and name
 * @returns each ERP's rule with its name, in the order given
 */
export async function readErpRules(
    client: ErpIntegrationClient,
    erps: readonly ListedErpName[],
): Promise<Array<ErpOwnsEntry & { name: string }>> {
    const out: Array<ErpOwnsEntry & { name: string }> = [];
    // One at a time: a handful of ERPs, and the integration's action is not built for a burst.
    for (const erp of erps) {
        const settings = await client.resolvedSettings([], erp.listId);
        out.push({ erp: erp.listId, name: erp.name, owns: ownsRuleOf(settings.default) });
    }
    return out;
}
