/**
 * The projects list's Reset Selected and Delete Selected (owner, 2026-11-04): `prepareProjectsBatch`
 * reads what the questions need, and `runProjectsBatch` runs the answers in the window, a row per
 * project, the way `applyUpdates` runs the Updates window (`projectsBatch.ts` holds the work).
 * Typed by `@/types/projectsBatch`, as the Updates channel is by `@/types/pendingUpdates`.
 *
 * The run saves the projects it resets; none of them may become the open one, so it runs with the
 * state manager that never moves the pointer, as the Updates run does.
 *
 * @module features/projects-dashboard/handlers/projectsBatchHandlers
 */

import { prepareDeleteBatch, prepareResetBatch, runDeleteBatch, runResetBatch, saveNamesOf, type RunReset, type TellRow } from '../services/projectsBatch';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createNonSwitchingStateManager } from '@/core/state/workingProjectStateManager';
import { PROJECTS_BATCH_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import type { HandlerContext, MessageHandler } from '@/types/handlers';
import type { PrepareProjectsBatchRequest, PrepareProjectsBatchResponse, ProjectsBatchAction, RunProjectsBatchRequest } from '@/types/projectsBatch';

/** Whether a batch is running: a second would run beside it, which the batch exists to avoid. */
let running = false;

const ALREADY_RUNNING = 'Projects are already being reset or deleted.';
const NO_PROJECTS = 'Select at least one project.';

const isAction = (value: unknown): value is ProjectsBatchAction => value === 'reset' || value === 'delete';
const isPathList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0 && value.every((path) => typeof path === 'string' && path.length > 0);

/** `prepareProjectsBatch`: the questions' rows, for the projects picked. Reads only. */
export const handlePrepareProjectsBatch: MessageHandler<PrepareProjectsBatchRequest> = async (context, payload) => {
    if (!isAction(payload?.action)) return { success: false, error: 'Say whether to reset or delete.' };
    if (!isPathList(payload.projectPaths)) return { success: false, error: NO_PROJECTS };
    if (payload.action === 'delete') {
        const rows = await prepareDeleteBatch(context, payload.projectPaths);
        const data: PrepareProjectsBatchResponse = { action: 'delete', rows, ...(await saveNamesOf(context, rows)) };
        return { success: true, data };
    }
    const rows = await prepareResetBatch(context, payload.projectPaths);
    const data: PrepareProjectsBatchResponse = { action: 'reset', rows, ...(await saveNamesOf(context, rows)) };
    return { success: true, data };
};

/**
 * Each project's reset, answered: the storefront reset for an EDS project, else the component one.
 * Both take the batch's Uninstall Datapack and the save question's answer (step-05 S6), and a reset
 * that finished hands back what it finished around, in the agent tool's words (`resetCaveats`).
 */
const runReset: RunReset = async (context, project, answer, report) => {
    const commandManager = ServiceLocator.getCommandExecutor();
    const authManager = ServiceLocator.getAuthenticationService();
    const answered = { removeDatapack: answer.removeDatapack, ...(answer.changes ? { changes: answer.changes } : {}) };
    const { isEdsProject } = await import('@/types/typeGuards');
    if (isEdsProject(project)) {
        const { resetEdsProjectWithUI } = await import('@/features/eds/services/reset/edsResetUI');
        const { resetCaveats } = await import('@/features/eds/services/reset/edsResetParams');
        const { datapackStepLine } = await import('@/features/eds/services/reset/resetDatapackStep');
        const result = await resetEdsProjectWithUI({
            meshDeps: { commandManager, authManager },
            project,
            context,
            logPrefix: '[ProjectsBatch]',
            includeBlockLibrary: true,
            verifyCdn: true,
            withinEdit: { report },
            answered,
        });
        if (!result.success) {
            // What the datapack step did to the store, said beside the failure (review, 2026-11-13).
            const removal = result.datapackRemoval ? { warnings: [datapackStepLine(result.datapackRemoval)] } : {};
            return { success: false, ...(result.error ? { error: result.error } : {}), ...removal };
        }
        const warnings = resetCaveats(result);
        return { success: true, ...(warnings.length > 0 ? { warnings } : {}) };
    }
    const { runProjectResetAnswered } = await import('@/features/lifecycle/services/projectResetService');
    return runProjectResetAnswered({ commandManager, authManager, project, context, logPrefix: '[ProjectsBatch]' }, report, answered);
};

/** Push one row; a window closed mid-run cannot be told, which is never the run's problem. */
const tellerFor = (context: HandlerContext): TellRow => (status) => {
    void context.sendMessage('projectsBatchRow', status).catch(() => undefined);
};

/** How many did not go through, as the window's last line; nothing when all did. */
function notDoneWarning(action: ProjectsBatchAction, failed: number): { warning?: string } {
    if (failed === 0) return {};
    const noun = failed === 1 ? 'project' : 'projects';
    return { warning: `${failed} ${noun} not ${action === 'delete' ? 'deleted' : 'reset'}.` };
}

/** `runProjectsBatch`: the answers, run one project at a time in the window. */
export const handleRunProjectsBatch: MessageHandler<RunProjectsBatchRequest & { progress?: 'modal' }> = narrateOutcomeToModal(
    async (context, payload) => {
        if (running) return { success: false, error: ALREADY_RUNNING };
        if (!payload || !isAction(payload.action) || !Array.isArray(payload.answers) || payload.answers.length === 0) {
            return { success: false, error: NO_PROJECTS };
        }
        running = true;
        const runContext = { ...context, stateManager: createNonSwitchingStateManager(context.stateManager) };
        const tell = tellerFor(context);
        // The kind, never a count: which projects is in the rows (the window-header convention).
        const title = payload.action === 'delete' ? 'Deleting Projects' : 'Resetting Projects';
        try {
            return await withOperationProgress({ id: PROJECTS_BATCH_OPERATION_ID, title, inModal: true }, async (report) => {
                const failed =
                    payload.action === 'delete'
                        ? await runDeleteBatch(runContext, payload.answers, tell, report)
                        : await runResetBatch(runContext, payload.answers, { tell, report, runReset });
                // A success with a warning, as the Updates run ends: each row says why.
                return { success: true, ...notDoneWarning(payload.action, failed) };
            });
        } finally {
            running = false;
        }
    },
    () => PROJECTS_BATCH_OPERATION_ID,
);
