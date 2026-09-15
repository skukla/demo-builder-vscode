/**
 * forget-added-demo — take a demo off your Welcome step.
 *
 * Forget always removes the card and never touches a project: each project
 * carries its own row (D2). The confirmation names how many projects on this
 * computer were built on the demo. When the extension made the card's
 * repository from a zip, and it is still there and still the SC's own, a
 * second choice offers to delete it as well, confirmed once more the way
 * project cleanup confirms a repository delete: the extension created it, so
 * Remove can undo that, but the delete is never the default (step 11). No other
 * repository is offered: a link's repository belongs to whoever made it.
 * Pattern B: the answer is RETURNED; the card leaves the wizard through the
 * settings listener's `addedDemosUpdated` push.
 *
 * {@link forgetDemo} is the dialog-free core the agent's tool calls with its
 * own `confirm` gate; this handler is the human door, which asks first.
 *
 * @module features/eds/handlers/forgetAddedDemoHandler
 */

import * as vscode from 'vscode';
import { getGitHubServices } from './edsHelpers';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { ZIP_COMMIT_MESSAGE } from '@/features/eds/services/storefront/zipImportCommit';
import {
    addedDemoKey,
    forgetAddedDemo,
    readAddedDemos,
} from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { getEdsGithubRepo } from '@/types/typeGuards';
import type { ForgetAddedDemoRequest, ForgetAddedDemoResult } from '@/types/webviewRequests';

const FORGET = 'Remove';
const FORGET_AND_DELETE = 'Remove and delete the repository';
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

/**
 * Whether Remove may offer to delete the card's repository. All must hold,
 * cheapest first: the card is remembered (read from settings, not from the
 * request); the signed-in GitHub account owns the repository; GitHub still has
 * it; and either the card records that the extension made it from a zip, or the
 * repository's latest commit is the zip import's own. Callers also refuse a
 * repository that is a project's own storefront ({@link projectWithStorefront}).
 * Anything unreadable answers false, the safe direction.
 */
export async function isDeletableZipRepository(
    context: Pick<HandlerContext, 'context' | 'logger'>,
    source: ForgetAddedDemoRequest['source'],
): Promise<boolean> {
    const key = addedDemoKey({ source });
    const card = readAddedDemos().find((row) => addedDemoKey(row) === key);
    if (!card) return false;
    const { tokenService, repoOperations, fileOperations } = getGitHubServices(context.context.secrets);
    const login = (await tokenService.validateToken()).user?.login;
    if (login?.toLowerCase() !== source.owner.toLowerCase()) return false;
    try {
        const repository = await repoOperations.getRepository(source.owner, source.repo);
        if (card.createdFromZip === true) return true;
        // The proof check (owner, 2026-09-15): a card added with "Add it from that
        // repository" records no zip origin. Its repository still counts when its
        // latest commit is the one a zip import pushes, so nothing changed it since.
        const message = await fileOperations.getLatestCommitMessage(source.owner, source.repo, repository.defaultBranch);
        return message?.trim() === ZIP_COMMIT_MESSAGE;
    } catch (error) {
        context.logger.debug(`[SharedDemo] ${source.owner}/${source.repo} is not offered for deletion: ${(error as Error).message}`);
        return false;
    }
}

/** The sentence the confirmation and the agent's refusal share. */
export function projectsSentence(count: number): string {
    if (count === 0) return 'No project on this computer was built on it.';
    const noun = count === 1 ? 'project' : 'projects';
    return `${count} ${noun} on this computer ${count === 1 ? 'was' : 'were'} built on it and will keep working.`;
}

/**
 * The dialog-free core: forget the row, then delete its repository when asked.
 * Callers decide with {@link repositoryDeletion} first. A delete GitHub refuses
 * never undoes the forget; it is reported instead.
 */
export async function forgetDemo(
    context: Pick<HandlerContext, 'context' | 'logger'>,
    source: ForgetAddedDemoRequest['source'],
    deleteRepository: boolean,
): Promise<ForgetAddedDemoResult & { deleteError?: string }> {
    const repo = `${source.owner}/${source.repo}`;
    await forgetAddedDemo(source);
    context.logger.info(`[SharedDemo] Forgot ${repo}`);
    if (!deleteRepository) return { forgotten: true };
    try {
        await getGitHubServices(context.context.secrets).repoOperations.deleteRepository(source.owner, source.repo);
        context.logger.info(`[SharedDemo] Deleted ${repo}, the repository made from its zip`);
        return { forgotten: true, deletedRepository: true };
    } catch (error) {
        context.logger.warn(`[SharedDemo] Could not delete ${repo}: ${(error as Error).message}`);
        return { forgotten: true, deletedRepository: false, deleteError: (error as Error).message };
    }
}

/**
 * Confirm, forget, and delete the zip's repository when asked. Returns `forgotten: false`
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
    const deletable = !storefrontOf && (await isDeletableZipRepository(context, source));
    const count = await countProjectsBuiltOn(context, source);

    const detail = storefrontOf
        ? `${repo} is the storefront of your project "${storefrontOf}"; the card goes, the project and its repository stay.`
        : deletable
          ? `${projectsSentence(count)} Deleting ${repo}, the repository made from its zip file, would leave them without reset and updates until they are pointed at another source.`
          : projectsSentence(count);
    const choice = await vscode.window.showWarningMessage(
        `Remove "${name}" from your Welcome step?`,
        { modal: true, detail },
        FORGET,
        ...(deletable ? [FORGET_AND_DELETE] : []),
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
        return { success: true, result: { ...result, deletedRepository: false } };
    }
    if (deleteError) {
        void vscode.window.showWarningMessage(
            `The demo was forgotten, but ${repo} could not be deleted: ${deleteError}`,
        );
    }
    return { success: true, result };
}
