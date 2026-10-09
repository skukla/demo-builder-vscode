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
 * The pair's order and loop live in `integrationPairUpdate.ts` (app-builder
 * services). This module binds them to a handler context, and exports that
 * binding — `checkProjectIntegrationUpdates`, `integrationUpdateProbe`,
 * `updateIntegrationPairFor` — so the extension's update check (AB-73) runs the
 * SAME check and the SAME pair update for ANY project, not only the open one.
 *
 * @module features/dashboard/handlers/integrationUpdateHandlers
 */

import { orgGuard } from './appBuilderComponentGuards';
import {
    guardOrBlock,
    postComponentsSnapshot,
    postRowStatus,
    refreshProjectStatus,
    withComponentProgress,
    type GuardableResult,
} from './appBuilderComponentHandlers';
import { handlerRunnerDeps, resolveComponentRecord } from './appManagementInstallHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import {
    componentNameOf,
    pairUpdateOrder,
    updateIntegrationPair,
} from '@/features/app-builder/services/integrationPairUpdate';
import { checkIntegrationUpdates, type IntegrationUpdateCheck } from '@/features/app-builder/services/integrationUpdateCheck';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { IntegrationUpdateProbe } from '@/features/updates/services/integrationUpdates';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';

type UpdateResult = GuardableResult & { detail?: string };
type Report = (message: string, subMessage?: string, position?: OperationPosition) => void;

/**
 * The runner deps for `project`. A project other than the open one is saved IN
 * PLACE: `saveProject` would also make it the current project, which an update
 * from the Check for Updates list is not about.
 */
function runnerDepsFor(context: HandlerContext, project: Project, isCurrent: boolean, report?: Report) {
    return handlerRunnerDeps(context, project, report, isCurrent ? 'current' : 'in-place');
}

async function isCurrentProject(context: HandlerContext, project: Project): Promise<boolean> {
    return (await context.stateManager.getCurrentProject())?.path === project.path;
}

/**
 * Record which of `project`'s deployed integrations have newer code, for any
 * project. Saves only when an answer changed; the open project through
 * `saveProject`, any other in place. Undefined when the check is not wired.
 */
export async function checkProjectIntegrationUpdates(
    context: HandlerContext,
    project: Project,
): Promise<IntegrationUpdateCheck | undefined> {
    const isCurrent = await isCurrentProject(context, project);
    const deps = await runnerDepsFor(context, project, isCurrent);
    if (!deps.checkComponentSource) return undefined;
    const checked = await checkIntegrationUpdates(project, {
        checkClone: deps.checkComponentSource,
        readAppVersion: deps.readAppVersion,
    });
    if (checked.changed) {
        await (isCurrent ? context.stateManager.saveProject(project) : context.stateManager.saveProjectConfigOnly(project));
    }
    return checked;
}

/**
 * The finder's probe, bound to this context: the check, the guard chain's own
 * org step (`orgGuard`, the step `runGuards` runs), and the catalog.
 */
export function integrationUpdateProbe(context: HandlerContext): IntegrationUpdateProbe {
    return {
        check: (project) => checkProjectIntegrationUpdates(context, project),
        inOtherOrg: async (project) => {
            const authManager = context.authManager ?? ServiceLocator.getAuthenticationService();
            return (await orgGuard(context, project, authManager)) !== undefined;
        },
        catalog: getAppBuilderComponentCatalog(),
    };
}

/**
 * Handle 'checkIntegrationUpdates' — record which deployed integrations have
 * newer code, and refresh the grid when an answer changed.
 */
export const handleCheckIntegrationUpdates: MessageHandler = async (context): Promise<HandlerResponse> => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const checked = await checkProjectIntegrationUpdates(context, project);
    if (!checked) {
        return { success: false, error: 'Checking for updates is not available here.' };
    }
    if (checked.changed) {
        await postComponentsSnapshot(context);
    }
    return { success: true, data: { updates: checked.reports } };
};

/**
 * The pair update the card's Update button runs, for ANY project: guards → the
 * pair's members with newer code, systems first (`pairUpdateOrder`), each
 * fetched, its dependencies installed and redeployed. Rows are telegraphed only
 * for the open project (its ids may repeat in another project's grid); the
 * dashboard is refreshed either way, since it reads persisted state.
 *
 * @param context - the handler context
 * @param project - the project the pair is in; need not be the open one
 * @param id - the integration or ERP asked for
 * @param report - where the stages go
 * @param progress - `'modal'` when started from the integrations screen
 */
export async function updateIntegrationPairFor(
    context: HandlerContext,
    project: Project,
    id: string,
    report: Report,
    progress?: 'modal',
): Promise<UpdateResult> {
    const refused = await guardOrBlock(context, project, report, progress);
    if (refused) {
        return refused;
    }
    const isCurrent = await isCurrentProject(context, project);
    const result = await updateIntegrationPair(project, pairUpdateOrder(project, id, getAppBuilderComponentCatalog()), {
        runnerDepsFor: (position) =>
            runnerDepsFor(context, project, isCurrent, (message, step) => report(message, step, position)),
        postRowStatus: isCurrent ? (rowId, status, message) => postRowStatus(rowId, status, message) : async () => undefined,
    });
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    return result;
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

        const progress = progressSurfaceOf(payload);
        const label = pairUpdateOrder(project, id, getAppBuilderComponentCatalog())
            .map((memberId) => componentNameOf(project, memberId))
            .join(' and ');
        const result = await withComponentProgress(
            { title: 'Updating', id, label, noun: 'Integration', logger: context.logger, progress },
            (report) => updateIntegrationPairFor(context, project, id, report, progress),
        );
        return result.success
            ? { success: true, detail: result.detail }
            : { success: false, error: result.error, code: result.code };
    },
    (payload) => payload?.id,
);
