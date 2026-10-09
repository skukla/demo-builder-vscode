/**
 * "Assign products" on an ERP's card, and its undo (AB-74): `getErpAssignOptions` (what the
 * modal opens with), `assignErpProducts` (preview without `confirm`; with it, the bulk write
 * of `erp_owner`, followed to its end, then the ownership pass) and `undoErpAssignment` (the
 * same, putting back the values recorded before). The agent's `assign_erp_products` dispatches
 * into the same handler. What is recorded and for how long is said in
 * `erpAssignProducts.ts`.
 *
 * Guards → progress → the work, the shape `loadErpDemoData` has. A refusal before the work is
 * an answer, never a dialog, so the agent surface can serve it headless.
 *
 * @module features/dashboard/handlers/erpAssignHandlers
 */

import { guardOrBlock, postComponentsSnapshot, type GuardableResult } from './appBuilderComponentHandlers';
import { openErpCall, sentence, shapeErpRow, type ErpCall } from './erpCall';
import { setAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress, type ReportStage } from '@/core/vscode/withOperationProgress';
import type { BulkFollowDeps } from '@/features/app-builder/services/commerceBulk';
import { selectionProblem } from '@/features/app-builder/services/erpAssignSelection';
import {
    assignmentRecord,
    openCommerce,
    planErpAssignment,
    planUndo,
    readErpAssignOptions,
    writeOwnerValues,
    type CommerceClient,
    type ErpAssignDeps,
    type ErpAssignTarget,
} from '@/features/project-creation/services/erpAssignProducts';
import { applyErpOwnership } from '@/features/project-creation/services/erpOwnershipReconcile';
import type { AppBuilderComponentState } from '@/types/base';
import type { CommerceBulkOutcome, ErpAssignmentRecord, ErpAssignPreview, ErpProductSelection } from '@/types/erpAssign';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { ErpAssignRequestPayload } from '@/types/webviewRequests';

/** The ERP, the integration, Commerce and the sign-in, resolved; or the refusal. */
interface Opened {
    call: ErpCall;
    target: ErpAssignTarget;
    deps: ErpAssignDeps;
    erpState: AppBuilderComponentState;
}

/** Resolve the named, deployed ERP and open Commerce. `verb` words the sign-in refusal. */
async function openAssign(
    context: HandlerContext,
    payload: ErpAssignRequestPayload | undefined,
    verb: string,
): Promise<Opened | { error: HandlerResponse }> {
    if (!payload?.erp) {
        return { error: { success: false, error: 'Name the ERP (erp) to assign products to.', code: ErrorCode.CONFIG_INVALID } };
    }
    const call = await openErpCall(context, payload, verb);
    if ('error' in call) return call;
    const erp = call.erp;
    if (!erp || erp.status !== 'deployed' || call.integration.status !== 'deployed') {
        const error = `"${call.integration.name ?? call.id}" and ${erp?.name ?? 'the ERP'} must both be deployed to ${verb}.`;
        return { error: { success: false, error, code: ErrorCode.INVALID_OPERATION } };
    }
    if (!context.authManager) {
        return { error: { success: false, error: `Adobe sign-in required to ${verb}.`, code: ErrorCode.AUTH_REQUIRED } };
    }
    const commerce = await openCommerce(call.project, context.authManager);
    if ('refusal' in commerce) return { error: { success: false, error: commerce.refusal, code: ErrorCode.CONFIG_INVALID } };
    return {
        call,
        target: { project: call.project, integrationId: call.id, erpId: erp.id },
        deps: { auth: call.auth, commerce },
        erpState: erp,
    };
}

/** A read that threw, as an answer. */
function readFailed(verb: string, error: unknown): HandlerResponse {
    return { success: false, error: `Could not ${verb}: ${error instanceof Error ? error.message : String(error)}` };
}

/** Handle 'getErpAssignOptions' — what the modal opens with. Reads only. */
export const handleGetErpAssignOptions: MessageHandler<ErpAssignRequestPayload> = async (context, payload) => {
    const opened = await openAssign(context, payload, 'assign products');
    if ('error' in opened) return opened.error;
    try {
        return { success: true, data: await readErpAssignOptions(opened.target, opened.deps) };
    } catch (error) {
        return readFailed('read the products', error);
    }
};

/** How the follow waits: every few seconds, for at most ten minutes. */
function followDeps(report: ReportStage, stage: string): BulkFollowDeps {
    return {
        sleep,
        now: () => Date.now(),
        intervalMs: TIMEOUTS.COMMERCE_BULK_POLL_INTERVAL,
        deadlineMs: TIMEOUTS.COMMERCE_BULK_MAX,
        onProgress: (done, total) => report(stage, `${done} of ${total} products saved`),
    };
}

