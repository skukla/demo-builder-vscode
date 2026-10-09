/**
 * The fix the `erp-attributes-exist` setup check offers, and its undo (AB-74):
 * `addErpOwnerToAttributeSets` adds `erp_owner` to every attribute set the store's products
 * use that lacks it; `removeErpOwnerFromAttributeSets` takes it out of the sets Demo Builder
 * added it to. Without `confirm` each answers which sets it would change. The agent's
 * `add_erp_owner_to_attribute_sets` dispatches into the first.
 *
 * What is recorded: the sets added to, on the ERP integration's component record
 * (`erpOwnerSets`), merged with any earlier addition, until the undo or the integration's
 * removal. The undo refuses while a product in one of those sets carries an `erp_owner`
 * value: taking the attribute out from under a tagged product would lose the tag, and the
 * way back is "Undo last assignment" on the ERP first.
 *
 * @module features/dashboard/handlers/erpOwnerSetsHandlers
 */

import { guardOrBlock, postComponentsSnapshot, type GuardableResult } from './appBuilderComponentHandlers';
import { openErpCall, type ErpCall } from './erpCall';
import { setAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress, type ReportStage } from '@/core/vscode/withOperationProgress';
import { listAssignableProducts } from '@/features/app-builder/services/erpAssignSelection';
import {
    addOwnerToSets,
    readProductSets,
    removeOwnerFromSets,
    setsWithoutOwner,
    type SetsChanged,
} from '@/features/app-builder/services/erpOwnerAttributeSets';
import { openCommerce, type CommerceClient } from '@/features/project-creation/services/erpAssignProducts';
import type { AppBuilderComponentState } from '@/types/base';
import type { ErpOwnerSetsRecord } from '@/types/erpAssign';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { ErpOwnerSetsRequestPayload } from '@/types/webviewRequests';

interface Opened {
    call: ErpCall;
    commerce: CommerceClient;
}

/** The ERP integration and Commerce, or the refusal. */
async function openSets(context: HandlerContext, payload: ErpOwnerSetsRequestPayload | undefined, verb: string): Promise<Opened | { error: HandlerResponse }> {
    const call = await openErpCall(context, { id: payload?.id }, verb);
    if ('error' in call) return call;
    if (!context.authManager) {
        return { error: { success: false, error: `Adobe sign-in required to ${verb}.`, code: ErrorCode.AUTH_REQUIRED } };
    }
    const commerce = await openCommerce(call.project, context.authManager);
    if ('refusal' in commerce) return { error: { success: false, error: commerce.refusal, code: ErrorCode.CONFIG_INVALID } };
    return { call, commerce };
}

/** Save the integration's record, or remove it when no set is left in it. */
async function saveRecord(context: HandlerContext, call: ErpCall, record: ErpOwnerSetsRecord | undefined): Promise<void> {
    const { erpOwnerSets: _old, ...rest } = call.integration;
    const next: AppBuilderComponentState = record && record.sets.length > 0 ? { ...rest, erpOwnerSets: record } : rest;
    await context.stateManager.saveProject(setAppBuilderComponent(call.project, call.id, next));
}

/** The earlier addition and this one, one row per set. */
function merged(previous: ErpOwnerSetsRecord | undefined, added: SetsChanged['changed']): ErpOwnerSetsRecord {
    const sets = new Map((previous?.sets ?? []).map((set) => [set.id, set]));
    for (const set of added) sets.set(set.id, set);
    return { at: new Date().toISOString(), sets: [...sets.values()] };
}

type SetsOutcome = GuardableResult & { changed?: SetsChanged['changed']; warning?: string };

/** Run a set change inside the progress, guarded. */
async function inProgress(
    context: HandlerContext,
    opened: Opened,
    payload: ErpOwnerSetsRequestPayload | undefined,
    title: string,
    work: (report: ReportStage) => Promise<SetsOutcome>,
): Promise<SetsOutcome> {
    return withOperationProgress(
        { id: opened.call.id, title, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: title },
        async (report) => {
            const refused = await guardOrBlock(context, opened.call.project, (message) => report(message), progressSurfaceOf(payload));
            if (refused) return refused;
            report(OPERATION_STAGES.changingAttributeSets.label);
            return work(report);
        },
    );
}

