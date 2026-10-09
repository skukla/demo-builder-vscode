/**
 * Fill one project's ERP from Commerce (AB-26y): the one path both callers take, the add
 * (once the integration's Commerce install stands) and "Load demo data" (the tile and the
 * `load_erp_demo_data` tool). It finds the ERP the integration serves, the signed-in identity
 * both apps take, and the project's Commerce credential, then runs `fillErp`. Once the ERP is
 * filled, the integration publishes that ERP's customer prices into each company's shared
 * catalog (`erp/prices`, AB-26z), so every fill (a reset's, Load demo data's, an add's) ends
 * with the buyer's prices in Commerce.
 *
 * A composition file: it wires the Commerce client, the integration's client and the ERP's
 * import into `fillErp`, which knows none of them.
 *
 * @module features/project-creation/services/erpFillForProject
 */

import { mapAfterFill } from './erpMappingAfterFill';
import { publishPricesAfterFill, type ErpPricesPublished } from './erpPricesAfterFill';
import { otherErpNames, readErpRules } from './erpRules';
import {
    requestRest,
    resolveRestTargetFor,
    type RestTarget,
} from '@/features/ai/server/commerceRestClient';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import { listIdOf } from '@/features/app-builder/services/deployInputs';
import {
    fillErp,
    type ErpFillDeps,
    type ErpFillResult,
} from '@/features/app-builder/services/erpFill';
import type { ErpMappingReport } from '@/features/app-builder/services/erpFillMapping';
import type { CommercePost } from '@/features/app-builder/services/erpFillPricing';
import {
    CommerceReadError,
    type CommerceGet,
} from '@/features/app-builder/services/erpFillReaders';
import {
    ErpIntegrationClient,
    callErpApi,
} from '@/features/app-builder/services/erpIntegrationClient';
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

/** What one fill put in the ERP, and the prices published after it (absent when none were). */
export type ErpFillForProjectResult = ErpFillResult & { prices?: ErpPricesPublished };

export type ErpFillOutcome =
    /**
     * `erpId`: the filled ERP's component id. `warning`: what did not go right after the fill
     * and the SC must act on (mapping not saved, prices not published); the fill stands.
     * `note`: what the SC need only know (prices still being published). `mapping`: absent
     * when the step was skipped.
     */
    | {
          status: 'filled';
          result: ErpFillForProjectResult;
          erpId: string;
          warning?: string;
          note?: string;
          mapping?: ErpMappingReport;
      }
    | { status: 'failed'; detail: string };

/** One Commerce REST call over the project's signed client; parsed body, or CommerceReadError. */
async function commerceReply(
    method: 'GET' | 'POST',
    target: RestTarget,
    path: string,
    body: unknown,
    fetchImpl: typeof fetch,
): Promise<unknown> {
    const answer = await requestRest(method, target, path, body, fetchImpl);
    const route = path.split('?')[0];
    if ('failed' in answer)
        throw new CommerceReadError(`Commerce did not answer ${route}: ${answer.failed}`);
    if (!answer.ok) {
        throw new CommerceReadError(
            `Commerce answered ${answer.status} for ${route}: ${answer.text.slice(0, 200)}`,
            answer.status,
        );
    }
    return answer.text ? (JSON.parse(answer.text) as unknown) : null;
}

/** A GET over the project's signed Commerce client, answering the parsed body. */
function commerceGet(target: RestTarget, fetchImpl: typeof fetch): CommerceGet {
    return (path) => commerceReply('GET', target, path, undefined, fetchImpl);
}

/**
 * A GET over the project's signed Commerce client, or why there is none (no credential, no
 * sign-in). Shared with the "Add another ERP" ownership read (AB-64), which reads Commerce
 * the way the fill does.
 */
