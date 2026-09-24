/**
 * The ERP integration's verbs on the dashboard (plan step 05, decision 6):
 *
 * - `getErpStatus` — the ERP's health as its integration sees it, plus the
 *   persisted rows of both halves of the pair. Read-only, headless-safe: no
 *   guards, no prompts; a missing sign-in is a typed AUTH_REQUIRED.
 * - `resetErpRecords` — the integration's own reset action: undo the ledgered
 *   Commerce writes, wipe the ERP, mirror Commerce as it stands (decisions 8
 *   and 11). Guards → progress → the call. Commerce orders keep nothing of the
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
    deriveErpActionUrl,
    type ErpResetReport,
} from '@/features/app-builder/services/erpIntegrationClient';
import { deriveScreenUrl, readScreenKey, screenLink } from '@/features/app-builder/services/systemScreen';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/** Everything both verbs need before they act, or the refusal that stops them. */
interface ErpCall {
    id: string;
    project: Project;
    integration: AppBuilderComponentState;
    erp?: AppBuilderComponentState & { id: string };
    auth: AppManagementAuth;
}

/**
 * Resolve the target, the pair and the sign-in once, for both verbs: the
 * integration row (must be an integration that deploys erp actions), its bound
 * ERP row from the catalog, and the IMS identity the actions take. A missing
 * sign-in is a typed AUTH_REQUIRED, never a dialog, so the agent surface can
 * serve both headless.
 */
