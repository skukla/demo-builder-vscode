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

/** The prices the integration published after a fill: tier prices written, removed, kept, and companies skipped. */
export interface ErpPricesPublished {
    written: number;
    removed: number;
    unchanged: number;
    skipped: number;
}

/** What one fill put in the ERP, and the prices published after it (absent when none were). */
export type ErpFillForProjectResult = ErpFillResult & { prices?: ErpPricesPublished };

export type ErpFillOutcome =
    /**
     * `erpId`: the filled ERP's component id. `note`: what did not go right after the fill,
     * in the SC's words (prices not published); the fill itself stands.
     */
    | { status: 'filled'; result: ErpFillForProjectResult; erpId: string; note?: string }
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

/** A reason without its closing full stop, so it can sit inside a sentence. */
function clause(text: string): string {
    return text.replace(/[.!?\s]+$/u, '');
}

/** The note for prices that did not get published after a fill that did. */
function pricesNote(reason: string): string {
    return `Demo data loaded; ${reason}. Load demo data again to retry.`;
}

/**
 * Publish one ERP's prices after its fill. A deployment without `erp/prices` is silent; a
 * publish that fails, whole or for some companies, is a note, never a failed fill.
 */
async function publishPricesAfterFill(
    client: ErpIntegrationClient,
    listId: string,
    onProgress?: (step: string) => void,
): Promise<{ prices?: ErpPricesPublished; note?: string }> {
    if (!client.publishesPrices()) return {};
    onProgress?.('Publishing prices');
    const published = await publishedOrNote(client, listId);
    // The note is also a step, so the progress (and the Debug Logs, which record each step) say it.
    if (published.note) onProgress?.(published.note);
    return published;
}

/** The publish's counts, and a note when it failed whole or for some companies. */
async function publishedOrNote(client: ErpIntegrationClient, listId: string): Promise<{ prices?: ErpPricesPublished; note?: string }> {
    try {
        const report = await client.publishPrices(listId);
        const prices = { written: report.written, removed: report.removed, unchanged: report.unchanged, skipped: report.skipped.length };
        if (report.failed.length === 0) return { prices };
        const companies = report.failed.length === 1 ? '1 company' : `${report.failed.length} companies`;
        return { prices, note: pricesNote(`prices for ${companies} were not published: ${clause(report.failed[0].error)}`) };
    } catch (error) {
        return { note: pricesNote(`prices were not published: ${clause(error instanceof Error ? error.message : String(error))}`) };
    }
}

/**
 * Fill one ERP an integration serves in this project. Never throws: a missing ERP, sign-in or
 * credential, and a fill that stops, are a `failed` outcome with the reason.
 *
 * The key map the integration keeps covers every ERP it serves, and a PUT replaces it whole,
 * so this ERP's pairs are merged into the map the integration holds (`mergeKeyMap`).
 *
 * Then the ERP's prices are published (`publishPricesAfterFill`); one that fails is the
 * outcome's `note`, and the fill still stands.
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
    let result: ErpFillResult;
    try {
        result = await fillErp(fillDeps, project.name);
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
    const { prices, note } = await publishPricesAfterFill(integrationClient, target.listId, deps.onProgress);
    const filled: ErpFillForProjectResult = prices ? { ...result, prices } : result;
    return { status: 'filled', result: filled, erpId: target.componentId, ...(note ? { note } : {}) };
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
 * ERP. No ERP at all is a failure, as a single fill of none is. Prices not published are not
 * carried here: the fill's own progress step has said so (`publishPricesAfterFill`).
 *
 * @param outcomes - each ERP's fill
 * @returns one outcome
 */
export function summarizeFills(outcomes: ErpFillOutcomes): { status: 'filled' } | { status: 'failed'; detail: string } {
    if (outcomes.length === 0) return { status: 'failed', detail: 'The integration has no ERP in this project.' };
    const failed = outcomes.flatMap((outcome) => (outcome.status === 'failed' ? [`${outcome.name}: ${outcome.detail}`] : []));
    return failed.length === 0 ? { status: 'filled' } : { status: 'failed', detail: failed.join('; ') };
}

/**
 * The fills' notes as one text: one ERP's as it is, several each after its ERP's name, since
 * "prices were not published" means nothing without saying for which.
 *
 * @param fills - each filled ERP's name and note
 * @returns the notes, or undefined when there are none
 */
export function fillNotes(fills: Array<{ name: string; note?: string }>): string | undefined {
    const noted = fills.filter((fill): fill is { name: string; note: string } => Boolean(fill.note));
    if (noted.length === 0) return undefined;
    return noted.map((fill) => (fills.length > 1 ? `${fill.name}: ${fill.note}` : fill.note)).join(' ');
}