export async function commerceGetForProject(
    project: Project,
    authManager: AuthenticationService,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<CommerceGet | { refusal: string }> {
    const rest = await resolveRestTargetFor(project, authManager, undefined, fetchImpl);
    if ('refusal' in rest) return { refusal: rest.refusal.replace(/^Error: /u, '') };
    return commerceGet(rest, fetchImpl);
}

/** A POST over the same signed client, for the reads Commerce only answers to a POST (tier prices). */
function commercePost(target: RestTarget, fetchImpl: typeof fetch): CommercePost {
    return (path, body) => commerceReply('POST', target, path, body, fetchImpl);
}

/** The ERP's import at its own deployed URLs; throws in the ERP's words when it refuses. */
function erpImport(
    erpUrls: Record<string, string> | undefined,
    auth: AppManagementAuth,
    fetchImpl: typeof fetch,
) {
    return async (body: unknown): Promise<void> => {
        const answer = await callErpApi(erpUrls, auth, 'POST', 'admin/import', body, fetchImpl);
        if ('refusal' in answer) throw new Error(answer.refusal);
        if (!answer.ok)
            throw new Error(`The ERP's import answered ${answer.status}: ${answer.detail}`);
    };
}

/** The ERP one fill is for: its component id, and its id in the integration's list. */
interface FillTarget {
    componentId: string;
    listId: string;
}

/**
 * Which ERP a fill is for: the one named (it must be one the integration uses), else the
 * integration's first. Its list id is what the integration's settings and key map know it by
 * (`listIdOf`, AB-51). An ERP whose listing cannot be read has no such id, and filling it
 * under a guessed one would let its pairs replace another ERP's in the key map (AB-16g). That
 * is a refusal, in words.
 */
function fillTarget(
    project: Project,
    integrationId: string,
    erpComponentId: string | undefined,
): FillTarget | { refusal: string } | undefined {
    const catalog = getAppBuilderComponentCatalog();
    const used = systemsUsedBy(project, integrationId, catalog);
    const componentId = erpComponentId ?? used[0];
    if (!componentId || !used.includes(componentId)) return undefined;
    const entry = catalogEntryFor(project, componentId, catalog);
    if (!entry?.listedAs) {
        return {
            refusal:
                `Cannot tell which ERP "${componentId}" is in the integration's list, so its pairs could ` +
                "replace another ERP's. Redeploy it, then load demo data again.",
        };
    }
    return { componentId, listId: listIdOf(project, entry) };
}

/**
 * Fill one ERP an integration serves in this project. Never throws: a missing ERP, sign-in or
 * credential, and a fill that stops, are a `failed` outcome with the reason.
 *
 * The key map the integration keeps covers every ERP it serves, and a PUT replaces it whole,
 * so this ERP's pairs are merged into the map the integration holds (`mergeKeyMap`).
 *
 * Then the unset website mappings are filled (`mapAfterFill`, AB-26y) and the ERP's prices
 * published (`publishPricesAfterFill`); either failing is the `warning`, a publish still
 * running the `note`, and the fill stands.
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
    const resolved = fillTarget(project, integrationId, erpComponentId);
    if (resolved && 'refusal' in resolved) return { status: 'failed', detail: resolved.refusal };
    const target = resolved;
    const erp = target ? project.appBuilderComponents?.[target.componentId] : undefined;
    if (!integration || !target || !erp) {
        return {
            status: 'failed',
            detail: `"${integrationId}" has no ERP ${erpComponentId ? `"${erpComponentId}" ` : ''}in this project.`,
        };
    }
    const auth = await deps.getAuth();
    if (!auth) return { status: 'failed', detail: 'Adobe sign-in required.' };
    const rest = await resolveRestTargetFor(project, deps.authManager, undefined, fetchImpl);
    if ('refusal' in rest)
        return { status: 'failed', detail: rest.refusal.replace(/^Error: /u, '') };
    const integrationClient = new ErpIntegrationClient(integration.deployedUrls, auth, fetchImpl);
    const fillDeps: ErpFillDeps = {
        get: commerceGet(rest, fetchImpl),
        post: commercePost(rest, fetchImpl),
        settings: (codes) => integrationClient.resolvedSettings(codes, target.listId),
        listId: target.listId,
        // The other ERPs' rules (AB-72): what this ERP owns is decided across every rule.
        otherErps: () => readErpRules(integrationClient, otherErpNames(project, integrationId, target.listId)),
        importRecords: erpImport(erp.deployedUrls, auth, fetchImpl),
        saveKeyMap: async (entries) => {
            if (!integrationClient.keepsKeyMap()) return false;
            const current = await integrationClient.readKeyMap();
            await integrationClient.replaceKeyMap(mergeKeyMap(current, target.listId, entries));
            return true;
        },
        onProgress: deps.onProgress,
    };
    let result: ErpFillResult;
    try {
        result = await fillErp(fillDeps, project.name);
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
    // Before the prices: the integration publishes a price to the websites its mapping names.
    const mapped = await mapAfterFill({
        erp: { ...target, deployedUrls: erp.deployedUrls },
        client: integrationClient,
        get: fillDeps.get,
        auth,
        fetchImpl,
        onProgress: deps.onProgress,
    });
    const priced = await publishPricesAfterFill(integrationClient, target.listId, deps.onProgress);
    const warning = [mapped.note, priced.warning].filter(Boolean).join(' ');
    return {
        status: 'filled',
        result: priced.prices ? { ...result, prices: priced.prices } : result,
        erpId: target.componentId,
        ...(mapped.mapping ? { mapping: mapped.mapping } : {}),
        ...(warning ? { warning } : {}),
        ...(priced.note ? { note: priced.note } : {}),
    };
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
        const onProgress = (step: string) =>
            deps.onProgress?.(erps.length > 1 ? `${name}: ${step}` : step);
        outcomes.push({
            ...(await fillErpForProject(project, integrationId, { ...deps, onProgress }, erp)),
            erp,
            name,
        });
    }
    return outcomes;
}

/**
 * Several fills as one outcome: filled when every ERP was, else each failure named by its
 * ERP. No ERP at all is a failure, as a single fill of none is. A fill's warning or note is not
 * carried here: the fill's own progress step has said it (`publishPricesAfterFill`).
 *
 * @param outcomes - each ERP's fill
 * @returns one outcome
 */
export function summarizeFills(
    outcomes: ErpFillOutcomes,
): { status: 'filled' } | { status: 'failed'; detail: string } {
    if (outcomes.length === 0)
        return { status: 'failed', detail: 'The integration has no ERP in this project.' };
    const failed = outcomes.flatMap((outcome) =>
        outcome.status === 'failed' ? [`${outcome.name}: ${outcome.detail}`] : [],
    );
    return failed.length === 0
        ? { status: 'filled' }
        : { status: 'failed', detail: failed.join('; ') };
}

/** One filled ERP's name with what its fill said, for `fillWarnings` and `fillNotes`. */
export interface FillSaid {
    name: string;
    warning?: string;
    note?: string;
}

/**
 * The fills' lines of one kind as one text: one ERP's as it is, several each after its ERP's
 * name, since "prices were not published" means nothing without saying for which.
 */
function fillLines(fills: FillSaid[], kind: 'warning' | 'note'): string | undefined {
    const said = fills.flatMap((fill) => {
        const line = fill[kind];
        if (!line) return [];
        return [fills.length > 1 ? `${fill.name}: ${line}` : line];
    });
    return said.length > 0 ? said.join(' ') : undefined;
}

/**
 * The fills' warnings as one text: what the SC must act on (prices not published).
 *
 * @param fills - each filled ERP's name and what its fill said
 * @returns the warnings, or undefined when there are none
 */
export function fillWarnings(fills: FillSaid[]): string | undefined {
    return fillLines(fills, 'warning');
}

/**
 * The fills' notes as one text: what the SC need only know (prices still being published).
 *
 * @param fills - each filled ERP's name and what its fill said
 * @returns the notes, or undefined when there are none
 */
export function fillNotes(fills: FillSaid[]): string | undefined {
    return fillLines(fills, 'note');
}
