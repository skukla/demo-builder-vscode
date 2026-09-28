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
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import { listIdOf } from '@/features/app-builder/services/deployInputs';
import { ErpIntegrationClient, callErpApi } from '@/features/app-builder/services/erpIntegrationClient';
import { mergeKeyMap } from '@/features/app-builder/services/erpList';
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
    /** `erpId`: the filled ERP's component id. */
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

/** The id the integration gives its single ERP, for an ERP entry that declares no listing. */
const SINGLE_ERP_ID = 'erp';

/** The ERP one fill is for: its component id, and its id in the integration's list. */
interface FillTarget {
    componentId: string;
    listId: string;
    firstId: string;
}

/**
 * Which ERP a fill is for: the one named (it must be one the integration uses), else the
 * integration's first. Its list id is what the integration's settings and key map know it by.
 */
function fillTarget(project: Project, integrationId: string, erpComponentId: string | undefined): FillTarget | undefined {
    const catalog = getAppBuilderComponentCatalog();
    const used = systemsUsedBy(project, integrationId, catalog);
    const componentId = erpComponentId ?? used[0];
    if (!componentId || !used.includes(componentId)) return undefined;
    const entry = catalogEntryFor(project, componentId, catalog);
    const firstId = entry?.listedAs?.firstId ?? SINGLE_ERP_ID;
    return { componentId, listId: entry?.listedAs ? listIdOf(project, entry) : firstId, firstId };
}

/**
 * Fill one ERP an integration serves in this project. Never throws: a missing ERP, sign-in or
 * credential, and a fill that stops, are a `failed` outcome with the reason.
 *
 * The key map the integration keeps covers every ERP it serves, and a PUT replaces it whole,
 * so this ERP's pairs are merged into the map the integration holds (`mergeKeyMap`).
 *
 * @param project - the project the integration is in
 * @param integrationId - the integration whose ERP is filled
 * @param deps - the auth service, the sign-in, progress
 * @param erpComponentId - which of its ERPs (AB-16); absent = its first
 * @returns what went in, or why nothing did
 */
export async function fillErpForProject(
    project: Project,
    integrationId: string,
    deps: ErpFillForProjectDeps,
    erpComponentId?: string,
): Promise<ErpFillOutcome> {
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    const integration = project.appBuilderComponents?.[integrationId];
    const target = fillTarget(project, integrationId, erpComponentId);
    const erp = target ? project.appBuilderComponents?.[target.componentId] : undefined;
    if (!integration || !target || !erp) {
        return { status: 'failed', detail: `"${integrationId}" has no ERP ${erpComponentId ? `"${erpComponentId}" ` : ''}in this project.` };
    }
    const auth = await deps.getAuth();
    if (!auth) return { status: 'failed', detail: 'Adobe sign-in required.' };
    const rest = await resolveRestTargetFor(project, deps.authManager, undefined, fetchImpl);
    if ('refusal' in rest) return { status: 'failed', detail: rest.refusal.replace(/^Error: /u, '') };
    const integrationClient = new ErpIntegrationClient(integration.deployedUrls, auth, fetchImpl);
    const fillDeps: ErpFillDeps = {
        get: commerceGet(rest, fetchImpl),
        settings: (codes) => integrationClient.resolvedSettings(codes, target.listId),
        importRecords: erpImport(erp.deployedUrls, auth, fetchImpl),
        saveKeyMap: async (entries) => {
            if (!integrationClient.keepsKeyMap()) return false;
            const current = await integrationClient.readKeyMap();
            await integrationClient.replaceKeyMap(mergeKeyMap(current, target.listId, entries, target.firstId));
            return true;
        },
        onProgress: deps.onProgress,
    };
    try {
        return { status: 'filled', result: await fillErp(fillDeps, project.name), erpId: target.componentId };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}

/** Each ERP's fill, by its component id and name. */
export type ErpFillOutcomes = Array<ErpFillOutcome & { erp: string; name: string }>;

/**
 * Fill every ERP an integration serves, one at a time (AB-16): Load demo data and a reset on
 * the integration cover the whole list. One that fails does not stop the next.
 *
 * @param project - the project the integration is in
 * @param integrationId - the integration
 * @param deps - the auth service, the sign-in, progress (each step names the ERP)
 * @returns each ERP's outcome, in link order
 */
export async function fillEveryErp(
    project: Project,
    integrationId: string,
    deps: ErpFillForProjectDeps,
): Promise<ErpFillOutcomes> {
    const outcomes: ErpFillOutcomes = [];
    const erps = systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog());
    for (const erp of erps) {
        const name = project.appBuilderComponents?.[erp]?.name ?? erp;
        const onProgress = (step: string) => deps.onProgress?.(erps.length > 1 ? `${name}: ${step}` : step);
        outcomes.push({ ...(await fillErpForProject(project, integrationId, { ...deps, onProgress }, erp)), erp, name });
    }
    return outcomes;
}

/**
 * Several fills as one outcome: filled when every ERP was, else each failure named by its
 * ERP. No ERP at all is a failure, as a single fill of none is.
 *
 * @param outcomes - each ERP's fill
 * @returns one outcome
 */
export function summarizeFills(outcomes: ErpFillOutcomes): { status: 'filled' } | { status: 'failed'; detail: string } {
    if (outcomes.length === 0) return { status: 'failed', detail: 'The integration has no ERP in this project.' };
    const failed = outcomes.flatMap((outcome) => (outcome.status === 'failed' ? [`${outcome.name}: ${outcome.detail}`] : []));
    return failed.length === 0 ? { status: 'filled' } : { status: 'failed', detail: failed.join('; ') };
}
