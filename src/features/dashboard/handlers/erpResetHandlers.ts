/**
 * The ERP integration's reset verb on the dashboard (plan step 05, decision 6):
 *
 * - `resetErpRecords` — close off the ERPs' orders and undo the ledgered Commerce
 *   writes (the integration's `erp/detach` with `closeOrders`, AB-16n), wipe every
 *   ERP it serves (each one's `admin/wipe`), then fill each from Commerce as it
 *   stands (`fillErpForProject`, AB-26y). Guards → progress → the calls. Commerce
 *   orders keep nothing of the ERP's after it; the ERP's order numbers continue
 *   where they were.
 *
 * Split from `erpIntegrationHandlers.ts`: reset is a single, non-resumable
 * multi-step flow with its own progress and guard machinery, a different reason
 * to change from the read/open verbs it lived beside.
 *
 * @module features/dashboard/handlers/erpResetHandlers
 */

import { guardOrBlock, type GuardableResult } from './appBuilderComponentHandlers';
import { errorText, openErpCall, shapeErpRow, type ErpCall, type ErpCallPayload } from './erpCall';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import {
    ErpIntegrationClient,
    callErpApi,
    type ErpDetachReport,
} from '@/features/app-builder/services/erpIntegrationClient';
import {
    fillErpForProject,
    fillNotes,
    type ErpFillForProjectResult,
} from '@/features/project-creation/services/erpFillForProject';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/**
 * What a reset did: the integration's Commerce writes undone, then each ERP wiped and filled
 * again, its prices published. `warning`: prices a fill could not publish (AB-26z).
 */
interface ErpResetReport {
    undone: ErpDetachReport;
    erps: Array<{ id: string; name: string; wiped: unknown; loaded: ErpFillForProjectResult }>;
    warning?: string;
}

/**
 * The reset's steps, in order, none resumable part-way: the integration undoes what it wrote
 * into Commerce (its `erp/detach`), then each ERP reset deletes its records (its own
 * `admin/wipe`) and Demo Builder fills it from Commerce again (`fillErpForProject`, AB-26y),
 * which ends by publishing that ERP's prices (AB-26z). Always every ERP the integration serves:
 * a split order spans ERPs, so resetting one left half an order pointing at sales orders that
 * no longer existed (owner, 2026-09-28, AB-16n). Throws in the words of the step that stopped.
 */
async function resetErp(
    context: HandlerContext,
    call: ErpCall,
    report: (stage: string, step?: string) => void,
): Promise<ErpResetReport> {
    const stage = OPERATION_STAGES.resettingErpRecords.label;
    report(stage, "Closing off the ERPs' orders and undoing their writes in Commerce");
    const undone = await closeOffAndDetach(
        new ErpIntegrationClient(call.integration.deployedUrls, call.auth),
        call,
        (step) => report(stage, step),
    );
    if (!context.authManager) throw new Error('Adobe sign-in required.');
    const authManager = context.authManager;
    const erps: ErpResetReport['erps'] = [];
    const notes: Array<{ name: string; note?: string }> = [];
    for (const erp of call.erps) {
        const name = erp.name ?? erp.id;
        report(stage, `Wiping ${name}`);
        const wipe = await callErpApi(erp.deployedUrls, call.auth, 'POST', 'admin/wipe', undefined);
        if ('refusal' in wipe) throw new Error(`${name}: ${wipe.refusal}`);
        if (!wipe.ok) throw new Error(`${name}'s wipe answered ${wipe.status}: ${wipe.detail}`);
        const filled = await fillErpForProject(
            call.project,
            call.id,
            {
                authManager,
                getAuth: async () => call.auth,
                onProgress: (step) =>
                    report(OPERATION_STAGES.loadingErpDemoData.label, `${name}: ${step}`),
            },
            erp.id,
        );
        if (filled.status === 'failed')
            throw new Error(`${name} was wiped but not filled again: ${filled.detail}`);
        erps.push({
            id: erp.id,
            name,
            wiped: (wipe.body as { wiped?: unknown }).wiped,
            loaded: filled.result,
        });
        notes.push({ name, note: filled.note });
    }
    const warning = fillNotes(notes);
    return warning ? { undone, erps, warning } : { undone, erps };
}

