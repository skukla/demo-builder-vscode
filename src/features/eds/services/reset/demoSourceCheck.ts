/**
 * Is an added demo's source still there? Read-only, answered in a sentence.
 *
 * Reset and updates go back to the demo's repository and re-copy its pages;
 * when the repository is gone the run used to fail midway with raw git
 * output, and when the content site is gone it failed on the index. This
 * check runs BEFORE the first modal (decided 2026-09-11) so the SC hears it
 * up front, and it follows a renamed repository silently, the way stored
 * storefront names already self-heal: the project row, the instance
 * metadata the update check reads, and the remembered setting all move
 * together, so no reader is left behind (step 01's decision).
 *
 * @module features/eds/services/reset/demoSourceCheck
 */

import { resolveContentIndex } from '../contentIndex';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { COMPONENT_IDS } from '@/core/constants';
import { renameAddedDemoSource } from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** What the check needs from its caller: a logger, and a place to save a followed rename. */
export interface DemoSourceCheckContext {
    logger: Logger;
    stateManager: Pick<StateManager, 'saveProject'>;
}

export interface DemoSourceCheck {
    /** The repository answers. */
    reachable: boolean;
    /**
     * GitHub gave an answer about the repository: it answered, or said it does not exist (404).
     * False when the read failed for another reason (offline, a sign-in, a rate limit, an
     * outage): nothing is known, and the dashboard says nothing (owner, 2026-11-05).
     */
    checked: boolean;
    /** The sentence the SC sees when it does not. */
    message: string;
    /** The content site publishes an index (true when the demo has no site to probe). */
    contentReachable: boolean;
    /** The sentence for a missing content site, when `contentReachable` is false. */
    contentMessage?: string;
    /** Set when GitHub answered with a different name and the project was updated to it. */
    renamedTo?: string;
}

/** "Jen's demo" for a demo named "Isle5 by Jen": the owner's login is the person. */
/**
 * The demo, by its demo package name: always known, where the repository's
 * GitHub owner is an account or an organization rather than the author's name
 * (owner, 2026-09-15).
 */
function theDemo(project: Project): string {
    return project.demo ? `The ${project.demo.name} demo` : 'This demo';
}

/**
 * Check the demo's repository and content site; follow a rename.
 *
 * @param project - A project built on an added demo (`project.demo` set)
 * @param repoOps - The GitHub reader
 * @param context - For the logger and for saving a followed rename
 * @param fetchImpl - The index probe; defaults to the global fetch
 */
export async function checkDemoSource(
    project: Project,
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>,
    context: DemoSourceCheckContext,
    fetchImpl: typeof fetch = fetch,
): Promise<DemoSourceCheck> {
    const demo = project.demo;
    if (!demo) return { reachable: true, checked: true, message: '', contentReachable: true };
    const unreachable = `${theDemo(project)}'s repository can't be reached. Reset and updates are unavailable until it is.`;

    let renamedTo: string | undefined;
    try {
        const repo = await repoOps.getRepository(demo.source.owner, demo.source.repo);
        const current = `${demo.source.owner}/${demo.source.repo}`;
        if (repo.fullName.toLowerCase() !== current.toLowerCase()) {
            renamedTo = repo.fullName;
            await followRename(project, repo.fullName, context);
        }
    } catch (error) {
        context.logger.warn(`[DemoSource] ${demo.source.owner}/${demo.source.repo}: ${(error as Error).message}`);
        // Only GitHub saying the repository does not exist is "can't be reached". A failed read
        // told the SC their demo's source might be gone when the network had dropped (owner,
        // 2026-11-05: the JustRite notice one night, gone the next morning).
        if ((error as { status?: number }).status === 404) {
            return { reachable: false, checked: true, message: unreachable, contentReachable: false };
        }
        const unchecked = `Couldn't check ${theDemo(project).replace(/^./, (first) => first.toLowerCase())}'s repository. Try again in a moment.`;
        return { reachable: false, checked: false, message: unchecked, contentReachable: false };
    }

    const contentReachable = await indexReachable(demo.contentSource, fetchImpl, context.logger);
    return {
        reachable: true,
        checked: true,
        message: '',
        contentReachable,
        ...(contentReachable
            ? {}
            : { contentMessage: `${theDemo(project)}'s pages can't be reached right now.` }),
        ...(renamedTo ? { renamedTo } : {}),
    };
}

/** The repository moved: rewrite the row, the instance metadata, and the remembered setting. */
async function followRename(
    project: Project,
    fullName: string,
    context: DemoSourceCheckContext,
): Promise<void> {
    if (!project.demo) return;
    const [owner, repo] = fullName.split('/');
    const from = { owner: project.demo.source.owner, repo: project.demo.source.repo };
    project.demo = { ...project.demo, source: { ...project.demo.source, owner, repo } };
    const eds = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (eds?.metadata) {
        eds.metadata = { ...eds.metadata, templateOwner: owner, templateRepo: repo };
    }
    await context.stateManager.saveProject(project);
    const remembered = await renameAddedDemoSource(from, { owner, repo });
    context.logger.info(
        `[DemoSource] ${from.owner}/${from.repo} is now ${fullName}: project row and instance metadata updated${remembered ? ', remembered demo updated' : ''}`,
    );
}

/** Read the content index the reset would copy from; a demo with no site has nothing to lose. */
async function indexReachable(
    contentSource: { org: string; site: string; indexPath: string } | undefined,
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<boolean> {
    if (!contentSource) return true;
    return (await resolveContentIndex(contentSource, fetchImpl, logger)).found;
}

/**
 * The demo's content site cannot be reached: reset the code only and keep the
 * current content, or stop. Content is not forkable, so there is nothing else
 * to offer. Undefined = cancelled. Asked by `edsResetUI` before a reset runs; moved here, beside
 * the check that finds the site unreachable, when that file passed its size limit (2026-11-04).
 */
export async function offerToKeepContent(
    vscode: typeof import('vscode'),
    demoName: string,
    check: DemoSourceCheck,
): Promise<boolean | undefined> {
    const keepButton: import('vscode').MessageItem = { title: 'Keep Current Content' };
    const answer = await vscode.window.showWarningMessage(
        `${check.contentMessage ?? `The ${demoName} demo's pages can't be reached right now.`} ` +
            'You can reset the code and keep the content this site has now.',
        { modal: true },
        keepButton,
    );
    return answer?.title === keepButton.title ? true : undefined;
}
