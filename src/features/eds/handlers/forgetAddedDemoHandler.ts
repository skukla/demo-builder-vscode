/**
 * forget-added-demo — take a demo off your Welcome step.
 *
 * Forget always removes the card and never touches a project: each project
 * carries its own row (D2). The confirmation names how many projects on this
 * computer were built on the demo. When the demo's source is the SC's own
 * copy, a second choice offers to delete that copy as well, confirmed once
 * more the way project cleanup confirms a repository delete (decided
 * 2026-09-11; the delete is the one part that cannot be undone, so it is
 * never the default). Pattern B: the answer is RETURNED; the card leaves the
 * wizard through the settings listener's `addedDemosUpdated` push.
 *
 * {@link forgetDemo} is the dialog-free core the agent's tool calls with its
 * own `confirm` gate; this handler is the human door, which asks first.
 *
 * @module features/eds/handlers/forgetAddedDemoHandler
 */

import * as vscode from 'vscode';
import { getGitHubServices } from './edsHelpers';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { addedDemoKey, forgetAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getEdsGithubRepo } from '@/types/typeGuards';
import type { ForgetAddedDemoRequest, ForgetAddedDemoResult } from '@/types/webviewRequests';

const FORGET = 'Remove';
const FORGET_AND_DELETE = 'Remove and delete my copy';
const DELETE_REPOSITORY = 'Delete repository';

function isRequest(value: unknown): value is ForgetAddedDemoRequest {
    const request = value as Partial<ForgetAddedDemoRequest> | null;
    return (
        typeof request === 'object' &&
        request !== null &&
        typeof request.name === 'string' &&
        typeof request.source?.owner === 'string' &&
        typeof request.source.repo === 'string'
    );
}

/** How many projects on this computer were built on this demo. */
export async function countProjectsBuiltOn(
    context: Pick<HandlerContext, 'stateManager'>,
    source: ForgetAddedDemoRequest['source'],
): Promise<number> {
    const key = addedDemoKey({ source });
    let count = 0;
    for (const summary of await context.stateManager.getAllProjects()) {
        const project = await context.stateManager.loadProjectFromPath(summary.path, undefined, {
            persistAfterLoad: false,
        });
        if (project?.demo && addedDemoKey(project.demo) === key) count += 1;
    }
    return count;
}

/** Whether the signed-in GitHub account owns the repository (so it is the SC's own copy). */
/** The name of a project on this computer whose own storefront is `source`, if any. */
export async function projectWithStorefront(
    context: Pick<HandlerContext, 'stateManager'>,
    source: ForgetAddedDemoRequest['source'],
): Promise<string | undefined> {
    const wanted = `${source.owner}/${source.repo}`.toLowerCase();
    for (const summary of await context.stateManager.getAllProjects()) {
        const project = await context.stateManager.loadProjectFromPath(summary.path, undefined, {
            persistAfterLoad: false,
        });
        if (project && getEdsGithubRepo(project)?.toLowerCase() === wanted) return project.name;
    }
    return undefined;
}

export async function isOwnCopy(
    context: Pick<HandlerContext, 'context'>,
    source: ForgetAddedDemoRequest['source'],
): Promise<boolean> {
    const { tokenService } = getGitHubServices(context.context.secrets);
    const login = (await tokenService.validateToken()).user?.login;
    return login !== undefined && login.toLowerCase() === source.owner.toLowerCase();
}

/** The sentence the confirmation and the agent's refusal share. */
export function projectsSentence(count: number): string {
    if (count === 0) return 'No project on this computer was built on it.';
    const noun = count === 1 ? 'project' : 'projects';
    return `${count} ${noun} on this computer ${count === 1 ? 'was' : 'were'} built on it and will keep working.`;
}

/**
 * The dialog-free core: forget the row, then delete the copy when asked. A
 * delete GitHub refuses never undoes the forget; it is reported instead.
 */
export async function forgetDemo(
    context: Pick<HandlerContext, 'context' | 'logger'>,
    source: ForgetAddedDemoRequest['source'],
    deleteCopy: boolean,
): Promise<ForgetAddedDemoResult & { deleteError?: string }> {
    const repo = `${source.owner}/${source.repo}`;
    await forgetAddedDemo(source);
    context.logger.info(`[SharedDemo] Forgot ${repo}`);
    if (!deleteCopy) return { forgotten: true };
    try {
        await getGitHubServices(context.context.secrets).repoOperations.deleteRepository(source.owner, source.repo);
        context.logger.info(`[SharedDemo] Deleted the copy ${repo}`);
        return { forgotten: true, deletedCopy: true };
    } catch (error) {
        context.logger.warn(`[SharedDemo] Could not delete ${repo}: ${(error as Error).message}`);
        return { forgotten: true, deletedCopy: false, deleteError: (error as Error).message };
    }
}

/**
 * Confirm, forget, and delete the copy when asked. Returns `forgotten: false`
 * when the SC cancels.
 */
export async function handleForgetAddedDemo(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: ForgetAddedDemoResult }> {
    if (!isRequest(data)) {
        return { success: false, error: 'A demo name and source are required' };
    }
    const { name, source } = data;
    try {
        assertGitHubName(source.owner, 'owner');
        assertGitHubName(source.repo, 'repo');
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    const repo = `${source.owner}/${source.repo}`;
    // A repository that IS one of this computer's storefronts (a demo package
    // saved from a project) is never offered for deletion: removing the card
    // takes it off the Welcome step and nothing else.
    const storefrontOf = await projectWithStorefront(context, source);
    const ownCopy = !storefrontOf && (await isOwnCopy(context, source));
    const count = await countProjectsBuiltOn(context, source);

    const detail = storefrontOf
        ? `${repo} is the storefront of your project "${storefrontOf}"; the card goes, the project and its repository stay.`
        : ownCopy
          ? `${projectsSentence(count)} Deleting your copy (${repo}) would leave them without reset and updates until they are pointed at another source.`
          : projectsSentence(count);
    const choice = await vscode.window.showWarningMessage(
        `Remove "${name}" from your Welcome step?`,
        { modal: true, detail },
        FORGET,
        ...(ownCopy ? [FORGET_AND_DELETE] : []),
    );
    if (choice !== FORGET && choice !== FORGET_AND_DELETE) {
        return { success: true, result: { forgotten: false } };
    }
    if (choice !== FORGET_AND_DELETE) {
        return { success: true, result: await forgetDemo(context, source, false) };
    }

    const confirmed = await vscode.window.showWarningMessage(
        `Delete ${repo} from GitHub? This cannot be undone.`,
        { modal: true },
        DELETE_REPOSITORY,
    );
    const { deleteError, ...result } = await forgetDemo(context, source, confirmed === DELETE_REPOSITORY);
    if (confirmed !== DELETE_REPOSITORY) {
        return { success: true, result: { ...result, deletedCopy: false } };
    }
    if (deleteError) {
        void vscode.window.showWarningMessage(
            `The demo was forgotten, but ${repo} could not be deleted: ${deleteError}`,
        );
    }
    return { success: true, result };
}
