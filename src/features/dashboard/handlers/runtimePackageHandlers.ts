/**
 * What is deployed in the project's Adobe I/O Runtime namespace.
 *
 * The agent surface had no way to ask. On 2026-09-21 a removal reported done
 * while fifteen packages kept running in Stage, and the only way to see them was
 * by hand: download the workspace's credentials, then `aio runtime package list`
 * with its key. This is that read, through the same code the removal now uses to
 * check itself (`runtimeNamespace.ts`), so the two cannot disagree.
 *
 * Read-only, and reached only by the `list_runtime_packages` agent tool. The
 * namespace key is fetched per call and never returned or logged.
 *
 * @module features/dashboard/handlers/runtimePackageHandlers
 */

import { runGuards } from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import {
    listRuntimePackages,
    runtimeNamespaceEnv,
} from '@/features/app-builder/services/runtimeNamespace';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/** The namespace that was read, and the packages in it. */
export interface RuntimePackagesData {
    namespace: string;
    packages: string[];
}

/**
 * Handle 'listRuntimePackages' — the packages deployed in the project workspace's
 * Runtime namespace.
 */
export const handleListRuntimePackages: MessageHandler = async (context) => {
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

    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    try {
        const deps = {
            commandManager: ServiceLocator.getCommandExecutor(),
            logger: context.logger,
        };
        const data = await withOrgContext(
            buildOrgTargetFromProjectAdobe(project.adobe),
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
        return { success: false, error: toError(error).message };
    }
};
