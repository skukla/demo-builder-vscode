/**
 * the demo setup's Apply and its undo (AB-77), and `setCommerceConfig`: the handlers behind the
 * integration card's menu, the setup guide's per-step Apply and Undo, and the agent's
 * `prepare_commerce_store`, `undo_commerce_store_preparation` and `set_commerce_config`.
 *
 * Without `confirm` each answers what it would change and writes nothing. With it: guards →
 * progress → the engine (`storePreparationEngine.ts`) → the record saved on the component →
 * the applied steps checked again, so the guide shows them done → the grid's snapshot.
 * A refusal before the work is an answer, never a dialog, so the agent surface serves it
 * headless.
 *
 * @module features/dashboard/handlers/storePreparationHandlers
 */

import { guardOrBlock, postComponentsSnapshot, type GuardableResult } from './appBuilderComponentHandlers';
import { openChecklist, type OpenedChecklist } from './setupChecklistHandlers';
import { setAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES, type OperationStage } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress, type ReportStage } from '@/core/vscode/withOperationProgress';
import { runSetupCheck } from '@/features/app-builder/services/setupChecks';
import { configFix } from '@/features/app-builder/services/storePreparation/configFix';
import {
    applyPreparation,
    previewPreparation,
    undoPreparation,
    type FreshChecks,
    type PreparationDeps,
    type PreparationOutcome,
} from '@/features/app-builder/services/storePreparation/storePreparationEngine';
import { erpNamesOf, setupCheckReader } from '@/features/dashboard/services/setupCheckReader';
import { recordsAfterRun } from '@/features/dashboard/services/setupStepRecords';
import { openCommerce, type CommerceClient } from '@/features/project-creation/services/erpAssignProducts';
import type { SetupConfigFixItem } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, SetupStepRecord } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { PreparationStepReport, StorePreparationRecord } from '@/types/storePreparation';
import type { OperationChange } from '@/types/webviewPayloads';
import type {
    PrepareStoreRequestPayload,
    SetCommerceConfigRequestPayload,
    UndoStorePreparationRequestPayload,
} from '@/types/webviewRequests';

interface Opened extends OpenedChecklist {
    commerce: CommerceClient;
    deps: PreparationDeps;
}

/** The integration, its steps, Commerce and the check reader; or the refusal. */
async function openPreparation(context: HandlerContext, idArg: unknown, verb: string): Promise<Opened | { error: HandlerResponse }> {
    const checklist = await openChecklist(context, idArg);
    if ('error' in checklist) return checklist;
    const { id, project } = checklist;
    if (!context.authManager) {
        return { error: { success: false, error: `Adobe sign-in required to ${verb}.`, code: ErrorCode.AUTH_REQUIRED } };
    }
    const commerce = await openCommerce(project, context.authManager, context.context?.secrets);
    if ('refusal' in commerce) return { error: { success: false, error: commerce.refusal, code: ErrorCode.CONFIG_INVALID } };
    const { read, scope } = await setupCheckReader(context, project);
    const erpNames = erpNamesOf(project, id);
    const deps: PreparationDeps = {
        commerce,
        websiteCode: scope.websiteCode,
        erpNames,
        runCheck: (check) => runSetupCheck(check, read, { ...scope, erpNames }),
    };
    return { ...checklist, commerce, deps };
}

const failed = (verb: string, error: unknown): HandlerResponse => ({
    success: false,
    error: `Could not ${verb}: ${error instanceof Error ? error.message : String(error)}`,
});

/** The checklist records after a run, as `recordsAfterRun` gives them for this integration. */
function recordsAfter(opened: Opened, checks: FreshChecks, reports: PreparationStepReport[]): Promise<Record<string, SetupStepRecord>> {
    return recordsAfterRun(opened.steps, opened.state.setupSteps, checks, reports, opened.deps.runCheck);
}

/** Save the record (or its absence) and the checked steps on the component. */
async function saveOutcome(context: HandlerContext, opened: Opened, outcome: PreparationOutcome): Promise<void> {
    const { storePreparation: _old, ...rest } = opened.state;
    const next: AppBuilderComponentState = {
        ...rest,
        setupSteps: await recordsAfter(opened, outcome.checks, outcome.reports),
        ...(outcome.record ? { storePreparation: outcome.record } : {}),
    };
    await context.stateManager.saveProject(setAppBuilderComponent(opened.project, opened.id, next));
}

/** A preview's fresh checks, saved on the checklist; nothing when no check ran. */
async function savePreviewChecks(context: HandlerContext, opened: Opened, checks: FreshChecks): Promise<void> {
    if (Object.keys(checks).length === 0) return;
    const next: AppBuilderComponentState = { ...opened.state, setupSteps: await recordsAfter(opened, checks, []) };
    await context.stateManager.saveProject(setAppBuilderComponent(opened.project, opened.id, next));
    await postComponentsSnapshot(context);
}

type RunOutcome = GuardableResult & {
    reports?: PreparationStepReport[];
    record?: StorePreparationRecord;
    warning?: string;
    details?: string[];
    changes?: OperationChange[];
};

