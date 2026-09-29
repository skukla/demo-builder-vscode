/**
 * The ERP integration's verbs on the dashboard (plan step 05, decision 6):
 *
 * - `getErpStatus` — the ERP's health as its integration sees it, plus the
 *   persisted rows of both halves of the pair. Read-only, headless-safe: no
 *   guards, no prompts; a missing sign-in is a typed AUTH_REQUIRED.
 * - `resetErpRecords` — undo the ledgered Commerce writes (the integration's
 *   `erp/detach`), wipe every ERP it serves (each one's `admin/wipe`), then fill
 *   each from Commerce as it stands (`fillErpForProject`, AB-26y). Guards → progress → the calls. Commerce orders keep nothing of the
 *   ERP's after it; the ERP's order numbers continue where they were.
 * - `openErpScreen` — open the ERP's own screen in a private browser window,
 *   with the key it was deployed with (`systemScreen.ts`). The key is added
 *   here, in the extension, and never reaches a webview, a log or an answer.
 *
 * Both address the INTEGRATION's id (the card the SC sees); the bound system
 * is resolved from the catalog. Split from `appBuilderComponentHandlers.ts`
 * (900+ lines) the way the install handlers were.
 *
 * @module features/dashboard/handlers/erpIntegrationHandlers
 */

import {
    guardOrBlock,
    resolveComponentTarget,
    type GuardableResult,
} from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { openInIncognito } from '@/core/utils/browserUtils';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { validateURL } from '@/core/validation/URLValidator';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import {
    ErpIntegrationClient,
    callErpApi,
    deriveErpActionUrl,
    type ErpDetachReport,
    type ImsCallMethod,
} from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import {
    deriveScreenUrl,
    readScreenKey,
    screenLink,
} from '@/features/app-builder/services/systemScreen';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import {
    fillErpForProject,
    fillNotes,
    type ErpFillForProjectResult,
} from '@/features/project-creation/services/erpFillForProject';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/** Everything both verbs need before they act, or the refusal that stops them. */
interface ErpCall {
    id: string;
    project: Project;
    integration: AppBuilderComponentState;
    /** The ERP named in the call, else the integration's first. */
    erp?: ErpRow;
    /** Every ERP the integration serves, in link order (AB-16). */
    erps: ErpRow[];
    auth: AppManagementAuth;
}

type ErpRow = AppBuilderComponentState & { id: string };

/** What an ERP verb is sent: the integration's id, and which of its ERPs when it serves several. */
export interface ErpCallPayload {
    id?: string;
    /** An ERP's component id (`demo-erp-2`); absent = the integration's first. */
    erp?: string;
}

/**
 * Resolve the target, the pair and the sign-in once, for both verbs: the
 * integration row (must be an integration that deploys erp actions), its bound
 * ERP row from the catalog, and the IMS identity the actions take. A missing
 * sign-in is a typed AUTH_REQUIRED, never a dialog, so the agent surface can
 * serve both headless.
 */
export async function openErpCall(
    context: HandlerContext,
    payload: ErpCallPayload | undefined,
    needsAuthFor: string,
): Promise<ErpCall | { error: HandlerResponse }> {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return { error: target.error };
    const { id, project } = target;
    const integration = getAppBuilderComponent(project, id);
    if (!integration || integration.kind !== 'integration') {
        return {
            error: {
                success: false,
                error: `Integration "${id}" not found.`,
                code: ErrorCode.PROJECT_NOT_FOUND,
            },
        };
    }
    if (!deriveErpActionUrl(integration.deployedUrls, 'status')) {
        const error = `"${integration.name ?? id}" has no ERP (it deploys no erp actions).`;
        return { error: { success: false, error, code: ErrorCode.INVALID_OPERATION } };
    }
    const auth = await resolveAppManagementAuth(project, ServiceLocator.getAuthenticationService());
    if (!auth) {
        return {
            error: {
                success: false,
                error: `Adobe sign-in required to ${needsAuthFor}.`,
                code: ErrorCode.AUTH_REQUIRED,
            },
        };
    }
    const erps = erpsOf(project, id);
    const named = payload?.erp?.trim();
    const erp = named ? erps.find((row) => row.id === named) : erps[0];
    if (named && !erp) {
        const listed = erps.map((row) => row.id).join(', ') || 'none';
        const error = `"${integration.name ?? id}" serves no ERP "${named}" (its ERPs: ${listed}).`;
        return { error: { success: false, error, code: ErrorCode.CONFIG_INVALID } };
    }
    return { id, project, integration, auth, erp, erps };
}

