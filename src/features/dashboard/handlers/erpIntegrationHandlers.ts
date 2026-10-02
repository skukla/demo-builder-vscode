/**
 * The ERP integration's read/open verbs on the dashboard (plan step 05, decision 6):
 *
 * - `getErpStatus` — the ERP's health as its integration sees it, plus the
 *   persisted rows of both halves of the pair. Read-only, headless-safe: no
 *   guards, no prompts; a missing sign-in is a typed AUTH_REQUIRED.
 * - `openErpScreen` — open the ERP's own screen in a private browser window,
 *   with the key it was deployed with (`systemScreen.ts`). The key is added
 *   here, in the extension, and never reaches a webview, a log or an answer.
 * - `lookupErpRecord` / `followErpOrder` — one record or one order's whole life,
 *   as Commerce and the ERP hold it.
 * - `readErpApi` / `writeErpApi` — the ERP's own routes, read and driven.
 *
 * Every verb addresses the INTEGRATION's id (the card the SC sees); the bound
 * system is resolved from the catalog through `openErpCall` (`erpCall.ts`). The
 * reset flow lives in `erpResetHandlers.ts`, the settings verbs in
 * `erpSettingsHandlers.ts`.
 *
 * @module features/dashboard/handlers/erpIntegrationHandlers
 */

import { resolveComponentTarget } from './appBuilderComponentHandlers';
import {
    callOwnErp,
    erpsOf,
    errorText,
    openErpCall,
    shapeErpRow,
    type ErpCallPayload,
} from './erpCall';
import { openInIncognito } from '@/core/utils/browserUtils';
import { validateURL } from '@/core/validation/URLValidator';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import {
    ErpIntegrationClient,
    type ImsCallMethod,
} from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import {
    deriveScreenUrl,
    readScreenKey,
    screenLink,
} from '@/features/app-builder/services/systemScreen';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

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
    const reached = await callOwnErp(
        context,
        payload,
        { method, route, body: payload?.body },
        verb,
    );
    if ('error' in reached) return reached.error;
    return {
        success: true,
        data: {
            id: reached.call.id,
            erp: shapeErpRow(reached.erp),
            method,
            path: route,
            answer: shapeErpAnswer(reached.body),
        },
    };
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
