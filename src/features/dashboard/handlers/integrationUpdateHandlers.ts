/**
 * Updating installed integrations (AB-13, step 5).
 *
 * - `checkIntegrationUpdates` — which deployed integrations and systems have
 *   newer code, recorded where the cards read it. The integrations screen
 *   posts it when it opens. No Adobe guards: it reads GitHub and the clones.
 * - `updateAppBuilderComponent` — fetch the newer code, install its
 *   dependencies and redeploy (whose install pass upgrades the app in
 *   Commerce). An integration and the systems it uses update as a PAIR, from
 *   either card (owner, 2026-09-18): each member with newer code is updated,
 *   systems first — the order the pair is added in, since the integration
 *   reads the system's address — and a failed system stops the rest. The pair's
 *   code changes together, so updating one half alone leaves a mismatch nothing
 *   warns about. A card whose last deploy failed can update too: Update fetches
 *   and redeploys, so it does Retry's job as well.
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
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import {
    updateAppBuilderComponent,
    type AppBuilderComponentRunnerDeps,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { checkIntegrationUpdates } from '@/features/app-builder/services/integrationUpdateCheck';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { integrationUsing, systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';

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

/**
 * What an Update on this card updates, in order: the systems of its pair, then the
 * integration, each when it has newer code recorded OR its last deploy failed, so
 * the pair ends deployed (2026-09-18: an ERP whose code an earlier failed Update
 * had already fetched counted as current and was skipped, left failed). The card
 * asked for is always included, so an update check that is out of date still
 * fetches it.
 */
function pairToUpdate(project: Project, id: string): string[] {
    const catalog = getAppBuilderComponentCatalog();
    const integrationId = getAppBuilderComponent(project, id)?.kind === 'system'
        ? integrationUsing(project, id, catalog)
        : id;
    const members = integrationId ? [...systemsUsedBy(project, integrationId, catalog), integrationId] : [id];
    return members.filter((member) => member === id || needsUpdate(project, member));
}

function needsUpdate(project: Project, id: string): boolean {
    const state = getAppBuilderComponent(project, id);
    return Boolean(state?.updateAvailable) || state?.status === 'error';
}

function nameOf(project: Project, id: string): string {
    return getAppBuilderComponent(project, id)?.name ?? id;
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

/** Which members to update, in order, and where the progress shows. */
interface UpdatePlan {
    order: string[];
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress: 'modal' | undefined;
}

/** Update each member in order; the first failure stops the rest and says what it left alone. */
async function updatePair(
    context: HandlerContext,
    project: Project,
    plan: UpdatePlan,
    report: (message: string, subMessage?: string, position?: OperationPosition) => void,
): Promise<UpdateResult> {
    const { order, progress } = plan;
    const refused = await guardOrBlock(context, project, report, progress);
    if (refused) {
        return refused;
    }
    // Every card the click covers says so at once: the first updates, the rest
    // wait their turn (owner, 2026-09-18). The clicked card is not assumed to be
    // the one running.
    for (const waiting of order.slice(1)) {
        await postRowStatus(waiting, 'deploying', 'Waiting to update');
    }
    let last: UpdateResult = { success: true };
    for (const [index, memberId] of order.entries()) {
        // A pair updates two things back to back: each one's reports say which.
        const position =
            order.length > 1
                ? { index: index + 1, total: order.length, name: nameOf(project, memberId) }
                : undefined;
        const deps = await runnerDeps(context, project, (message, step) => report(message, step, position));
        last = await updateOne(project, memberId, deps);
        const rest = order.slice(index + 1);
        if (!last.success && rest.length > 0) {
            await releaseWaiting(project, rest, nameOf(project, memberId));
            const left = rest.map((restId) => nameOf(project, restId)).join(' and ');
            const why = last.error ?? 'no reason given';
            return { success: false, error: `${nameOf(project, memberId)} did not update, so ${left} was left as it is: ${why}` };
        }
    }
    return last;
}

/** Cards that were waiting go back to their own status, saying why nothing happened. */
async function releaseWaiting(project: Project, ids: string[], failedName: string): Promise<void> {
    for (const id of ids) {
        const status = getAppBuilderComponent(project, id)?.status ?? 'not-deployed';
        await postRowStatus(id, status, `Left as it is: ${failedName} did not update.`);
    }
}

/** A card can update when it is deployed, or when its last deploy failed. */
function canUpdate(status: string): boolean {
    return status === 'deployed' || status === 'error';
}

/**
 * Handle 'updateAppBuilderComponent' — guards → the pair's members with newer
 * code, systems first: fetch, install dependencies, redeploy.
 */
export const handleUpdateAppBuilderComponent: MessageHandler<{
    id?: string;
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress?: 'modal';
}> = narrateOutcomeToModal(
    async (context, payload): Promise<HandlerResponse> => {
        const target = await resolveComponentRecord(context, payload?.id, (record) => record.kind !== 'mesh');
        if (!target.ok) return target.error;
        const { id, project, state } = target;
        if (!canUpdate(state.status)) {
            return {
                success: false,
                error: `"${id}" is not deployed; deploy it instead of updating it.`,
                code: ErrorCode.INVALID_OPERATION,
            };
        }

        const plan: UpdatePlan = { order: pairToUpdate(project, id), progress: progressSurfaceOf(payload) };
        const label = plan.order.map((memberId) => nameOf(project, memberId)).join(' and ');
        const result = await withComponentProgress(
            { title: 'Updating', id, label, noun: 'Integration', logger: context.logger, progress: plan.progress },
            (report) => updatePair(context, project, plan, report),
        );

        await postComponentsSnapshot(context);
        await refreshProjectStatus(context);
        return result.success
            ? { success: true, detail: result.detail }
            : { success: false, error: result.error, code: result.code };
    },
    (payload) => payload?.id,
);