/** The ERPs this integration serves in the project, in link order: its own first, then any added (AB-16). */
function erpsOf(project: Project, integrationId: string): ErpRow[] {
    return systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog()).flatMap(
        (erpId) => {
            const state = getAppBuilderComponent(project, erpId);
            return state ? [{ id: erpId, ...state }] : [];
        },
    );
}

/** The ERP row as an agent or the flyout reads it: name, status, its screen's URL. */
export function shapeErpRow(erp: ErpCall['erp']) {
    if (!erp) return undefined;
    return {
        id: erp.id,
        name: erp.name ?? erp.id,
        status: erp.status,
        url: erp.url,
        lastDeployed: erp.lastDeployed,
    };
}

/**
 * Handle 'getErpStatus' — the integration's `erp/status` plus both persisted rows. With `erp`
 * named, the live health is that ERP's (asked by its id in the integration's list).
 */
export const handleGetErpStatus: MessageHandler<ErpCallPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const call = await openErpCall(context, payload, 'read the ERP status');
    if ('error' in call) return call.error;
    const listId =
        payload?.erp && call.erp
            ? erpListIdOf(call.project, call.erp.id, getAppBuilderComponentCatalog())
            : undefined;
    try {
        const status = await new ErpIntegrationClient(
            call.integration.deployedUrls,
            call.auth,
        ).status(listId);
        return {
            success: true,
            data: {
                id: call.id,
                integration: {
                    name: call.integration.name ?? call.id,
                    status: call.integration.status,
                },
                erp: shapeErpRow(call.erp),
                erps: call.erps.map(shapeErpRow),
                live: status,
            },
        };
    } catch (error) {
        return { success: false, error: `Could not read the ERP status: ${errorText(error)}` };
    }
};

/**
 * Handle 'resetErpRecords' — undo, wipe and fill, under the guard chain and
 * wherever the SC is looking. Answers what each step did (`undone`, `wiped`,
 * `loaded`).
 *
 * Pressed on the integrations screen, so it belongs in that screen's progress
 * modal like every other card action; it was still opening a notification of its
 * own (owner, 2026-09-20).
 */
/**
 * What a reset did: the integration's Commerce writes undone, then each ERP wiped and filled
 * again, its prices published. `warning`: prices a fill could not publish (AB-26z).
 */
interface ErpResetReport {
    undone: ErpDetachReport;
    erps: Array<{ id: string; name: string; wiped: unknown; loaded: ErpFillForProjectResult }>;
    warning?: string;
}

/**
 * The reset's steps, in order, none resumable part-way: the integration undoes what it wrote
 * into Commerce (its `erp/detach`), then each ERP reset deletes its records (its own
 * `admin/wipe`) and Demo Builder fills it from Commerce again (`fillErpForProject`, AB-26y),
 * which ends by publishing that ERP's prices (AB-26z). With `only`, that ERP alone (AB-16c);
 * else every ERP the integration serves. Throws in the words of the step that stopped.
 */