/** What did not go right in the write, in words; the write that did land stands. */
function bulkNotes(outcome: CommerceBulkOutcome): string[] {
    const notes: string[] = [];
    if (outcome.failed.length > 0) {
        const first = outcome.failed[0].message;
        notes.push(`Commerce refused ${outcome.failed.length} of ${outcome.total} product saves (first: ${sentence(first)})`);
    }
    if (outcome.timedOut) {
        notes.push(`${outcome.open} product saves were still queued in Commerce when Demo Builder stopped waiting; they finish by themselves. Run Load demo data once they have.`);
    }
    return notes;
}

/** The preview's leftovers, in words: what was not written and why. */
function previewNotes(preview: ErpAssignPreview): string[] {
    const notes: string[] = [];
    if (preview.outsideSets.count > 0) {
        const sets = preview.outsideSets.sets.map((set) => set.name).join(', ');
        notes.push(`${preview.outsideSets.count} products were not written: their attribute set (${sets}) has no erp_owner. Add it, then assign again.`);
    }
    if (preview.unknownSkus.length > 0) {
        notes.push(`Commerce has no enabled product for ${preview.unknownSkus.slice(0, 5).join(', ')}${preview.unknownSkus.length > 5 ? ' and more' : ''}.`);
    }
    return notes;
}

/** Save the ERP's record (or remove it) on the project. */
async function saveErpRecord(context: HandlerContext, opened: Opened, record: AppBuilderComponentState['erpAssignment']): Promise<void> {
    const { erpAssignment: _old, ...rest } = opened.erpState;
    const next: AppBuilderComponentState = record ? { ...rest, erpAssignment: record } : rest;
    await context.stateManager.saveProject(setAppBuilderComponent(opened.target.project, opened.target.erpId, next));
}

type AssignOutcome = GuardableResult & {
    warning?: string;
    note?: string;
    written?: number;
    bulk?: CommerceBulkOutcome;
    preview?: ErpAssignPreview;
    ownership?: unknown;
};

/** The ownership pass after a write, and its notes; the write stands whatever it says. */
async function passAfterWrite(context: HandlerContext, opened: Opened, report: ReportStage): Promise<{ notes: string[]; ownership?: unknown }> {
    if (!context.authManager) return { notes: [] };
    const applied = await applyErpOwnership(
        opened.target.project,
        opened.call.id,
        {
            authManager: context.authManager,
            getAuth: async () => opened.call.auth,
            onProgress: (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step),
        },
        'assign',
    );
    if (applied.status === 'failed') return { notes: [`The ERPs were not filled with what they now own: ${sentence(applied.detail)} Use Load demo data.`] };
    return {
        notes: applied.notes,
        ownership: { erps: applied.erps.map((erp) => ({ erp: erp.erp, name: erp.name, owns: erp.ownsNow })), unowned: applied.unowned },
    };
}

/** The confirmed assignment: plan, write, follow, record, then the ownership pass. */
async function runAssign(
    context: HandlerContext,
    opened: Opened,
    payload: ErpAssignRequestPayload,
    selection: ErpProductSelection,
    report: ReportStage,
): Promise<AssignOutcome> {
    const refused = await guardOrBlock(context, opened.target.project, (message) => report(message), progressSurfaceOf(payload));
    if (refused) return refused;
    report(OPERATION_STAGES.assigningErpProducts.label, 'Reading the products and each ERP\'s rule');
    const plan = await planErpAssignment(opened.target, opened.deps, selection);
    if ('refusal' in plan) return { success: false, error: plan.refusal };
    const { preview, toWrite, value } = plan;
    if (toWrite.length === 0) {
        const notes = previewNotes(preview);
        return { success: true, preview, written: 0, note: [`Nothing to write: ${preview.alreadyTagged} of the ${preview.matched} products already belong to ${opened.call.erp?.name}.`, ...notes].join(' ') };
    }
    const stage = OPERATION_STAGES.assigningErpProducts.label;
    report(stage, `Writing erp_owner=${value} on ${toWrite.length} products`);
    const bulk = await writeOwnerValues(opened.deps.commerce, toWrite.map((row) => ({ sku: row.sku, value })), followDeps(report, stage));
    await saveErpRecord(context, opened, assignmentRecord(toWrite, value, new Date().toISOString()));
    const pass = await passAfterWrite(context, opened, report);
    const warning = [...bulkNotes(bulk), ...previewNotes(preview), ...pass.notes].join(' ');
    return { success: true, preview, bulk, written: bulk.complete, ownership: pass.ownership, ...(warning ? { warning } : {}) };
}

/** The answer an operation gives, once the modal has had its end. */
function answerOf(opened: Opened, outcome: AssignOutcome, extra: Record<string, unknown> = {}): HandlerResponse {
    if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error, code: outcome.code };
    return {
        success: true,
        data: {
            id: opened.call.id,
            erp: shapeErpRow(opened.call.erp),
            confirmed: true,
            ...extra,
            ...(outcome.preview ? { preview: outcome.preview } : {}),
            written: outcome.written ?? 0,
            ...(outcome.bulk ? { bulk: { uuid: outcome.bulk.uuid, total: outcome.bulk.total, complete: outcome.bulk.complete, failed: outcome.bulk.failed.length, open: outcome.bulk.open, timedOut: outcome.bulk.timedOut } } : {}),
            ...(outcome.ownership ? { ownership: outcome.ownership } : {}),
            ...(outcome.warning ? { warning: outcome.warning } : {}),
            ...(outcome.note ? { note: outcome.note } : {}),
        },
    };
}