/** The answer once the work ran. */
function answerOf(outcome: SetsOutcome, verb: 'added' | 'removed'): HandlerResponse {
    if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error, code: outcome.code };
    return { success: true, data: { confirmed: true, [verb]: outcome.changed ?? [], ...(outcome.warning ? { warning: outcome.warning } : {}) } };
}

/**
 * Handle 'addErpOwnerToAttributeSets' — add `erp_owner` to the sets the products use that lack
 * it. Without `confirm`, which sets those are.
 */
export const handleAddErpOwnerToAttributeSets: MessageHandler<ErpOwnerSetsRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const opened = await openSets(context, payload, 'change the attribute sets');
        if ('error' in opened) return opened.error;
        let missing;
        try {
            missing = await setsWithoutOwner(opened.commerce.get, await readProductSets(opened.commerce.get));
        } catch (error) {
            return { success: false, error: `Could not read the attribute sets: ${error instanceof Error ? error.message : String(error)}` };
        }
        if (payload?.confirm !== true || missing.length === 0) {
            return { success: true, data: { confirmed: false, setsWithoutOwner: missing } };
        }
        const outcome = await inProgress(context, opened, payload, 'Adding erp_owner to attribute sets', async (report) => {
            report(OPERATION_STAGES.changingAttributeSets.label, `Adding erp_owner to ${missing.length} sets`);
            const result = await addOwnerToSets(opened.commerce.get, opened.commerce.send, missing);
            if (result.changed.length > 0) await saveRecord(context, opened.call, merged(opened.call.integration.erpOwnerSets, result.changed));
            if (result.error && result.changed.length === 0) return { success: false, error: `Commerce refused: ${result.error}` };
            return { success: true, changed: result.changed, ...(result.error ? { warning: `Stopped at ${result.error}` } : {}) };
        });
        await postComponentsSnapshot(context);
        return answerOf(outcome, 'added');
    },
    (payload) => payload?.id ?? '',
);

/** Products in the recorded sets that carry an `erp_owner` value; the undo waits for none. */
async function taggedInSets(commerce: CommerceClient, record: ErpOwnerSetsRecord): Promise<number> {
    const ids = new Set(record.sets.map((set) => set.id));
    return (await listAssignableProducts(commerce.get)).filter((row) => ids.has(row.attributeSetId) && row.owner !== '').length;
}

/**
 * Handle 'removeErpOwnerFromAttributeSets' — the undo: take `erp_owner` out of the sets Demo
 * Builder added it to, while no product in them carries a value. Without `confirm`, which sets.
 */
export const handleRemoveErpOwnerFromAttributeSets: MessageHandler<ErpOwnerSetsRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const opened = await openSets(context, payload, 'change the attribute sets');
        if ('error' in opened) return opened.error;
        const record = opened.call.integration.erpOwnerSets;
        if (!record) return { success: false, error: 'Demo Builder has added erp_owner to no attribute set.', code: ErrorCode.INVALID_OPERATION };
        let tagged: number;
        try {
            tagged = await taggedInSets(opened.commerce, record);
        } catch (error) {
            return { success: false, error: `Could not read the products: ${error instanceof Error ? error.message : String(error)}` };
        }
        if (tagged > 0) {
            const error = `${tagged} products in those sets carry an erp_owner value. Undo their ERP's last assignment first, so no tag is lost.`;
            return { success: false, error, code: ErrorCode.INVALID_OPERATION };
        }
        if (payload?.confirm !== true) return { success: true, data: { confirmed: false, sets: record.sets } };
        const outcome = await inProgress(context, opened, payload, 'Removing erp_owner from attribute sets', async () => {
            const result = await removeOwnerFromSets(opened.commerce.send, record.sets);
            const left = record.sets.filter((set) => !result.changed.some((done) => done.id === set.id));
            await saveRecord(context, opened.call, { ...record, sets: left });
            if (result.error && result.changed.length === 0) return { success: false, error: `Commerce refused: ${result.error}` };
            return { success: true, changed: result.changed, ...(result.error ? { warning: `Stopped at ${result.error}` } : {}) };
        });
        await postComponentsSnapshot(context);
        return answerOf(outcome, 'removed');
    },
    (payload) => payload?.id ?? '',
);