/** How a run reads in the progress modal: its stage while it runs, and what it says when nothing changed. */
interface RunWords {
    title: string;
    stage: OperationStage;
    nothing?: string;
}

const APPLY_WORDS: RunWords = {
    title: 'Applying the demo setup',
    stage: OPERATION_STAGES.preparingStore,
    nothing: 'Nothing changed: every step was already done in the store.',
};
const UNDO_WORDS: RunWords = { title: 'Undoing the demo setup', stage: OPERATION_STAGES.undoingStorePreparation };

/**
 * What the run changed, for the result screen (live release test, 2026-10-22: it said only
 * "Store prepared"): a row for each step that changed something, its lines under it, then
 * what it leaves by hand. The preview says only that a step leaves something by hand
 * (owner, 2026-10-26), so the result is where the SC reads what it is. What Commerce
 * refused is the warning (`summarize`), not repeated here. Rows rather than centred lines
 * since 2026-10-26 (owner, release test row 4.19: the lines "look terrible").
 */
function changedSteps(reports: PreparationStepReport[]): OperationChange[] {
    return reports
        .filter((report) => report.changes.length > 0)
        .map((report) => ({ label: report.label, lines: [...report.changes, ...(report.manual ? [`By hand: ${report.manual}`] : [])] }));
}

/** The one line a run that changed nothing says, unless Commerce refused something (the warning says that). */
function nothingLine(reports: PreparationStepReport[], changes: OperationChange[], nothing?: string): string[] | undefined {
    const refused = reports.some((report) => report.rejected.length > 0);
    return changes.length === 0 && !refused && nothing ? [nothing] : undefined;
}

/** The result's counts, and what Commerce refused, for the modal's success view. */
function summarize(reports: PreparationStepReport[]): { counts: Record<string, number>; warning?: string } {
    const counts: Record<string, number> = {};
    for (const report of reports) counts[report.state] = (counts[report.state] ?? 0) + 1;
    const refused = reports.filter((report) => report.rejected.length > 0);
    const warning = refused.length > 0 ? refused.map((report) => `${report.label}: ${report.rejected.join('; ')}`).join(' ') : undefined;
    return { counts, ...(warning ? { warning } : {}) };
}

/** Run the engine inside the progress, guarded, then save. */
async function runInProgress(
    context: HandlerContext,
    opened: Opened,
    payload: { progress?: 'modal' } | undefined,
    words: RunWords,
    work: (deps: PreparationDeps) => Promise<PreparationOutcome>,
): Promise<RunOutcome> {
    const { title, stage } = words;
    const outcome = await withOperationProgress(
        { id: opened.id, title, inModal: progressSurfaceOf(payload) === 'modal', cardLabel: title },
        async (report: ReportStage): Promise<RunOutcome> => {
            const refused = await guardOrBlock(context, opened.project, (message) => report(message), progressSurfaceOf(payload));
            if (refused) return refused;
            report(stage.label);
            const deps: PreparationDeps = { ...opened.deps, onProgress: (step, what) => report(stage.label, `${step.label ?? step.title}: ${what}`) };
            try {
                const result = await work(deps);
                await saveOutcome(context, opened, result);
                const { warning } = summarize(result.reports);
                const changes = changedSteps(result.reports);
                const details = nothingLine(result.reports, changes, words.nothing);
                return {
                    success: true,
                    reports: result.reports,
                    record: result.record,
                    ...(changes.length ? { changes } : {}),
                    ...(details ? { details } : {}),
                    ...(warning ? { warning } : {}),
                };
            } catch (error) {
                return failed('apply the demo setup', error);
            }
        },
    );
    await postComponentsSnapshot(context);
    return outcome;
}

/** The answer once the work ran. */
function answerOf(outcome: RunOutcome, extra: Record<string, unknown> = {}): HandlerResponse {
    if (outcome.blocked || !outcome.success) return { success: false, error: outcome.error, code: outcome.code };
    const reports = outcome.reports ?? [];
    return { success: true, data: { confirmed: true, ...extra, steps: reports, ...summarize(reports), ...(outcome.record ? { recorded: Object.keys(outcome.record.steps) } : {}) } };
}

/**
 * Handle 'prepareCommerceStore' — without `confirm`, every step with where it stands in the
 * store NOW (each check run fresh, and saved on the checklist) and what the applicable ones
 * would change. With it, apply them (or the `stepIds` named), in order, each checked again
 * just before it is decided.
 */
export const handlePrepareCommerceStore: MessageHandler<PrepareStoreRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const opened = await openPreparation(context, payload?.id, 'prepare the store');
        if ('error' in opened) return opened.error;
        const stepIds = Array.isArray(payload?.stepIds) ? payload.stepIds.filter((id): id is string => typeof id === 'string') : undefined;
        if (payload?.confirm !== true) {
            try {
                const preview = await previewPreparation(opened.steps, opened.state, opened.deps, stepIds);
                await savePreviewChecks(context, opened, preview.checks);
                return { success: true, data: { confirmed: false, steps: preview.reports } };
            } catch (error) {
                return failed('read what the store needs', error);
            }
        }
        const outcome = await runInProgress(context, opened, payload, APPLY_WORDS, (deps) => applyPreparation(opened.steps, opened.state, deps, stepIds));
        return answerOf(outcome);
    },
    (payload) => payload?.id ?? '',
);

