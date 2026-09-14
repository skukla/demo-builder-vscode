/**
 * The ERP integration's two verbs on the dashboard (plan step 05, decision 6):
 *
 * - `getErpStatus` — the ERP's health as its integration sees it, plus the
 *   persisted rows of both halves of the pair. Read-only, headless-safe: no
 *   guards, no prompts; a missing sign-in is a typed AUTH_REQUIRED.
 * - `resetErpRecords` — the integration's own reset action: undo the ledgered
 *   Commerce writes, wipe the ERP, mirror Commerce as it stands (decisions 8
 *   and 11). Guards → progress → the call. Commerce orders keep nothing of the
 *   ERP's after it; the ERP's order numbers continue where they were.
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
    withComponentProgress,
    type GuardableResult,
} from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import {
    ErpIntegrationClient,
    deriveErpActionUrl,
    type ErpResetReport,
} from '@/features/app-builder/services/erpIntegrationClient';
import { getBoundSystem } from '@/features/components/services/appBuilderComponentCatalogLoader';
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
    const systemEntry = getBoundSystem(id);
    const erpState = systemEntry ? getAppBuilderComponent(project, systemEntry.id) : undefined;
    return { id, project, integration, auth, erp: systemEntry && erpState ? { id: systemEntry.id, ...erpState } : undefined };
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
 * a progress notification. Answers the action's report (what was reverted,
 * wiped and mirrored).
 */
export const handleResetErpRecords: MessageHandler<{ id?: string }> = async (context, payload): Promise<HandlerResponse> => {
    const call = await openErpCall(context, payload, 'reset the ERP');
    if ('error' in call) return call.error;
    if (call.integration.status !== 'deployed') {
        const error = `"${call.integration.name ?? call.id}" is not deployed, so there is nothing to reset through.`;
        return { success: false, error, code: ErrorCode.INVALID_OPERATION };
    }

    const erpName = call.erp?.name ?? 'ERP';
    const result = await withComponentProgress(
        { title: 'Resetting', id: call.id, label: `${erpName} records`, noun: 'System', logger: context.logger },
        async (report): Promise<GuardableResult & { report?: ErpResetReport }> => {
            const refused = await guardOrBlock(context, call.project, report);
            if (refused) return refused;
            report("Undoing the ERP's writes in Commerce, wiping the ERP, mirroring Commerce again…");
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
};

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
