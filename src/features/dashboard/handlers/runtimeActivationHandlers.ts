/**
 * runtimeActivationHandlers — what RAN in a Runtime namespace, and how it went.
 *
 * `list_runtime_packages` says what is deployed; these say what executed. On
 * 2026-09-24 the question "did Commerce's product event ever reach the
 * integration" could only be answered by downloading the workspace credential
 * to a temp file and running `aio runtime activation list` by hand — and the
 * answer (no handler activation at all in 150 rows, a timer job whose log
 * showed Commerce timing out) placed the fault in one minute. These are that
 * read, as tools: the list of recent activations, and one activation's log and
 * result. Same targeting as the package list (the project workspace, or the
 * workspace an integration deploys into), same guard chain, and the namespace
 * key is fetched per call and never returned or logged.
 *
 * @module features/dashboard/handlers/runtimeActivationHandlers
 */

import { runGuards } from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { deployWorkspaceId } from '@/features/app-builder/services/componentWorkspace';
import {
    ACTIVATION_ID,
    listRuntimeActivations,
    readRuntimeActivation,
    runtimeNamespaceEnv,
    type RuntimeActivationRow,
} from '@/features/app-builder/services/runtimeNamespace';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/** What a person reads when the namespace cannot be read. */
const READ_FAILED =
    "Could not read this project's Adobe Runtime namespace. See Debug Logs for the reason.";

/** The checks every read makes before touching Adobe, or the refusal. */
async function openNamespaceRead(
    context: HandlerContext,
    componentId: string | undefined,
): Promise<{ project: Project } | { error: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { error: { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    if (!project.adobe?.organization) {
        return { error: { success: false, error: 'Project has no Adobe org context. Complete Adobe setup first.' } };
    }
    if (componentId && !project.appBuilderComponents?.[componentId]) {
        return {
            error: {
                success: false,
                error: `This project has no integration "${componentId}".`,
                code: ErrorCode.COMPONENT_NOT_FOUND,
            },
        };
    }
    const guardError = await runGuards(context, project);
    if (guardError) {
        return { error: { success: false, error: guardError.error, code: guardError.code } };
    }
    return { project };
}

/** Run one namespace read under the right org and workspace, answering the refusal on failure. */
async function inNamespace<T>(
    context: HandlerContext,
    project: Project,
    componentId: string | undefined,
    read: (deps: { commandManager: ReturnType<typeof ServiceLocator.getCommandExecutor>; logger: HandlerContext['logger'] }, env: Awaited<ReturnType<typeof runtimeNamespaceEnv>>) => Promise<T>,
): Promise<HandlerResponse> {
    const deps = { commandManager: ServiceLocator.getCommandExecutor(), logger: context.logger };
    const projectTarget = buildOrgTargetFromProjectAdobe(project.adobe!);
    const target = componentId
        ? { ...projectTarget, workspaceId: deployWorkspaceId(project, componentId) }
        : projectTarget;
    try {
        const data = await withOrgContext(target, async () => {
            const env = await runtimeNamespaceEnv(deps);
            return { namespace: env.AIO_RUNTIME_NAMESPACE, ...(await read(deps, env)) };
        });
        return { success: true, data };
    } catch (error) {
        context.logger.warn(`[Runtime] Could not read the namespace: ${toError(error).message}`);
        return { success: false, error: READ_FAILED };
    }
}

export interface ListRuntimeActivationsPayload {
    componentId?: string;
    /** At most 50 (the CLI's own ceiling); default 30. */
    limit?: number;
    /** Only this action, e.g. "erp/refresh-job". */
    action?: string;
}

/**
 * Handle 'listRuntimeActivations' — recent activations in a Runtime namespace,
 * newest first: the project workspace's, or the workspace an integration deploys into.
 */
export const handleListRuntimeActivations: MessageHandler<ListRuntimeActivationsPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const opened = await openNamespaceRead(context, payload?.componentId);
    if ('error' in opened) return opened.error;
    const action = typeof payload?.action === 'string' && payload.action.trim() ? payload.action.trim() : undefined;
    if (action && !/^[A-Za-z0-9_./-]{1,120}$/u.test(action)) {
        return { success: false, error: 'An action name is letters, digits, dots, dashes and slashes.', code: ErrorCode.CONFIG_INVALID };
    }
    return inNamespace(context, opened.project, payload?.componentId, async (deps, env) => ({
        activations: (await listRuntimeActivations(deps, env, { limit: payload?.limit, action })) as RuntimeActivationRow[],
    }));
};

/**
 * Handle 'readRuntimeActivation' — one activation's log lines and result.
 */
export const handleReadRuntimeActivation: MessageHandler<{ componentId?: string; activationId?: string }> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const activationId = payload?.activationId?.trim();
    if (!activationId || !ACTIVATION_ID.test(activationId)) {
        return { success: false, error: 'Name the activation by its 32-character id (from list_runtime_activations).', code: ErrorCode.CONFIG_INVALID };
    }
    const opened = await openNamespaceRead(context, payload?.componentId);
    if ('error' in opened) return opened.error;
    return inNamespace(context, opened.project, payload?.componentId, (deps, env) =>
        readRuntimeActivation(deps, env, activationId),
    );
};