async function resetErp(
    context: HandlerContext,
    call: ErpCall,
    report: (stage: string, step?: string) => void,
    only?: ErpRow,
): Promise<ErpResetReport> {
    const stage = OPERATION_STAGES.resettingErpRecords.label;
    const client = new ErpIntegrationClient(call.integration.deployedUrls, call.auth);
    report(
        stage,
        only
            ? `Undoing ${only.name ?? only.id}'s writes in Commerce`
            : "Undoing the ERPs' writes in Commerce",
    );
    const undone = only ? await detachOne(client, call, only) : await client.detach();
    if (!context.authManager) throw new Error('Adobe sign-in required.');
    const authManager = context.authManager;
    const erps: ErpResetReport['erps'] = [];
    const notes: Array<{ name: string; note?: string }> = [];
    for (const erp of only ? [only] : call.erps) {
        const name = erp.name ?? erp.id;
        report(stage, `Wiping ${name}`);
        const wipe = await callErpApi(erp.deployedUrls, call.auth, 'POST', 'admin/wipe', undefined);
        if ('refusal' in wipe) throw new Error(`${name}: ${wipe.refusal}`);
        if (!wipe.ok) throw new Error(`${name}'s wipe answered ${wipe.status}: ${wipe.detail}`);
        const filled = await fillErpForProject(
            call.project,
            call.id,
            {
                authManager,
                getAuth: async () => call.auth,
                onProgress: (step) =>
                    report(OPERATION_STAGES.loadingErpDemoData.label, `${name}: ${step}`),
            },
            erp.id,
        );
        if (filled.status === 'failed')
            throw new Error(`${name} was wiped but not filled again: ${filled.detail}`);
        erps.push({
            id: erp.id,
            name,
            wiped: (wipe.body as { wiped?: unknown }).wiped,
            loaded: filled.result,
        });
        notes.push({ name, note: filled.note });
    }
    const warning = fillNotes(notes);
    return warning ? { undone, erps, warning } : { undone, erps };
}

/**
 * Undo one ERP's writes (AB-16c). A deployment from before per-ERP undo ignores the id and undoes
 * every ERP, so it is asked first and refused; an answer that does not name the ERP stops the
 * reset before any wipe, saying what happened.
 */
async function detachOne(
    client: ErpIntegrationClient,
    call: ErpCall,
    erp: ErpRow,
): Promise<ErpDetachReport> {
    const integrationName = call.integration.name ?? call.id;
    const name = erp.name ?? erp.id;
    const listId = erpListIdOf(call.project, erp.id, getAppBuilderComponentCatalog()) ?? erp.id;
    if ((await client.status()).detachesPerErp !== true) {
        throw new Error(
            `${integrationName} can only reset every ERP at once. Redeploy it to reset ${name} alone.`,
        );
    }
    const undone = await client.detach(listId);
    if (undone.erp !== listId) {
        throw new Error(
            `${integrationName} undid every ERP's writes, not only ${name}'s. Reset every ERP to finish.`,
        );
    }
    return undone;
}

export const handleResetErpRecords: MessageHandler<ErpCallPayload & { progress?: 'modal' }> =
    narrateOutcomeToModal(
        async (context, payload): Promise<HandlerResponse> => {
            const call = await openErpCall(context, payload, 'reset the ERP');
            if ('error' in call) return call.error;
            if (call.integration.status !== 'deployed') {
                const error = `"${call.integration.name ?? call.id}" is not deployed, so there is nothing to reset through.`;
                return { success: false, error, code: ErrorCode.INVALID_OPERATION };
            }

            // One ERP when named (its card, AB-16c); else every ERP the integration serves.
            const only = payload?.erp ? call.erp : undefined;
            const erpName =
                only?.name ??
                (call.erps.length > 1
                    ? `${call.integration.name ?? call.id}'s ERPs`
                    : (call.erp?.name ?? 'ERP'));
            const result = await withOperationProgress(
                {
                    id: call.id,
                    title: `Resetting ${erpName} records`,
                    inModal: progressSurfaceOf(payload) === 'modal',
                    cardLabel: `${erpName} records`,
                },
                async (report): Promise<GuardableResult & { report?: ErpResetReport }> => {
                    const refused = await guardOrBlock(context, call.project, (message) =>
                        report(message),
                    );
                    if (refused) return refused;
                    try {
                        return {
                            success: true,
                            report: await resetErp(context, call, report, only),
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: `The ERP reset did not finish: ${errorText(error)}`,
                        };
                    }
                },
            );
            if (result.blocked || !result.success) {
                return { success: false, error: result.error };
            }
            // Prices a fill could not publish: said beside the report, never a failed reset (AB-26z).
            const warning = result.report?.warning;
            const report = result.report && {
                undone: result.report.undone,
                erps: result.report.erps,
            };
            return {
                success: true,
                data: {
                    id: call.id,
                    erp: shapeErpRow(call.erp),
                    report,
                    ...(warning ? { warning } : {}),
                },
            };
        },
        (payload) => payload?.id ?? '',
    );