/**
 * Handle 'assignErpProducts' — without `confirm`, the preview: how many products the selection
 * matches, a few SKUs, which ERP owns them today, what cannot be written and why. With it, the
 * write, in the screen's progress modal when the screen started it.
 */
export const handleAssignErpProducts: MessageHandler<ErpAssignRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const selection = payload?.selection;
        const problem = selectionProblem(selection);
        if (problem || !selection) return { success: false, error: problem, code: ErrorCode.CONFIG_INVALID };
        const opened = await openAssign(context, payload, 'assign products');
        if ('error' in opened) return opened.error;
        if (payload?.confirm !== true) {
            try {
                const plan = await planErpAssignment(opened.target, opened.deps, selection);
                if ('refusal' in plan) return { success: false, error: plan.refusal, code: ErrorCode.INVALID_OPERATION };
                return { success: true, data: { preview: plan.preview, confirmed: false } };
            } catch (error) {
                return readFailed('read the products', error);
            }
        }
        const name = opened.call.erp?.name ?? 'the ERP';
        const outcome = await withOperationProgress(
            { id: opened.call.id, title: `Assigning products to ${name}`, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: `Assigning products to ${name}` },
            async (report) => runAssign(context, opened, payload, selection, report).catch((error: unknown) => readFailed('assign the products', error) as AssignOutcome),
        );
        await postComponentsSnapshot(context);
        return answerOf(opened, outcome);
    },
    (payload) => payload?.id ?? '',
);

/** The confirmed undo: plan against Commerce as it stands, write the values back, then the pass. */
async function runUndo(
    context: HandlerContext,
    opened: Opened,
    payload: ErpAssignRequestPayload,
    record: ErpAssignmentRecord,
    report: ReportStage,
): Promise<AssignOutcome> {
    const refused = await guardOrBlock(context, opened.target.project, (message) => report(message), progressSurfaceOf(payload));
    if (refused) return refused;
    const stage = OPERATION_STAGES.assigningErpProducts.label;
    report(stage, 'Reading which products still carry the assignment');
    const plan = await planUndo(opened.deps.commerce, record);
    const changed = plan.changedSince.length > 0
        ? [`${plan.changedSince.length} products were left as they are: their erp_owner has changed since the assignment.`]
        : [];
    let bulk: CommerceBulkOutcome | undefined;
    if (plan.restore.length > 0) {
        report(stage, `Putting back the erp_owner of ${plan.restore.length} products`);
        bulk = await writeOwnerValues(opened.deps.commerce, plan.restore, followDeps(report, stage));
    }
    await saveErpRecord(context, opened, undefined);
    const pass = bulk ? await passAfterWrite(context, opened, report) : { notes: [] };
    const warning = [...(bulk ? bulkNotes(bulk) : []), ...changed, ...pass.notes].join(' ');
    const written = bulk ? bulk.complete : 0;
    return { success: true, bulk, written, ownership: pass.ownership, ...(warning ? { warning } : {}) };
}

/** Commerce's products as the undo would find them: the plan, for the preview. */
async function previewUndo(record: ErpAssignmentRecord, commerce: CommerceClient): Promise<HandlerResponse> {
    const plan = await planUndo(commerce, record);
    return {
        success: true,
        data: { confirmed: false, assignedAt: record.at, value: record.value, restore: plan.restore.length, changedSince: plan.changedSince.length, examples: plan.restore.slice(0, 5).map((entry) => entry.sku) },
    };
}

/**
 * Handle 'undoErpAssignment' — put back the `erp_owner` each product had before the ERP's last
 * assignment, on the products that still carry the value written, then run the ownership
 * pass. Without `confirm`, what it would put back.
 */
export const handleUndoErpAssignment: MessageHandler<ErpAssignRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const opened = await openAssign(context, payload, 'undo the assignment');
        if ('error' in opened) return opened.error;
        const record = opened.erpState.erpAssignment;
        if (!record) {
            return { success: false, error: `${opened.call.erp?.name ?? 'The ERP'} has no assignment to undo.`, code: ErrorCode.INVALID_OPERATION };
        }
        if (payload?.confirm !== true) {
            try {
                return await previewUndo(record, opened.deps.commerce);
            } catch (error) {
                return readFailed('read the products', error);
            }
        }
        const name = opened.call.erp?.name ?? 'the ERP';
        const outcome = await withOperationProgress(
            { id: opened.call.id, title: `Undoing ${name}'s last assignment`, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: `Undoing ${name}'s assignment` },
            async (report) => runUndo(context, opened, payload, record, report).catch((error: unknown) => readFailed('undo the assignment', error) as AssignOutcome),
        );
        await postComponentsSnapshot(context);
        return answerOf(opened, outcome, { undone: true });
    },
    (payload) => payload?.id ?? '',
);
