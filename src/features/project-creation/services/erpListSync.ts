/**
 * Tell the ERP integration which ERPs it serves (AB-16): `PUT erp/erps` with every deployed
 * ERP linked to it, built by `erpListFor`. Run after an ERP is added from the integration's
 * card, and before one is removed (without it), so the integration never routes a line to an
 * ERP that is gone.
 *
 * A composition file: it wires the integration's client and the signed-in identity into the
 * pure list.
 *
 * @module features/project-creation/services/erpListSync
 */

import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListFor } from '@/features/app-builder/services/erpList';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types/base';

export type ErpListSyncOutcome =
    | { status: 'registered'; ids: string[] }
    | { status: 'failed'; detail: string };

/**
 * Replace the integration's ERP list with the ERPs the project links to it. Never throws.
 *
 * @param project - the project
 * @param integrationId - the ERP integration
 * @param auth - the signed-in identity its actions take
 * @param leaving - an ERP being removed, left out of the list
 * @param fetchImpl - fetch, injectable for tests
 * @returns the ids now listed, or why the list was not replaced
 */
export async function syncErpList(
    project: Project,
    integrationId: string,
    auth: AppManagementAuth | undefined,
    leaving?: string,
    fetchImpl?: typeof fetch,
): Promise<ErpListSyncOutcome> {
    const integration = project.appBuilderComponents?.[integrationId];
    if (!integration) return { status: 'failed', detail: `"${integrationId}" is not in this project.` };
    if (!auth) return { status: 'failed', detail: 'Adobe sign-in required.' };
    const client = new ErpIntegrationClient(integration.deployedUrls, auth, fetchImpl);
    if (!client.keepsErpList()) {
        const name = integration.name ?? integrationId;
        return { status: 'failed', detail: `${name} serves one ERP only. Update it to serve several.` };
    }
    try {
        const entries = erpListFor(project, integrationId, getAppBuilderComponentCatalog(), await client.listErps(), leaving);
        await client.replaceErps(entries);
        return { status: 'registered', ids: entries.map((entry) => entry.id) };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Take one ERP out of the integration's list before it is removed (the runner's
 * `unlistSystem`). Answers why it could not, or undefined.
 *
 * @param project - the project
 * @param integrationId - the ERP integration
 * @param erpId - the ERP being removed, by its component id
 * @param auth - the signed-in identity
 * @returns the reason, when the list was not replaced
 */
export async function unlistErp(
    project: Project,
    integrationId: string,
    erpId: string,
    auth: AppManagementAuth | undefined,
): Promise<string | undefined> {
    const outcome = await syncErpList(project, integrationId, auth, erpId);
    return outcome.status === 'failed' ? outcome.detail : undefined;
}
