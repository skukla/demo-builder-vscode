/**
 * A removal's check of Adobe's extension-point registry: whether the component's
 * Commerce Admin registration is still published after the undeploy, unpublishing
 * it when it is, and folding the answer into the leftover verdict.
 *
 * `aio app deploy` publishes the registration and `aio app undeploy` is what
 * unpublishes it, exit 0 either way, so a removal reads the registry back rather
 * than believing the undeploy (2026-10-08: two deployments of one integration
 * showed its Commerce grid columns twice).
 *
 * Its own file beside `appBuilderRemoveRun.ts`, which calls it right after the
 * Runtime leftover check.
 *
 * @module features/app-builder/services/appBuilderRemovalRegistration
 */

import type { AppBuilderComponentRunnerDeps } from './appBuilderComponentRunner';
import { stoppedAfterUndeploy, type checkRuntimeLeftovers } from './appBuilderComponentTeardown';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { AppBuilderComponentState, Project } from '@/types/base';

/**
 * What the undeploy step answers: the leftover check's verdict, plus whether the
 * component's Commerce Admin registration is still published, or could not be shown
 * gone. When it is, a workspace of the component's own must NOT take the leftovers with
 * it: a registration is not in the workspace's namespace, and deleting the workspace
 * would leave one nothing can reach (2026-10-08).
 */
export type UndeployCheck = Awaited<ReturnType<typeof checkRuntimeLeftovers>> & {
    registrationLeft?: boolean;
};

/** What the registry check found, for the summary and for the removal's verdict. */
export interface RegistrationCheck {
    /** Still published, or not shown gone. */
    registrationLeft: boolean;
    /** The line the cleanup summary carries, when there is something to say. */
    note?: string;
    /** Why the removal must stop, when it must. */
    reason?: string;
}

/** What the registry check is told about the removal so far. */
export interface RegistrationCheckInput {
    /** The extension points the app's config declared, read before the local delete. */
    declaredPoints: string[];
    /** The name a person reads for the component. */
    shownName: string;
    /** Whether the undeploy itself threw. */
    undeployFailed: boolean;
}

/**
 * After the undeploy: whether the registry still publishes what the app declared, and if
 * so, unpublish it and read again. Each step is confirmed by reading back, never assumed.
 * Nothing to read (a standalone app, a component in the project's workspace, or deps that
 * do not reach the registry) answers from the undeploy alone: a failed undeploy then
 * leaves the registration unknown, and unknown is treated as left.
 */
export async function checkRegistration(
    project: Project,
    state: AppBuilderComponentState,
    input: RegistrationCheckInput,
    deps: AppBuilderComponentRunnerDeps,
): Promise<RegistrationCheck> {
    const { declaredPoints, shownName, undeployFailed } = input;
    const workspace = state.workspace;
    const { workspaceExtensionPointsOf: read, removeWorkspaceExtensionPoints: unpublish } = deps;
    if (!workspace || !read || !unpublish || declaredPoints.length === 0) {
        return undeployFailed
            ? {
                  registrationLeft: true,
                  note: 'The undeploy itself failed, and its Commerce Admin registration could not be checked.',
              }
            : { registrationLeft: false };
    }
    deps.onProgress?.(OPERATION_STAGES.checkingLeftovers.label, 'Checking its Commerce Admin registration');
    const published = await read(project, workspace);
    if (!Array.isArray(published)) {
        return registrationLeft(shownName, workspace, [], `could not be checked (${published.error})`);
    }
    const still = published.filter((key) => declaredPoints.includes(key));
    if (still.length === 0) return { registrationLeft: false };
    deps.onProgress?.(OPERATION_STAGES.checkingLeftovers.label, 'Removing its Commerce Admin registration');
    const remaining = await unpublish(project, workspace, still);
    const left = Array.isArray(remaining) ? remaining.filter((key) => still.includes(key)) : still;
    if (left.length === 0) {
        return {
            registrationLeft: false,
            note: 'Its Commerce Admin registration was still published and was removed.',
        };
    }
    const why = Array.isArray(remaining) ? 'is still published' : `is still published (${remaining.error})`;
    return registrationLeft(shownName, workspace, left, why);
}

/** The verdict for a registration that is still there, or cannot be shown gone. */
function registrationLeft(
    shownName: string,
    workspace: { name: string; title?: string },
    points: string[],
    why: string,
): RegistrationCheck {
    const named = points.length > 0 ? ` (${points.join(', ')})` : '';
    return {
        registrationLeft: true,
        note: `Its Commerce Admin registration ${why}.`,
        reason:
            `${shownName} was undeployed, but its Commerce Admin registration${named} in the ` +
            `${workspace.title ?? workspace.name} workspace ${why}; removing anyway leaves it ` +
            'published, so Commerce Admin keeps its columns. Its card, folder and Adobe workspace ' +
            'are kept so nothing is left behind unseen. Remove again to retry, or remove anyway.',
    };
}

/** The leftover verdict with the registry's added: a note on the summary, a stop when it must. */
export function withRegistration(
    checked: Awaited<ReturnType<typeof checkRuntimeLeftovers>>,
    registration: RegistrationCheck,
): UndeployCheck {
    if (registration.note) {
        checked.cleanup.note = [checked.cleanup.note, registration.note].filter(Boolean).join(' ');
    }
    const stopped = registration.reason
        ? stoppedAfterUndeploy([checked.stopped?.error, registration.reason].filter(Boolean).join(' '))
        : checked.stopped;
    return { ...checked, ...(stopped ? { stopped } : {}), registrationLeft: registration.registrationLeft };
}
