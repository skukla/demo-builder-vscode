/**
 * What is deployed in the project's Adobe I/O Runtime namespace.
 *
 * The agent surface had no way to ask. On 2026-09-21 a removal reported done
 * while fifteen packages kept running in Stage, and the only way to see them was
 * by hand: download the workspace's credentials, then `aio runtime package list`
 * with its key. This is that read, through the same code the removal now uses to
 * check itself (`runtimeNamespace.ts`), so the two cannot disagree.
 *
 * `list_runtime_packages` is read-only. `delete_undeclared_runtime_code` deletes, and
 * only what an app no longer declares in its own packages — the same clean-up every
 * deploy now ends with (`runtimeUndeclaredActions.ts`), for code left from before that.
 * The namespace key is fetched per call and never returned or logged.
 *
 * @module features/dashboard/handlers/runtimePackageHandlers
 */

import { runGuards } from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { deployWorkspaceId } from '@/features/app-builder/services/componentWorkspace';
import {
    listRuntimePackages,
    runtimeNamespaceEnv,
} from '@/features/app-builder/services/runtimeNamespace';
import {
    deleteUndeclaredActions,
    type UndeclaredActionCleanup,
} from '@/features/app-builder/services/runtimeUndeclaredActions';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/** What a person reads when the namespace cannot be listed. */
const LIST_FAILED =
    "Could not list what is deployed in this project's Adobe Runtime namespace. " +
    'See Debug Logs for the reason.';

/** The namespace that was read, and the packages in it. */
export interface RuntimePackagesData {
    namespace: string;
    packages: string[];
}

/**
 * Handle 'listRuntimePackages' — the packages deployed in a Runtime namespace:
 * the project workspace's, or, given `componentId`, the workspace that integration
 * deploys into (its own since AB-23, else the project's).
 */
export const handleListRuntimePackages: MessageHandler<{ componentId?: string }> = async (
    context,
    payload,
) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    if (!project.adobe?.organization) {
        return {
            success: false,
            error: 'Project has no Adobe org context. Complete Adobe setup first.',
        };
    }

    const componentId = payload?.componentId;
    if (componentId && !project.appBuilderComponents?.[componentId]) {
        return {
            success: false,
            error: `This project has no integration "${componentId}".`,
            code: ErrorCode.COMPONENT_NOT_FOUND,
        };
    }

    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    try {
        const deps = {
            commandManager: ServiceLocator.getCommandExecutor(),
            logger: context.logger,
        };
        const projectTarget = buildOrgTargetFromProjectAdobe(project.adobe);
        const target = componentId
            ? { ...projectTarget, workspaceId: deployWorkspaceId(project, componentId) }
            : projectTarget;
        const data = await withOrgContext(
            target,
            async (): Promise<RuntimePackagesData> => {
                const env = await runtimeNamespaceEnv(deps);
                return {
                    namespace: env.AIO_RUNTIME_NAMESPACE,
                    packages: await listRuntimePackages(deps, env),
                };
            },
        );
        return { success: true, data };
    } catch (error) {
        // The CLI's own reason goes to the Debug Logs (read_debug_logs), where it
        // is useful; the answer says what failed in words written for a person.
        context.logger.warn(`[Runtime] Could not list the namespace: ${toError(error).message}`);
        return { success: false, error: LIST_FAILED };
    }
};

/**
 * The folders of every app that deploys into the same workspace as `componentId`. A pair
 * shares one, and each app's declarations keep the other's actions safe.
 */
function foldersSharingWorkspace(project: Project, componentId: string): string[] {
    const workspace = deployWorkspaceId(project, componentId);
    return Object.entries(project.appBuilderComponents ?? {})
        .filter(([id, state]) => state.kind !== 'mesh' && deployWorkspaceId(project, id) === workspace)
        .map(([id]) => project.componentInstances?.[id]?.path)
        .filter((folder): folder is string => Boolean(folder));
}

/** The project and the integration a delete is for, or the refusal. */
async function openForDelete(
    context: HandlerContext,
    componentId: string | undefined,
): Promise<{ project: Project; componentId: string } | { refusal: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { refusal: { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    if (!componentId || !project.appBuilderComponents?.[componentId]) {
        return {
            refusal: {
                success: false,
                error: `This project has no integration "${componentId ?? ''}".`,
                code: ErrorCode.COMPONENT_NOT_FOUND,
            },
        };
    }
    const guardError = await runGuards(context, project);
    if (guardError) {
        return { refusal: { success: false, error: guardError.error, code: guardError.code } };
    }
    return { project, componentId };
}

/**
 * Handle 'deleteUndeclaredRuntimeCode' — delete the actions an integration (and any app
 * sharing its workspace) no longer declares in its own packages, and say what was deleted.
 */
export const handleDeleteUndeclaredRuntimeCode: MessageHandler<{ componentId?: string }> = async (
    context,
    payload,
) => {
    const opened = await openForDelete(context, payload?.componentId);
    if ('refusal' in opened) return opened.refusal;
    const { project, componentId } = opened;
    const deps = { commandManager: ServiceLocator.getCommandExecutor(), logger: context.logger };
    const target = {
        ...buildOrgTargetFromProjectAdobe(project.adobe),
        workspaceId: deployWorkspaceId(project, componentId),
    };
    const cleanup = await withOrgContext(
        target,
        (): Promise<UndeclaredActionCleanup> => deleteUndeclaredActions(deps, foldersSharingWorkspace(project, componentId)),
    );
    if (cleanup.note) return { success: false, error: cleanup.note };
    return { success: true, data: cleanup };
};
