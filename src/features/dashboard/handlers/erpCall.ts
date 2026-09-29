/**
 * The shared foundation every ERP verb on the dashboard resolves through: the
 * pair (the integration and the ERP(s) it serves), the sign-in, and the two
 * small shapers each handler answers with.
 *
 * Split out of `erpIntegrationHandlers.ts` so the ERP verbs, the reset flow
 * (`erpResetHandlers.ts`), the settings verbs (`erpSettingsHandlers.ts`) and the
 * fill verb (`erpFillHandler.ts`) all bind to ONE resolver rather than importing
 * it through whichever file happened to hold it.
 *
 * @module features/dashboard/handlers/erpCall
 */

import { resolveComponentTarget } from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { deriveErpActionUrl } from '@/features/app-builder/services/erpIntegrationClient';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Everything a verb needs before it acts, or the refusal that stops it. */
export interface ErpCall {
    id: string;
    project: Project;
    integration: AppBuilderComponentState;
    /** The ERP named in the call, else the integration's first. */
    erp?: ErpRow;
    /** Every ERP the integration serves, in link order (AB-16). */
    erps: ErpRow[];
    auth: AppManagementAuth;
}

export type ErpRow = AppBuilderComponentState & { id: string };

/** What an ERP verb is sent: the integration's id, and which of its ERPs when it serves several. */
export interface ErpCallPayload {
    id?: string;
    /** An ERP's component id (`demo-erp-2`); absent = the integration's first. */
    erp?: string;
}

/**
 * Resolve the target, the pair and the sign-in once, for every verb: the
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
export function erpsOf(project: Project, integrationId: string): ErpRow[] {
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

export function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
