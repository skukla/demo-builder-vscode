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
import {
    callErpApi,
    deriveErpActionUrl,
    type ImsCallMethod,
} from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
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
    /** An ERP's component id (`demo-erp-2`) or its list id (`kukla`, as get_erp_status answers it); absent = the integration's first. */
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
    // By component id, else by list id: get_erp_status answers the list id and the settings
    // tools asked for the component id, so an agent following both was refused (2026-10-09).
    const catalog = getAppBuilderComponentCatalog();
    const erp = named
        ? (erps.find((row) => row.id === named) ?? erps.find((row) => erpListIdOf(project, row.id, catalog) === named))
        : erps[0];
    if (named && !erp) {
        const listed = erps.map((row) => row.id).join(', ') || 'none';
        const error = `"${integration.name ?? id}" serves no ERP "${named}" (its ERPs: ${listed}).`;
        return { error: { success: false, error, code: ErrorCode.CONFIG_INVALID } };
    }
    return { id, project, integration, auth, erp, erps };
}

/** One call to the ERP's own route: the verb, the route under its action, and the JSON body. */
export interface ErpRouteRequest {
    method: ImsCallMethod;
    route: string;
    body?: unknown;
}

/**
 * Call one of the ERP's own routes as the named ERP (else the integration's first), with the
 * sign-in: its parsed answer, or the refusal in words. Never throws. Shared by the agent's
 * ERP API verbs and the card's demo controls, so both reach an ERP the same way.
 *
 * @param verb - what the sign-in is needed for, in the refusal's words
 */
export async function callOwnErp(
    context: HandlerContext,
    payload: ErpCallPayload | undefined,
    request: ErpRouteRequest,
    verb: string,
): Promise<{ call: ErpCall; erp: ErpRow; body: unknown } | { error: HandlerResponse }> {
    const call = await openErpCall(context, payload, verb);
    if ('error' in call) return call;
    const erp = call.erp;
    if (!erp) {
        const error = `"${call.id}" has no ERP in this project.`;
        return { error: { success: false, error, code: ErrorCode.INVALID_OPERATION } };
    }
    const { method, route, body } = request;
    try {
        const answer = await callErpApi(erp.deployedUrls, call.auth, method, route, body);
        if ('refusal' in answer) {
            return {
                error: { success: false, error: answer.refusal, code: ErrorCode.CONFIG_INVALID },
            };
        }
        if (!answer.ok) {
            const said = `${answer.status} for ${method} ${route}: ${answer.detail}`;
            return { error: { success: false, error: `The ERP answered ${said}` } };
        }
        return { call, erp, body: answer.body };
    } catch (error) {
        return {
            error: { success: false, error: `Could not reach the ERP: ${errorText(error)}` },
        };
    }
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

/**
 * The ERP row as an agent or the flyout reads it: name, status, its screen's URL, and
 * the list id — the value a product's `erp_owner` takes to route to this ERP (AB-51).
 * Nothing else showed it (2026-09-30): the setup checklist told the SC to set
 * erp_owner and no surface said to what.
 */
export function shapeErpRow(erp: ErpCall['erp']) {
    if (!erp) return undefined;
    return {
        id: erp.id,
        name: erp.name ?? erp.id,
        listId: erp.listId,
        status: erp.status,
        url: erp.url,
        lastDeployed: erp.lastDeployed,
    };
}

/** A reason as a sentence: ending in a full stop, whether or not it came with one. */
export function sentence(text: string): string {
    return /[.!?]$/u.test(text) ? text : `${text}.`;
}

export function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
