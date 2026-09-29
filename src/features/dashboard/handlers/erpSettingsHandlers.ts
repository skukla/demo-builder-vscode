/**
 * An ERP's own settings for agents (AB-16j): read what one ERP owns and, per website, its sales
 * organisation (getErpSettings), and change them (setErpSettings). Split from
 * erpIntegrationHandlers to keep that file within its size limit; it shares that file's
 * openErpCall / shapeErpRow / errorText so both verbs resolve the pair and the sign-in the same
 * way. The read is guard-free; the write goes through the integration's `erp/erps` PATCH.
 */
import { type ErpCallPayload, errorText, openErpCall, shapeErpRow } from './erpIntegrationHandlers';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';

/** Reading an ERP's own settings: the ERP, and a website scope (absent = Default Config). */
export interface GetErpSettingsPayload extends ErpCallPayload {
    /** A Commerce website code; absent reads the ERP's Default-Config settings. */
    website?: string;
}

/** Changing an ERP's own settings at a scope. */
export interface SetErpSettingsPayload extends GetErpSettingsPayload {
    /** Per-ERP setting values; `null` clears an override so the wider scope applies. */
    values?: Record<string, string | boolean | null>;
}

/**
 * Handle 'getErpSettings' — one ERP's own settings in force (ownership and, per website, its
 * sales organisation), as the integration resolves them (`GET erp/settings?erp=&websites=`).
 * With `website`, that website's; else the ERP's Default-Config settings. Read-only.
 */
export const handleGetErpSettings: MessageHandler<GetErpSettingsPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const call = await openErpCall(context, payload, 'read the ERP settings');
    if ('error' in call) return call.error;
    const listId =
        payload?.erp && call.erp
            ? erpListIdOf(call.project, call.erp.id, getAppBuilderComponentCatalog())
            : undefined;
    const website = payload?.website;
    try {
        const settings = await new ErpIntegrationClient(
            call.integration.deployedUrls,
            call.auth,
        ).resolvedSettings(website ? [website] : [], listId);
        return {
            success: true,
            data: { id: call.id, erp: shapeErpRow(call.erp), website: website ?? null, settings },
        };
    } catch (error) {
        return { success: false, error: `Could not read the ERP settings: ${errorText(error)}` };
    }
};

/**
 * Handle 'setErpSettings' — save one named ERP's own settings at a scope
 * (`PATCH erp/erps` via updateErpSettings): each value a string/boolean, or `null` to clear the
 * override so the wider scope applies. `website` omitted edits the ERP's own defaults. The ERP
 * must be named; a single-ERP install has no per-ERP list and is refused with the reason.
 */
export const handleSetErpSettings: MessageHandler<SetErpSettingsPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const call = await openErpCall(context, payload, 'change the ERP settings');
    if ('error' in call) return call.error;
    const listId =
        payload?.erp && call.erp
            ? erpListIdOf(call.project, call.erp.id, getAppBuilderComponentCatalog())
            : undefined;
    if (!listId) {
        return {
            success: false,
            error: 'Name the ERP (erp) whose own settings to change.',
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    if (!payload?.values || typeof payload.values !== 'object') {
        return {
            success: false,
            error: 'values is required: the settings to change, by name.',
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    try {
        const { entry } = await new ErpIntegrationClient(
            call.integration.deployedUrls,
            call.auth,
        ).updateErpSettings(listId, payload.website, payload.values);
        return {
            success: true,
            data: { id: call.id, erp: listId, website: payload.website ?? null, entry },
        };
    } catch (error) {
        return { success: false, error: `Could not change the ERP settings: ${errorText(error)}` };
    }
};
