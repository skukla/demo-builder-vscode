/**
 * Fill one project's ERP from Commerce (AB-26y): the one path both callers take, the add
 * (once the integration's Commerce install stands) and "Load demo data" (the tile and the
 * `load_erp_demo_data` tool). It finds the ERP the integration serves, the signed-in identity
 * both apps take, and the project's Commerce credential, then runs `fillErp`.
 *
 * A composition file: it wires the Commerce client, the integration's client and the ERP's
 * import into `fillErp`, which knows none of them.
 *
 * @module features/project-creation/services/erpFillForProject
 */

import { requestRest, resolveRestTargetFor, type RestTarget } from '@/features/ai/server/commerceRestClient';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { fillErp, type ErpFillDeps, type ErpFillResult } from '@/features/app-builder/services/erpFill';
import { CommerceReadError, type CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import { ErpIntegrationClient, callErpApi } from '@/features/app-builder/services/erpIntegrationClient';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';

export interface ErpFillForProjectDeps {
    authManager: AuthenticationService;
    /** The signed-in identity the integration's and the ERP's actions take. */
    getAuth: () => Promise<AppManagementAuth | undefined>;
    onProgress?: (step: string) => void;
    fetchImpl?: typeof fetch;
}

export type ErpFillOutcome =
    | { status: 'filled'; result: ErpFillResult; erpId: string }
    | { status: 'failed'; detail: string };

/** A GET over the project's signed Commerce client, answering the parsed body. */
function commerceGet(target: RestTarget, fetchImpl: typeof fetch): CommerceGet {
    return async (path) => {
        const answer = await requestRest('GET', target, path, undefined, fetchImpl);
        const route = path.split('?')[0];
        if ('failed' in answer) throw new CommerceReadError(`Commerce did not answer ${route}: ${answer.failed}`);
        if (!answer.ok) {
            throw new CommerceReadError(`Commerce answered ${answer.status} for ${route}: ${answer.text.slice(0, 200)}`, answer.status);
        }
        return answer.text ? (JSON.parse(answer.text) as unknown) : null;
    };
}

/** The ERP's import at its own deployed URLs; throws in the ERP's words when it refuses. */
function erpImport(erpUrls: Record<string, string> | undefined, auth: AppManagementAuth, fetchImpl: typeof fetch) {
    return async (body: unknown): Promise<void> => {
        const answer = await callErpApi(erpUrls, auth, 'POST', 'admin/import', body, fetchImpl);
        if ('refusal' in answer) throw new Error(answer.refusal);
        if (!answer.ok) throw new Error(`The ERP's import answered ${answer.status}: ${answer.detail}`);
    };
}

/**
 * Fill the ERP an integration serves in this project. Never throws: a missing ERP, sign-in or
 * credential, and a fill that stops, are a `failed` outcome with the reason.
 *
 * @param project - the project the integration is in
 * @param integrationId - the integration whose ERP is filled
 * @param deps - the auth service, the sign-in, progress
 * @returns what went in, or why nothing did
 */
export async function fillErpForProject(
    project: Project,
    integrationId: string,
    deps: ErpFillForProjectDeps,
): Promise<ErpFillOutcome> {
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    const integration = project.appBuilderComponents?.[integrationId];
    const erpId = systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog())[0];
    const erp = erpId ? project.appBuilderComponents?.[erpId] : undefined;
    if (!integration || !erpId || !erp) {
        return { status: 'failed', detail: `"${integrationId}" has no ERP in this project.` };
    }
    const auth = await deps.getAuth();
    if (!auth) return { status: 'failed', detail: 'Adobe sign-in required.' };
    const target = await resolveRestTargetFor(project, deps.authManager, undefined, fetchImpl);
    if ('refusal' in target) return { status: 'failed', detail: target.refusal.replace(/^Error: /u, '') };
    const integrationClient = new ErpIntegrationClient(integration.deployedUrls, auth, fetchImpl);
    const fillDeps: ErpFillDeps = {
        get: commerceGet(target, fetchImpl),
        settings: (codes) => integrationClient.resolvedSettings(codes),
        importRecords: erpImport(erp.deployedUrls, auth, fetchImpl),
        onProgress: deps.onProgress,
    };
    try {
        return { status: 'filled', result: await fillErp(fillDeps, project.name), erpId };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}
