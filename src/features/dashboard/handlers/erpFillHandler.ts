/**
 * `loadErpDemoData` — Demo Builder fills the ERP from Commerce (AB-26y step 1): the ERP
 * gets Commerce's products, companies and structure, sorted by the integration's settings,
 * through the ERP's ordinary import. The copy was the integration's job until 2026-09-27;
 * it is demo setup, so it is Demo Builder's. The fill itself is `fillErpForProject`, the
 * same path an add takes once the integration is installed.
 *
 * Guards → progress → the fill, the shape `resetErpRecords` has. Adding records never
 * removes any: a record already in the ERP is updated in place. Each fill ends with the
 * ERP's prices published into the companies' shared catalogs (AB-26z); prices that were not
 * are the answer's `warning`, and the fill still stands.
 *
 * @module features/dashboard/handlers/erpFillHandler
 */

import { guardOrBlock, type GuardableResult } from './appBuilderComponentHandlers';
import { openErpCall, shapeErpRow, type ErpCallPayload } from './erpIntegrationHandlers';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { fillErpForProject, fillNotes, type ErpFillForProjectResult } from '@/features/project-creation/services/erpFillForProject';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';

type FillOutcome = GuardableResult & { loaded?: Array<{ erp: string; name: string; result: ErpFillForProjectResult; note?: string }> };

/**
 * Handle 'loadErpDemoData' — fill the ERPs an integration serves from Commerce as it stands:
 * the one named by `erp` (its card), else every one (the integration, and the agent).
 */
export const handleLoadErpDemoData: MessageHandler<ErpCallPayload & { progress?: 'modal' }> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const call = await openErpCall(context, payload, 'load demo data into the ERP');
        if ('error' in call) return call.error;
        // The one named (its card), else every ERP the integration serves (AB-16).
        const erps = payload?.erp && call.erp ? [call.erp] : call.erps;
        const undeployed = erps.find((erp) => erp.status !== 'deployed');
        if (erps.length === 0 || undeployed || call.integration.status !== 'deployed') {
            const error = `"${call.integration.name ?? call.id}" and its ERPs must all be deployed to load demo data.`;
            return { success: false, error, code: ErrorCode.INVALID_OPERATION };
        }
        if (!context.authManager) {
            return { success: false, error: 'Adobe sign-in required to load demo data into the ERP.', code: ErrorCode.AUTH_REQUIRED };
        }
        const authManager = context.authManager;
        const erpName = erps.length === 1 ? (erps[0].name ?? 'ERP') : `${call.integration.name ?? call.id}'s ERPs`;
        const outcome = await withOperationProgress(
            { id: call.id, title: `Loading demo data into ${erpName}`, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: `${erpName} records` },
            async (report): Promise<FillOutcome> => {
                const refused = await guardOrBlock(context, call.project, (message) => report(message));
                if (refused) return refused;
                const loaded: NonNullable<FillOutcome['loaded']> = [];
                for (const erp of erps) {
                    const name = erp.name ?? erp.id;
                    const onProgress = (step: string) =>
                        report(OPERATION_STAGES.loadingErpDemoData.label, erps.length > 1 ? `${name}: ${step}` : step);
                    const filled = await fillErpForProject(call.project, call.id, { authManager, getAuth: async () => call.auth, onProgress }, erp.id);
                    if (filled.status === 'failed') {
                        return { success: false, error: `Loading demo data into ${name} did not finish: ${filled.detail}` };
                    }
                    loaded.push({ erp: erp.id, name, result: filled.result, ...(filled.note ? { note: filled.note } : {}) });
                }
                return { success: true, loaded };
            },
        );
        if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error };
        const loaded = outcome.loaded ?? [];
        // Prices not published after a fill that stood: said, never a failure (AB-26z).
        const warning = fillNotes(loaded);
        return { success: true, data: { id: call.id, erp: shapeErpRow(erps[0]), loaded: loadedAnswer(loaded), ...(warning ? { warning } : {}) } };
    },
    (payload) => payload?.id ?? '',
);

/**
 * One ERP's result as before (an agent reads `loaded.partners`); several, each by its ERP.
 * A note is answered once, as the `warning`, not again inside each row.
 */
function loadedAnswer(loaded: NonNullable<FillOutcome['loaded']>): unknown {
    if (loaded.length === 1) return loaded[0].result;
    return loaded.map(({ erp, name, result }) => ({ erp, name, result }));
}
