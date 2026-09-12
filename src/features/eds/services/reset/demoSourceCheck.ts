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

import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { COMPONENT_IDS } from '@/core/constants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
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
function whose(project: Project): string {
    return project.demo ? `${project.demo.source.owner}'s demo` : 'This demo';
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
    if (!demo) return { reachable: true, message: '', contentReachable: true };
    const unreachable = `${whose(project)} can't be reached. Reset and updates are unavailable until it is.`;

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
        return { reachable: false, message: unreachable, contentReachable: false };
    }

    const contentReachable = await indexReachable(demo.contentSource, fetchImpl, context.logger);
    return {
        reachable: true,
        message: '',
        contentReachable,
        ...(contentReachable
            ? {}
            : { contentMessage: `${whose(project)}'s pages can't be reached right now.` }),
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

/** GET the content index the reset would copy from; a demo with no site has nothing to lose. */
async function indexReachable(
    contentSource: { org: string; site: string; indexPath?: string } | undefined,
    fetchImpl: typeof fetch,
    logger: Logger,
): Promise<boolean> {
    if (!contentSource) return true;
    const url = `https://main--${contentSource.site}--${contentSource.org}.aem.live${contentSource.indexPath || '/full-index.json'}`;
    try {
        const response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        return response.ok;
    } catch (error) {
        logger.debug(`[DemoSource] Could not read ${url}: ${(error as Error).message}`);
        return false;
    }
}
