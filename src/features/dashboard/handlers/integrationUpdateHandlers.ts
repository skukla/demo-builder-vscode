/**
 * Updating installed integrations (AB-13, step 5).
 *
 * - `checkIntegrationUpdates` — which deployed integrations and systems have
 *   newer code, recorded where the cards read it. The integrations screen
 *   posts it when it opens. No Adobe guards: it reads GitHub and the clones.
 * - `updateAppBuilderComponent` — fetch the newer code, install its
 *   dependencies and redeploy (whose install pass upgrades the app in
 *   Commerce). For an integration with a bound system that has an update, the
 *   system is updated first, the order the pair is added in.
 *
 * Split from `appBuilderComponentHandlers.ts` the way the install and ERP
 * handlers were; the guard chain and progress telegraph are its exports.
 *
 * @module features/dashboard/handlers/integrationUpdateHandlers
 */

import {
    guardOrBlock,
    postComponentsSnapshot,
    postRowStatus,
    refreshProjectStatus,
    withComponentProgress,
    type GuardableResult,
} from './appBuilderComponentHandlers';
import { handlerRunnerDeps as runnerDeps, resolveComponentRecord } from './appManagementInstallHandlers';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import {
    updateAppBuilderComponent,
    type AppBuilderComponentRunnerDeps,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { checkIntegrationUpdates } from '@/features/app-builder/services/integrationUpdateCheck';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

type UpdateResult = GuardableResult & { detail?: string };

/**
 * Handle 'checkIntegrationUpdates' — record which deployed integrations have
 * newer code, and refresh the grid when an answer changed.
 */
export const handleCheckIntegrationUpdates: MessageHandler = async (context): Promise<HandlerResponse> => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const deps = await runnerDeps(context, project);
    if (!deps.checkComponentSource) {
        return { success: false, error: 'Checking for updates is not available here.' };
    }
    const checked = await checkIntegrationUpdates(project, {
        checkClone: deps.checkComponentSource,
        readAppVersion: deps.readAppVersion,
    });
    if (checked.changed) {
        await context.stateManager.saveProject(project);
        await postComponentsSnapshot(context);
    }
    return { success: true, data: { updates: checked.reports } };
};

/** The systems to update first: the ones this integration uses that have an update recorded. */
function systemsToUpdate(project: Project, id: string): string[] {
    return systemsUsedBy(project, id, getAppBuilderComponentCatalog()).filter(
        (systemId) => getAppBuilderComponent(project, systemId)?.updateAvailable,
    );
}

/** Update one component, telegraphing its row. */
async function updateOne(project: Project, id: string, deps: AppBuilderComponentRunnerDeps): Promise<UpdateResult> {
    await postRowStatus(id, 'deploying', 'Updating…');
    const result = await updateAppBuilderComponent(project, id, deps);
    if (result.success) {
        await postRowStatus(id, 'deployed');
    } else {
        await postRowStatus(id, 'error', result.error);
    }
    return result;
}

/** The bound system first, when it has an update, then the integration. */
async function updatePair(
    context: HandlerContext,
    project: Project,
    id: string,
    report: (message: string) => void,
): Promise<UpdateResult> {
    const refused = await guardOrBlock(context, project, report);
    if (refused) {
        return refused;
    }
    const deps = await runnerDeps(context, project, report);
    for (const systemId of systemsToUpdate(project, id)) {
        const system = await updateOne(project, systemId, deps);
        if (!system.success) {
            return {
                success: false,
                error: `The ERP did not update, so the integration was left as it is: ${system.error ?? 'no reason given'}`,
            };
        }
    }
    return updateOne(project, id, deps);
}

/**
 * Handle 'updateAppBuilderComponent' — guards → (bound system, when it has an
 * update) → the integration: fetch, install dependencies, redeploy.
 */
export const handleUpdateAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const target = await resolveComponentRecord(context, payload?.id, (record) => record.kind !== 'mesh');
    if (!target.ok) return target.error;
    const { id, project, state } = target;
    if (state.status !== 'deployed') {
        return {
            success: false,
            error: `"${id}" is not deployed; deploy it instead of updating it.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    const result = await withComponentProgress(
        { title: 'Updating', id, label: state.name ?? id, noun: 'Integration', logger: context.logger },
        (report) => updatePair(context, project, id, report),
    );

    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    return result.success
        ? { success: true, detail: result.detail }
        : { success: false, error: result.error, code: result.code };
};