/**
 * Close off every order the ERPs hold, then undo their writes (AB-16n): the integration's
 * `erp/detach` with `closeOrders`. A deployment from before it would ignore the option and
 * leave orders open that point at sales orders the wipe removes, so it is asked first and
 * refused; an answer without `closed` stops the reset before any wipe. So does an answer
 * that closed SOME orders and failed on others (Commerce timed out cancelling one, say):
 * wiping then would leave exactly the half-an-order this step exists to prevent, under a
 * green toast (review, 2026-09-30). Nothing is wiped on a refusal, so the reset is simply
 * run again once the named orders are dealt with. An undo that outlives its 60-second
 * answer is followed by the client to its end (`erpDetachRun`, AB-61); `onProgress` gets
 * the one line it says while it does.
 */
async function closeOffAndDetach(
    client: ErpIntegrationClient,
    call: ErpCall,
    onProgress: (step: string) => void,
): Promise<ErpDetachReport> {
    const name = call.integration.name ?? call.id;
    if ((await client.status()).closesOrdersOnReset !== true) {
        throw new Error(`${name} cannot close off orders on a reset. Update it, then reset again.`);
    }
    const undone = await client.detach({ closeOrders: true }, onProgress);
    if (!undone.closed) {
        throw new Error(
            `${name} did not close off the orders; nothing was wiped. Update it, then reset again.`,
        );
    }
    if (undone.closed.failed.length > 0) {
        const named = undone.closed.failed.map((f) => `${f.orderId} (${f.error})`).join(', ');
        throw new Error(
            `${name} could not close off ${undone.closed.failed.length} order(s): ${named}. ` +
                'Nothing was wiped; cancel or finish them in Commerce, then reset again.',
        );
    }
    return undone;
}

/**
 * Handle 'resetErpRecords' — undo, wipe and fill, under the guard chain and
 * wherever the SC is looking. Answers what each step did (`undone`, `wiped`,
 * `loaded`).
 *
 * Pressed on the integrations screen, so it belongs in that screen's progress
 * modal like every other card action; it was still opening a notification of its
 * own (owner, 2026-09-20).
 */
export const handleResetErpRecords: MessageHandler<ErpCallPayload & { progress?: 'modal' }> =
    narrateOutcomeToModal(
        async (context, payload): Promise<HandlerResponse> => {
            const call = await openErpCall(context, payload, 'reset the ERP');
            if ('error' in call) return call.error;
            if (call.integration.status !== 'deployed') {
                const error = `"${call.integration.name ?? call.id}" is not deployed, so there is nothing to reset through.`;
                return { success: false, error, code: ErrorCode.INVALID_OPERATION };
            }

            // Always every ERP the integration serves (AB-16n): a split order spans ERPs.
            const erpName =
                call.erps.length > 1
                    ? `${call.integration.name ?? call.id}'s ERPs`
                    : (call.erp?.name ?? 'ERP');
            const result = await withOperationProgress(
                {
                    id: call.id,
                    title: `Resetting ${erpName} records`,
                    inModal: progressSurfaceOf(payload) === 'modal',
                    cardLabel: `${erpName} records`,
                },
                async (report): Promise<GuardableResult & { report?: ErpResetReport }> => {
                    const refused = await guardOrBlock(context, call.project, (message) =>
                        report(message),
                    );
                    if (refused) return refused;
                    try {
                        return {
                            success: true,
                            report: await resetErp(context, call, report),
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: `The ERP reset did not finish: ${errorText(error)}`,
                        };
                    }
                },
            );
            if (result.blocked || !result.success) {
                return { success: false, error: result.error };
            }
            // Prices a fill could not publish: said beside the report, never a failed reset (AB-26z).
            const warning = result.report?.warning;
            const report = result.report && {
                undone: result.report.undone,
                erps: result.report.erps,
            };
            return {
                success: true,
                data: {
                    id: call.id,
                    erp: shapeErpRow(call.erp),
                    report,
                    ...(warning ? { warning } : {}),
                },
            };
        },
        (payload) => payload?.id ?? '',
    );
