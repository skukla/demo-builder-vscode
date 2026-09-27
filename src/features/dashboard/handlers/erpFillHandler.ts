/**
 * `loadErpDemoData` — Demo Builder fills the ERP from Commerce (AB-26y step 1): the ERP
 * gets Commerce's products, companies and structure, sorted by the integration's settings,
 * through the ERP's ordinary import. The copy was the integration's job until 2026-09-27;
 * it is demo setup, so it is Demo Builder's.
 *
 * Guards → progress → the fill, the shape `resetErpRecords` has. Adding records never
 * removes any: a record already in the ERP is updated in place.
 *
 * @module features/dashboard/handlers/erpFillHandler
 */

import { guardOrBlock, type GuardableResult } from './appBuilderComponentHandlers';
import { errorText, openErpCall, shapeErpRow, type ErpCall } from './erpIntegrationHandlers';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { requestRest, resolveRestTarget, type RestTarget } from '@/features/ai/server/commerceRestClient';
import { fillErp, type ErpFillDeps, type ErpFillResult } from '@/features/app-builder/services/erpFill';
import { CommerceReadError, type CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import { ErpIntegrationClient, callErpApi } from '@/features/app-builder/services/erpIntegrationClient';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';

/** A GET over the project's signed Commerce client, answering the parsed body. */
function commerceGet(target: RestTarget): CommerceGet {
    return async (path) => {
        const answer = await requestRest('GET', target, path, undefined, globalThis.fetch);
        if ('failed' in answer) throw new CommerceReadError(`Commerce did not answer ${path.split('?')[0]}: ${answer.failed}`);
        if (!answer.ok) {
            const detail = answer.text.slice(0, 200);
            throw new CommerceReadError(`Commerce answered ${answer.status} for ${path.split('?')[0]}: ${detail}`, answer.status);
        }
        return answer.text ? (JSON.parse(answer.text) as unknown) : null;
    };
}

/** The fill's three collaborators, for this pair. */
function fillDeps(
    call: ErpCall & { erp: NonNullable<ErpCall['erp']> },
    target: RestTarget,
    onProgress: (step: string) => void,
): ErpFillDeps {
    const integration = new ErpIntegrationClient(call.integration.deployedUrls, call.auth);
    return {
        get: commerceGet(target),
        onProgress,
        settings: (codes) => integration.resolvedSettings(codes),
        importRecords: async (body) => {
            const answer = await callErpApi(call.erp.deployedUrls, call.auth, 'POST', 'admin/import', body);
            if ('refusal' in answer) throw new Error(answer.refusal);
            if (!answer.ok) throw new Error(`The ERP's import answered ${answer.status}: ${answer.detail}`);
        },
    };
}

type FillOutcome = GuardableResult & { result?: ErpFillResult };

/**
 * Handle 'loadErpDemoData' — fill the ERP bound to an integration from Commerce as it stands.
 */
export const handleLoadErpDemoData: MessageHandler<{ id?: string; progress?: 'modal' }> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const call = await openErpCall(context, payload, 'load demo data into the ERP');
        if ('error' in call) return call.error;
        const erp = call.erp;
        if (!erp || erp.status !== 'deployed' || call.integration.status !== 'deployed') {
            const error = `"${call.integration.name ?? call.id}" and its ERP must both be deployed to load demo data.`;
            return { success: false, error, code: ErrorCode.INVALID_OPERATION };
        }
        const erpName = erp.name ?? 'ERP';
        const outcome = await withOperationProgress(
            { id: call.id, title: `Loading demo data into ${erpName}`, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: `${erpName} records` },
            async (report): Promise<FillOutcome> => {
                const refused = await guardOrBlock(context, call.project, (message) => report(message));
                if (refused) return refused;
                const target = await resolveRestTarget(context, undefined, globalThis.fetch);
                if ('refusal' in target) return { success: false, error: target.refusal.replace(/^Error: /u, '') };
                const deps = fillDeps({ ...call, erp }, target, (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step));
                try {
                    return { success: true, result: await fillErp(deps, call.project.name) };
                } catch (error) {
                    return { success: false, error: `Loading demo data did not finish: ${errorText(error)}` };
                }
            },
        );
        if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error };
        return { success: true, data: { id: call.id, erp: shapeErpRow(erp), loaded: outcome.result } };
    },
    (payload) => payload?.id ?? '',
);