async function openErpCall(
    context: HandlerContext,
    payload: { id?: string } | undefined,
    needsAuthFor: string,
): Promise<ErpCall | { error: HandlerResponse }> {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return { error: target.error };
    const { id, project } = target;
    const integration = getAppBuilderComponent(project, id);
    if (!integration || integration.kind !== 'integration') {
        return { error: { success: false, error: `Integration "${id}" not found.`, code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    if (!deriveErpActionUrl(integration.deployedUrls, 'status')) {
        const error = `"${integration.name ?? id}" has no ERP (it deploys no erp actions).`;
        return { error: { success: false, error, code: ErrorCode.INVALID_OPERATION } };
    }
    const auth = await resolveAppManagementAuth(project, ServiceLocator.getAuthenticationService());
    if (!auth) {
        return { error: { success: false, error: `Adobe sign-in required to ${needsAuthFor}.`, code: ErrorCode.AUTH_REQUIRED } };
    }
    const erpId = erpOf(project, id);
    const erpState = erpId ? getAppBuilderComponent(project, erpId) : undefined;
    return { id, project, integration, auth, erp: erpId && erpState ? { id: erpId, ...erpState } : undefined };
}

/** The ERP this integration uses in the project (the first, while there is one per integration). */
function erpOf(project: Project, integrationId: string): string | undefined {
    return systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog())[0];
}

/** The ERP row as an agent or the flyout reads it: name, status, its screen's URL. */
function shapeErpRow(erp: ErpCall['erp']) {
    if (!erp) return undefined;
    return { id: erp.id, name: erp.name ?? erp.id, status: erp.status, url: erp.url, lastDeployed: erp.lastDeployed };
}

/**
 * Handle 'getErpStatus' — the integration's `erp/status` plus both persisted rows.
 */
export const handleGetErpStatus: MessageHandler<{ id?: string }> = async (context, payload): Promise<HandlerResponse> => {
    const call = await openErpCall(context, payload, 'read the ERP status');
    if ('error' in call) return call.error;
    try {
        const status = await new ErpIntegrationClient(call.integration.deployedUrls, call.auth).status();
        return {
            success: true,
            data: {
                id: call.id,
                integration: { name: call.integration.name ?? call.id, status: call.integration.status },
                erp: shapeErpRow(call.erp),
                live: status,
            },
        };
    } catch (error) {
        return { success: false, error: `Could not read the ERP status: ${errorText(error)}` };
    }
};

/**
 * Handle 'resetErpRecords' — the integration's reset, under the guard chain and
 * wherever the SC is looking. Answers the action's report (what was reverted,
 * wiped and mirrored).
 *
 * Pressed on the integrations screen, so it belongs in that screen's progress
 * modal like every other card action; it was still opening a notification of its
 * own (owner, 2026-09-20).
 */
export const handleResetErpRecords: MessageHandler<{ id?: string; progress?: 'modal' }> =
    narrateOutcomeToModal(async (context, payload): Promise<HandlerResponse> => {
    const call = await openErpCall(context, payload, 'reset the ERP');
    if ('error' in call) return call.error;
    if (call.integration.status !== 'deployed') {
        const error = `"${call.integration.name ?? call.id}" is not deployed, so there is nothing to reset through.`;
        return { success: false, error, code: ErrorCode.INVALID_OPERATION };
    }

    const erpName = call.erp?.name ?? 'ERP';
    const result = await withOperationProgress(
        {
            id: call.id,
            title: `Resetting ${erpName} records`,
            inModal: progressSurfaceOf(payload) === 'modal',
            cardLabel: `${erpName} records`,
        },
        async (report): Promise<GuardableResult & { report?: ErpResetReport }> => {
            const refused = await guardOrBlock(context, call.project, (message) => report(message));
            if (refused) return refused;
            // Three writes in one stage, because the SC cannot act between them and
            // the reset is not resumable part-way.
            report(
                OPERATION_STAGES.resettingErpRecords.label,
                "Undoing the ERP's writes, wiping it, mirroring Commerce again",
            );
            try {
                return { success: true, report: await new ErpIntegrationClient(call.integration.deployedUrls, call.auth).reset() };
            } catch (error) {
                return { success: false, error: `The ERP reset did not finish: ${errorText(error)}` };
            }
        },
    );
    if (result.blocked || !result.success) {
        return { success: false, error: result.error };
    }
    return { success: true, data: { id: call.id, erp: shapeErpRow(call.erp), report: result.report } };
    },
    (payload) => payload?.id ?? '',
);

/**
 * Handle 'openErpScreen' — open the ERP bound to an integration at its own
 * screen. Answers with the screen's address WITHOUT the key.
 */
export const handleOpenErpScreen: MessageHandler<{ id?: string }> = async (context, payload): Promise<HandlerResponse> => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;
    const erpId = erpOf(project, id);
    const erp = erpId ? getAppBuilderComponent(project, erpId) : undefined;
    // Under the ERP's OWN id: a second ERP (AB-23) is the catalog's ERP re-keyed, and
    // its screen key is stored under its id — the first ERP's key would be refused.
    const systemEntry = erpId ? catalogEntryFor(project, erpId, getAppBuilderComponentCatalog()) : undefined;
    if (!systemEntry || !erp) {
        return { success: false, error: `"${id}" has no ERP in this project.`, code: ErrorCode.INVALID_OPERATION };
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
        return { success: false, error: `${name}'s screen address is not a valid URL.`, code: ErrorCode.CONFIG_INVALID };
    }
    // A private window: the key is in the address, and a private window keeps no history.
    const privateWindow = await openInIncognito(link);
    context.logger.debug(`[ERP] Opened ${systemEntry.id}'s screen (private window: ${privateWindow})`);
    return { success: true, data: { id, erp: systemEntry.id, screenUrl } };
};

function errorText(error: unknown): string {
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
        return { success: false, error: 'Name ONE record: a sku or a company id.', code: ErrorCode.CONFIG_INVALID };
    }
    if (sku !== undefined && !SKU.test(sku)) {
        return { success: false, error: 'That is not a SKU Commerce allows.', code: ErrorCode.CONFIG_INVALID };
    }
    if (company !== undefined && !COMPANY_ID.test(company)) {
        return { success: false, error: 'A company is looked up by its numeric Commerce id.', code: ErrorCode.CONFIG_INVALID };
    }
    const call = await openErpCall(context, payload, 'look up a record');
    if ('error' in call) return call.error;
    try {
        const client = new ErpIntegrationClient(call.integration.deployedUrls, call.auth);
        const lookup = await client.lookup(sku !== undefined ? { sku } : { company: company as string });
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
        return { success: false, error: 'Name the order to follow by its Commerce order number.', code: ErrorCode.CONFIG_INVALID };
    }
    const call = await openErpCall(context, payload, 'follow an order');
    if ('error' in call) return call.error;
    try {
        const trace = await new ErpIntegrationClient(call.integration.deployedUrls, call.auth).traceOrder(orderNumber);
        return { success: true, data: { id: call.id, erp: shapeErpRow(call.erp), orderNumber, trace } };
    } catch (error) {
        return { success: false, error: `Could not follow the order: ${errorText(error)}` };
    }
};
