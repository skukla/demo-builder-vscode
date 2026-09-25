/**
 * runtimeActivationHandlers — what RAN in a Runtime namespace, and how it went.
 *
 * `list_runtime_packages` says what is deployed; these say what executed. On
 * 2026-09-24 "why does the timer job report success while the ERP never
 * updates" could only be answered by downloading the workspace credential to a
 * temp file and running `aio runtime activation list` and `logs` by hand — the
 * job's own log said Commerce was timing out its reads. These are that read,
 * as tools: the list of recent activations, and one activation's log and
 * result. Same targeting as the package list (the project workspace, or the
 * workspace an integration deploys into), same guard chain, and the namespace
 * key is fetched per call and never returned or logged.
 *
 * WHAT THE LIST CANNOT SHOW (Adobe Runtime, "Logging and monitoring" guide, read
 * 2026-09-24): "the system skips persisting the activation that succeeded" for
 * blocking calls unless the request carried `X-OW-EXTRA-LOGGING: on`; failures
 * and asynchronous runs (timers, non-blocking invokes) are always kept. Measured
 * the same evening: a block applied by the status handler and the ERP's own PATCH
 * left no row, while every failed credit run did. A missing row is therefore "no
 * failure recorded", never "did not run" — the tool's description says so, and the
 * first conclusion drawn before this was read had to be retracted.
 *
 * @module features/dashboard/handlers/runtimeActivationHandlers
 */

import { runGuards } from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { deployWorkspaceId } from '@/features/app-builder/services/componentWorkspace';
import {
    ACTIVATION_ID,
    RUNTIME_ACTION_NAME,
    invokeRuntimeAction,
    invokeWebAction,
    listRuntimeActivations,
    readRuntimeActivation,
    type RuntimeActivationRow,
} from '@/features/app-builder/services/runtimeActivations';
import { runtimeNamespaceEnv } from '@/features/app-builder/services/runtimeNamespace';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
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
): Promise<{ project: Project; adobe: NonNullable<Project['adobe']> } | { error: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { error: { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    const adobe = project.adobe;
    if (!adobe?.organization) {
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
    return { project, adobe };
}

/** Run one namespace read under the right org and workspace, answering the refusal on failure. */
async function inNamespace<T>(
    context: HandlerContext,
    opened: { project: Project; adobe: NonNullable<Project['adobe']> },
    componentId: string | undefined,
    read: (deps: { commandManager: ReturnType<typeof ServiceLocator.getCommandExecutor>; logger: HandlerContext['logger'] }, env: Awaited<ReturnType<typeof runtimeNamespaceEnv>>) => Promise<T>,
): Promise<HandlerResponse> {
    const deps = { commandManager: ServiceLocator.getCommandExecutor(), logger: context.logger };
    const projectTarget = buildOrgTargetFromProjectAdobe(opened.adobe);
    const target = componentId
        ? { ...projectTarget, workspaceId: deployWorkspaceId(opened.project, componentId) }
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
    /** Skip this many newest rows (paging past 50). */
    skip?: number;
    /** Only activations after this ISO time. */
    since?: string;
    /** Only runs that did not succeed. */
    failedOnly?: boolean;
    /** Keep the timer firings themselves; off by default. */
    includeTriggers?: boolean;
}

const ACTION_NAME_WORDS = 'An action name is <package>/<action>, in letters, digits, dots, dashes and underscores.';

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
    const since = typeof payload?.since === 'string' && payload.since.trim() ? payload.since.trim() : undefined;
    if (since && Number.isNaN(Date.parse(since))) {
        return { success: false, error: '`since` is an ISO 8601 time, e.g. 2026-09-25T13:00:00Z.', code: ErrorCode.CONFIG_INVALID };
    }
    return inNamespace(context, opened, payload?.componentId, async (deps, env) => ({
        activations: (await listRuntimeActivations(deps, env, {
            limit: payload?.limit,
            action,
            skip: payload?.skip,
            since,
            failedOnly: payload?.failedOnly === true,
            includeTriggers: payload?.includeTriggers === true,
        })) as RuntimeActivationRow[],
    }));
};

export interface InvokeRuntimeActionPayload {
    componentId?: string;
    /** `<package>/<action>`, e.g. "webhook/item-prices" or "order-commerce/created". */
    action?: string;
    /** The action's parameters: an event handler takes `{ data: { value } }`, a web action its fields. */
    payload?: Record<string, unknown>;
}

/** The deployed web URL of an integration's action, when the record has one. */
function webUrlOf(project: Project, componentId: string | undefined, action: string): string | undefined {
    if (!componentId) return undefined;
    const url = project.appBuilderComponents?.[componentId]?.deployedUrls?.[`runtime/${action}`];
    return typeof url === 'string' && url.includes('/web/') ? url : undefined;
}

/**
 * Handle 'invokeRuntimeAction' — run one deployed action with a payload and answer its
 * result, status and log lines. A web action (the cart webhooks, the ERP's own routes) is
 * called through its URL with the signed-in user's token, because its Adobe-auth validator
 * refuses a direct invoke; then its recorded run is read. Any other action is invoked
 * blocking through the CLI. The replay that no Commerce event or timer can be made to do.
 */
export const handleInvokeRuntimeAction: MessageHandler<InvokeRuntimeActionPayload> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const action = payload?.action?.trim();
    if (!action || !RUNTIME_ACTION_NAME.test(action)) {
        return { success: false, error: ACTION_NAME_WORDS, code: ErrorCode.CONFIG_INVALID };
    }
    const params = payload?.payload;
    if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return { success: false, error: '`payload` is a JSON object of the action\'s parameters.', code: ErrorCode.CONFIG_INVALID };
    }
    const opened = await openNamespaceRead(context, payload?.componentId);
    if ('error' in opened) return opened.error;
    const webUrl = webUrlOf(opened.project, payload?.componentId, action);
    if (!webUrl) {
        return inNamespace(context, opened, payload?.componentId, (deps, env) =>
            invokeRuntimeAction(deps, env, action, params ?? {}),
        );
    }
    const auth = await resolveAppManagementAuth(opened.project, ServiceLocator.getAuthenticationService());
    if (!auth) {
        return { success: false, error: 'Adobe sign-in required to call a web action.', code: ErrorCode.AUTH_REQUIRED };
    }
    const startedAt = new Date().toISOString();
    let web;
    try {
        web = await invokeWebAction(webUrl, auth, params ?? {}, fetch);
    } catch (error) {
        return { success: false, error: `The web action did not answer: ${toError(error).message}` };
    }
    // The extra-logging header made Runtime keep the run; its newest activation is this one.
    return inNamespace(context, opened, payload?.componentId, async (deps, env) => {
        const [newest] = await listRuntimeActivations(deps, env, { action, limit: 1, since: startedAt });
        const run = newest ? await readRuntimeActivation(deps, env, newest.activationId) : undefined;
        return {
            mode: 'web',
            httpStatus: web.httpStatus,
            success: web.ok,
            result: web.result,
            ...(newest ? { activationId: newest.activationId, durationMs: newest.durationMs } : {}),
            logs: run?.logs ?? [],
        };
    });
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
    return inNamespace(context, opened, payload?.componentId, (deps, env) =>
        readRuntimeActivation(deps, env, activationId),
    );
};
