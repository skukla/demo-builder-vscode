/**
 * `loadErpDemoData` — Demo Builder fills the ERP from Commerce (AB-26y step 1): the ERP
 * gets Commerce's products, companies and structure, sorted by the integration's settings,
 * through the ERP's ordinary import. The copy was the integration's job until 2026-09-27;
 * it is demo setup, so it is Demo Builder's. The fill itself is `fillErpForProject`, the
 * same path an add takes once the integration is installed.
 *
 * Guards → progress → the fill, the shape `resetErpRecords` has. Adding records never
 * removes any: a record already in the ERP is updated in place.
 *
 * @module features/dashboard/handlers/erpFillHandler
 */

import { guardOrBlock, type GuardableResult } from './appBuilderComponentHandlers';
import { openErpCall, shapeErpRow } from './erpIntegrationHandlers';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import type { ErpFillResult } from '@/features/app-builder/services/erpFill';
import { fillErpForProject } from '@/features/project-creation/services/erpFillForProject';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';

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
        if (!context.authManager) {
            return { success: false, error: 'Adobe sign-in required to load demo data into the ERP.', code: ErrorCode.AUTH_REQUIRED };
        }
        const authManager = context.authManager;
        const erpName = erp.name ?? 'ERP';
        const outcome = await withOperationProgress(
            { id: call.id, title: `Loading demo data into ${erpName}`, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: `${erpName} records` },
            async (report): Promise<FillOutcome> => {
                const refused = await guardOrBlock(context, call.project, (message) => report(message));
                if (refused) return refused;
                const filled = await fillErpForProject(call.project, call.id, {
                    authManager,
                    getAuth: async () => call.auth,
                    onProgress: (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step),
                });
                return filled.status === 'filled'
                    ? { success: true, result: filled.result }
                    : { success: false, error: `Loading demo data did not finish: ${filled.detail}` };
            },
        );
        if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error };
        return { success: true, data: { id: call.id, erp: shapeErpRow(erp), loaded: outcome.result } };
    },
    (payload) => payload?.id ?? '',
);
