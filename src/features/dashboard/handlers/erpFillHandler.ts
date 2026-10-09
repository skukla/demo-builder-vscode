/**
 * `loadErpDemoData` — Demo Builder fills the ERP from Commerce (AB-26y step 1): the ERP
 * gets Commerce's products, companies and structure, sorted by the integration's settings,
 * through the ERP's ordinary import. The copy was the integration's job until 2026-09-27;
 * it is demo setup, so it is Demo Builder's. The fill itself is `fillErpForProject`, the
 * same path an add takes once the integration is installed.
 *
 * Guards → progress → the fill, the shape `resetErpRecords` has. Adding records never
 * removes any: a record already in the ERP is updated in place. Each fill ends with the
 * integration's unset website mappings filled from the ERP's own sales organizations (the
 * answer's `mapping`, AB-26y) and the ERP's prices published into the companies' shared
 * catalogs (AB-26z); a mapping not saved or prices not published are the answer's `warning`,
 * and the fill still stands.
 *
 * @module features/dashboard/handlers/erpFillHandler
 */

import { guardOrBlock, type GuardableResult } from './appBuilderComponentHandlers';
import { openErpCall, shapeErpRow, type ErpCallPayload } from './erpCall';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { mergeMappings, type ErpMappingReport } from '@/features/app-builder/services/erpFillMapping';
import { fillNotes, type ErpFillForProjectResult } from '@/features/project-creation/services/erpFillForProject';
import { applyErpOwnership } from '@/features/project-creation/services/erpOwnershipReconcile';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse, MessageHandler } from '@/types/handlers';

type FillOutcome = GuardableResult & {
    /** Prices a fill could not publish: the progress window's last word (AB-26z). */
    warning?: string;
    loaded?: Array<{ erp: string; name: string; result: ErpFillForProjectResult; note?: string }>;
    /** The website mappings the fills filled and kept (AB-26y); absent when none ran the step. */
    mapping?: ErpMappingReport;
};

/**
 * Handle 'loadErpDemoData' — apply ownership across the ERPs an integration serves (AB-70):
 * every ERP filled from Commerce as it stands with what it owns, what an ERP no longer owns
 * marked discontinued there. Since 2026-10-09 a load from one ERP's card runs the same pass:
 * ownership is one rule across the ERPs, and a load into one that left the others alone was
 * how a first ERP kept 321 products its rule no longer gave it. The answer still names the
 * ERP the card asked for first.
 */
export const handleLoadErpDemoData: MessageHandler<ErpCallPayload & { progress?: 'modal' }> =
    narrateOutcomeToModal(
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
                return {
                    success: false,
                    error: 'Adobe sign-in required to load demo data into the ERP.',
                    code: ErrorCode.AUTH_REQUIRED,
                };
            }
            const authManager = context.authManager;
            const erpName =
                erps.length === 1
                    ? (erps[0].name ?? 'ERP')
                    : `${call.integration.name ?? call.id}'s ERPs`;
            const outcome = await withOperationProgress(
                {
                    id: call.id,
                    title: `Loading demo data into ${erpName}`,
                    inModal: progressSurfaceOf(payload) === 'modal',
                    cardLabel: `${erpName} records`,
                },
                async (report): Promise<FillOutcome> => {
                    const refused = await guardOrBlock(context, call.project, (message) =>
                        report(message),
                    );
                    if (refused) return refused;
                    const onProgress = (step: string) => report(OPERATION_STAGES.loadingErpDemoData.label, step);
                    const applied = await applyErpOwnership(
                        call.project,
                        call.id,
                        { authManager, getAuth: async () => call.auth, onProgress },
                        'load',
                    );
                    if (applied.status === 'failed') {
                        return { success: false, error: `Loading demo data into ${erpName} did not finish: ${applied.detail}` };
                    }
                    const failed = applied.fills.find((fill) => fill.status === 'failed');
                    if (failed && failed.status === 'failed') {
                        return {
                            success: false,
                            error: `Loading demo data into ${failed.name} did not finish: ${failed.detail}`,
                        };
                    }
                    const loaded: NonNullable<FillOutcome['loaded']> = [];
                    const mappings: Array<ErpMappingReport | undefined> = [];
                    for (const fill of applied.fills) {
                        if (fill.status !== 'filled') continue;
                        loaded.push({ erp: fill.erp, name: fill.name, result: fill.result, ...(fill.note ? { note: fill.note } : {}) });
                        mappings.push(fill.mapping);
                    }
                    // A mapping not saved, prices not published, after a fill that stood, and what
                    // the ownership pass says the SC still has to do: said, never a failure.
                    const warning = [fillNotes(loaded), ...applied.notes].filter(Boolean).join(' ') || undefined;
                    const mapping = mergeMappings(mappings);
                    return {
                        success: true,
                        loaded: payload?.erp ? [...loaded].sort((a) => (a.erp === call.erp?.id ? -1 : 0)) : loaded,
                        ...(mapping ? { mapping } : {}),
                        ...(warning ? { warning } : {}),
                    };
                },
            );
            if (outcome.blocked || !outcome.success)
                return { success: false, error: outcome.error };
            const loaded = outcome.loaded ?? [];
            const { warning, mapping } = outcome;
            return {
                success: true,
                data: {
                    id: call.id,
                    erp: shapeErpRow(erps[0]),
                    loaded: loadedAnswer(loaded),
                    ...(mapping ? { mapping } : {}),
                    ...(warning ? { warning } : {}),
                },
            };
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