/**
 * Handle 'openErpScreen' — open the ERP bound to an integration at its own
 * screen. Answers with the screen's address WITHOUT the key.
 */
export const handleOpenErpScreen: MessageHandler<ErpCallPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;
    const erps = erpsOf(project, id);
    const erp = payload?.erp ? erps.find((row) => row.id === payload.erp) : erps[0];
    const erpId = erp?.id;
    // Under the ERP's OWN id: a second ERP (AB-23) is the catalog's ERP re-keyed, and
    // its screen key is stored under its id — the first ERP's key would be refused.
    const systemEntry = erpId
        ? catalogEntryFor(project, erpId, getAppBuilderComponentCatalog())
        : undefined;
    if (!systemEntry || !erp) {
        const which = payload?.erp ? ` "${payload.erp}"` : '';
        return {
            success: false,
            error: `"${id}" has no ERP${which} in this project.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    const name = erp.name ?? systemEntry.name;
    const screenUrl = deriveScreenUrl(systemEntry, erp.deployedUrls);
    if (!screenUrl) {
        const error = `${name} has no screen deployed. Redeploy it to add one.`;
        return { success: false, error, code: ErrorCode.INVALID_OPERATION };
    }
    const key = await readScreenKey(context.context.secrets, project.path, systemEntry);
    if (!key) {
        const error = `${name} was deployed without a screen key from this machine. Redeploy it to open its screen.`;
        return { success: false, error, code: ErrorCode.INVALID_OPERATION };
    }
    const link = screenLink(screenUrl, key);
    try {
        validateURL(link);
    } catch {
        return {
            success: false,
            error: `${name}'s screen address is not a valid URL.`,
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    // A private window: the key is in the address, and a private window keeps no history.
    const privateWindow = await openInIncognito(link);
    context.logger.debug(
        `[ERP] Opened ${systemEntry.id}'s screen (private window: ${privateWindow})`,
    );
    return { success: true, data: { id, erp: systemEntry.id, screenUrl } };
};

export function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** What the integration's own `erp/lookup` accepts (`actions/erp/lookup/index.js`). */
const SKU = /^[A-Za-z0-9 _./-]{1,64}$/u;
const COMPANY_ID = /^\d{1,12}$/u;
/** What `erp/history?trace=` accepts: a Commerce order number. */
const ORDER_NUMBER = /^[A-Za-z0-9-]{1,50}$/u;

export interface LookupErpRecordPayload {
    id?: string;
    /** The product, by SKU. */
    sku?: string;
    /** The company, by its Commerce id. */
    company?: string;
}

/**
 * Handle 'lookupErpRecord' — one product or one company as Commerce and the ERP
 * hold it, row by row (the Mapping tab's lookup card, for an agent). A side that
 * does not have it answers empty cells, which is the answer, not an error.
 */
export const handleLookupErpRecord: MessageHandler<LookupErpRecordPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const sku = payload?.sku?.trim();
    const company = payload?.company?.trim();
    if ((sku === undefined) === (company === undefined)) {
        return {
            success: false,
            error: 'Name ONE record: a sku or a company id.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    if (sku !== undefined && !SKU.test(sku)) {
        return {
            success: false,
            error: 'That is not a SKU Commerce allows.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    if (company !== undefined && !COMPANY_ID.test(company)) {
        return {
            success: false,
            error: 'A company is looked up by its numeric Commerce id.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    const call = await openErpCall(context, payload, 'look up a record');
    if ('error' in call) return call.error;
    try {
        const client = new ErpIntegrationClient(call.integration.deployedUrls, call.auth);
        const lookup = await client.lookup(
            sku !== undefined ? { sku } : { company: company as string },
        );
        return { success: true, data: { id: call.id, erp: shapeErpRow(call.erp), lookup } };
    } catch (error) {
        return { success: false, error: `Could not look up the record: ${errorText(error)}` };
    }
};

/**
 * Handle 'followErpOrder' — one Commerce order's whole life: placed in Commerce,
 * sent to the ERP (or held, and why), what the ERP did to it, and each ERP event
 * applied back to Commerce, oldest first (the Admin page's Follow an order).
 */
export const handleFollowErpOrder: MessageHandler<{ id?: string; orderNumber?: string }> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const orderNumber = payload?.orderNumber?.trim();
    if (!orderNumber || !ORDER_NUMBER.test(orderNumber)) {
        return {
            success: false,
            error: 'Name the order to follow by its Commerce order number.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    const call = await openErpCall(context, payload, 'follow an order');
    if ('error' in call) return call.error;
    try {
        const trace = await new ErpIntegrationClient(
            call.integration.deployedUrls,
            call.auth,
        ).traceOrder(orderNumber);
        return {
            success: true,
            data: { id: call.id, erp: shapeErpRow(call.erp), orderNumber, trace },
        };
    } catch (error) {
        return { success: false, error: `Could not follow the order: ${errorText(error)}` };
    }
};

/** The same bound the Commerce REST tools hold: an ERP list can be long, and the cut is declared. */
const MAX_ERP_ANSWER_CHARS = 30_000;
const ERP_WRITE_METHODS: ReadonlyArray<ImsCallMethod> = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** The ERP's answer as an agent reads it: the body, cut and declared past the ceiling. */
function shapeErpAnswer(body: unknown): unknown {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    if (text.length <= MAX_ERP_ANSWER_CHARS) return body;
    return {
        truncated: true,
        chars: text.length,
        note: `Showing the first ${MAX_ERP_ANSWER_CHARS} characters. Ask for one record, or a narrower list.`,
        body: text.slice(0, MAX_ERP_ANSWER_CHARS),
    };
}

/** Both ERP API verbs share this: the pair resolved, the route called, the answer shaped. */
async function callErpRoute(
    context: HandlerContext,
    payload: (ErpCallPayload & { path?: string; body?: unknown }) | undefined,
    method: ImsCallMethod,
    verb: string,
): Promise<HandlerResponse> {
    const route = payload?.path?.trim();
    if (!route) {
        return {
            success: false,
            error: 'Name the ERP route, e.g. "partners" or "orders/0000001003".',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    const call = await openErpCall(context, payload, verb);
    if ('error' in call) return call.error;
    if (!call.erp) {
        return {
            success: false,
            error: `"${call.id}" has no ERP in this project.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    try {
        const answer = await callErpApi(
            call.erp.deployedUrls,
            call.auth,
            method,
            route,
            payload?.body,
        );
        if ('refusal' in answer) {
            return { success: false, error: answer.refusal, code: ErrorCode.CONFIG_INVALID };
        }
        if (!answer.ok) {
            return {
                success: false,
                error: `The ERP answered ${answer.status} for ${method} ${route}: ${answer.detail}`,
            };
        }
        return {
            success: true,
            data: {
                id: call.id,
                erp: shapeErpRow(call.erp),
                method,
                path: route,
                answer: shapeErpAnswer(answer.body),
            },
        };
    } catch (error) {
        return { success: false, error: `Could not reach the ERP: ${errorText(error)}` };
    }
}

/**
 * Handle 'readErpApi' — GET one of the ERP's own routes (partners, products, pricing,
 * orders, shipments, invoices, settings, health, search) as the ERP's screens read them.
 */
export const handleReadErpApi: MessageHandler<ErpCallPayload & { path?: string }> = (
    context,
    payload,
) => callErpRoute(context, payload, 'GET', 'read the ERP');

/**
 * Handle 'writeErpApi' — POST, PUT, PATCH or DELETE one of the ERP's own routes: the
 * actions a person takes on the ERP's screens (confirm, ship, invoice, hold, a price or
 * credit change), made without the screen. The ERP publishes the resulting event to the
 * integration, which applies it to Commerce, so this is how the ERP → Commerce half is
 * driven from the agent surface.
 */
export const handleWriteErpApi: MessageHandler<
    ErpCallPayload & { method?: string; path?: string; body?: unknown }
> = (context, payload) => {
    const method = String(payload?.method ?? '').toUpperCase() as ImsCallMethod;
    if (!ERP_WRITE_METHODS.includes(method)) {
        return Promise.resolve({
            success: false,
            error: 'method must be POST, PUT, PATCH or DELETE. For reads use run_erp_rest.',
            code: ErrorCode.CONFIG_INVALID,
        });
    }
    return callErpRoute(context, payload, method, 'change the ERP');
};