/**
 * Handle 'undoCommerceStorePreparation' — put back what the record holds, newest first, or
 * the one step named. Without `confirm`, which steps and what each recorded.
 */
export const handleUndoCommerceStorePreparation: MessageHandler<UndoStorePreparationRequestPayload> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const opened = await openPreparation(context, payload?.id, 'undo the preparation');
        if ('error' in opened) return opened.error;
        const record = opened.state.storePreparation;
        const stepId = typeof payload?.stepId === 'string' ? payload.stepId : undefined;
        if (!record || (stepId && !record.steps[stepId])) {
            const what = stepId ? `the step "${stepId}"` : 'this store';
            return { success: false, error: `Demo Builder has no preparation of ${what} to undo.`, code: ErrorCode.INVALID_OPERATION };
        }
        if (payload?.confirm !== true) {
            const steps = Object.entries(record.steps)
                .filter(([id]) => !stepId || id === stepId)
                .map(([id, entry]) => ({ id, recorded: entry }));
            return { success: true, data: { confirmed: false, at: record.at, steps } };
        }
        const outcome = await runInProgress(context, opened, payload, UNDO_WORDS, (deps) => undoPreparation(opened.steps, record, deps, stepId));
        return answerOf(outcome, { undone: true });
    },
    (payload) => payload?.id ?? '',
);

const SETTING_PATH = /^[a-z0-9_]+(\/[a-z0-9_]+)+$/u;

/** The items as the tool must send them, or why not. */
function validItems(items: unknown): SetupConfigFixItem[] | string {
    if (!Array.isArray(items) || items.length === 0) return 'Give one or more items, each { path, value, scope }.';
    const valid: SetupConfigFixItem[] = [];
    for (const item of items as Array<Partial<SetupConfigFixItem>>) {
        if (typeof item?.path !== 'string' || !SETTING_PATH.test(item.path)) return `"${String(item?.path)}" is not a setting path (section/group/field).`;
        if (typeof item.value !== 'string') return `${item.path}: value must be a string ("1" for Yes).`;
        if (item.scope !== 'default' && item.scope !== 'website') return `${item.path}: scope must be default or website.`;
        valid.push({ path: item.path, value: item.value, scope: item.scope });
    }
    return valid;
}

/**
 * Handle 'setCommerceConfig' — write settings through `PUT /V1/system/config`, previewing
 * without `confirm`, recording the previous values on the project so `undo: true` puts them
 * back. The one tool that writes settings outside a catalog step.
 */
export const handleSetCommerceConfig: MessageHandler<SetCommerceConfigRequestPayload> = async (context, payload) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { success: false, error: 'No project is open.', code: ErrorCode.PROJECT_NOT_FOUND };
    if (!context.authManager) return { success: false, error: 'Adobe sign-in required to change settings.', code: ErrorCode.AUTH_REQUIRED };
    const undo = payload?.undo === true;
    const record = project.commerceConfigChange;
    if (undo && !record) return { success: false, error: 'Demo Builder has no settings change to undo.', code: ErrorCode.INVALID_OPERATION };
    const items = undo ? [] : validItems(payload?.items);
    if (typeof items === 'string') return { success: false, error: items, code: ErrorCode.CONFIG_INVALID };
    const commerce = await openCommerce(project, context.authManager, context.context?.secrets);
    if ('refusal' in commerce) return { success: false, error: commerce.refusal, code: ErrorCode.CONFIG_INVALID };
    const { scope } = await setupCheckReader(context, project);
    const deps = { commerce, websiteCode: scope.websiteCode, erpNames: [] };
    const fix = configFix({ kind: 'config', items: undo ? (record?.previous ?? []).map((row) => ({ path: row.path, value: row.effective, scope: row.scope })) : items });
    try {
        if (payload?.confirm !== true) return { success: true, data: { confirmed: false, ...(await fix.preview(deps)) } };
        const refused = await guardOrBlock(context, project, () => undefined);
        if (refused) return { success: false, error: refused.error, code: refused.code };
        if (undo && record) {
            const undone = await fix.undo(deps, { kind: 'config', previous: record.previous });
            const { commerceConfigChange: _old, ...rest } = project;
            if (undone.rejected.length === 0) await context.stateManager.saveProject(rest);
            return { success: true, data: { confirmed: true, undone: true, ...undone } };
        }
        const applied = await fix.apply(deps);
        if (applied.record?.kind === 'config') {
            await context.stateManager.saveProject({ ...project, commerceConfigChange: { at: new Date().toISOString(), previous: applied.record.previous } });
        }
        return { success: true, data: { confirmed: true, changes: applied.changes, rejected: applied.rejected, previous: applied.record?.kind === 'config' ? applied.record.previous : [] } };
    } catch (error) {
        return failed('change the settings', error);
    }
};
