/**
 * probe-shared-demo — read a colleague's repository before "Add a demo" offers it.
 *
 * Its own file, like `checkRepoReadinessHandler`: `edsGitHubHandlers` sits at
 * the handler size threshold. Pattern B: the answer is RETURNED; nothing is
 * pushed and nothing is written.
 *
 * @module features/eds/handlers/probeSharedDemoHandler
 */

import type { GitHubRepoOperations } from '../services/github/githubRepoOperations';
import type { GitHubTokenService } from '../services/github/githubTokenService';
import { probeSharedDemo } from '../services/storefront/sharedDemoProbe';
import { getGitHubServices } from './edsHelpers';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { ProbeSharedDemoRequest, SharedDemoProbeResult, SharedDemoRead } from '@/types/webviewRequests';

/**
 * Probe the requested repository.
 *
 * Refuses a missing or unsafe owner/repo (the names reach GitHub API paths and,
 * later, a `git clone`). A probe that cannot read the repository is a result
 * (`outcome: 'unreadable'`), not a failure: the dialog shows it.
 */
export async function handleProbeSharedDemo(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: SharedDemoProbeResult }> {
    const { owner, repo } = (data ?? {}) as Partial<ProbeSharedDemoRequest>;
    if (!owner || !repo) {
        return { success: false, error: 'owner and repo are required' };
    }
    try {
        assertGitHubName(owner, 'owner');
        assertGitHubName(repo, 'repo');
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    const { fileOperations, repoOperations, tokenService } = getGitHubServices(context.context.secrets);
    const result = await probeSharedDemo(
        { fileOps: fileOperations, repoOps: repoOperations },
        owner,
        repo,
        context.logger,
    );
    if (result.outcome !== 'read') return { success: true, result };
    const viewer = await describeViewer(tokenService, repoOperations, owner, repo, context.logger);
    return { success: true, result: viewer ? { ...result, viewer } : result };
}

/**
 * Whether the repository is the viewer's own, and their existing fork of it if
 * any: the two facts the "keep my own copy" tick box is worded from. Best
 * effort; a viewer who cannot be identified simply gets the default wording.
 */
async function describeViewer(
    tokenService: Pick<GitHubTokenService, 'validateToken'>,
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>,
    owner: string,
    repo: string,
    logger: HandlerContext['logger'],
): Promise<SharedDemoRead['viewer'] | undefined> {
    const validation = await tokenService.validateToken();
    const login = validation.user?.login;
    if (!login) return undefined;
    const ownsRepo = login.toLowerCase() === owner.toLowerCase();
    if (ownsRepo) return { login, ownsRepo };
    try {
        const own = await repoOps.getRepository(login, repo);
        const parent = own.forkParent?.toLowerCase();
        const existingFork = parent === `${owner}/${repo}`.toLowerCase() ? own.fullName : undefined;
        return { login, ownsRepo, ...(existingFork ? { existingFork } : {}) };
    } catch (error) {
        logger.debug(`[SharedDemo] No fork of ${owner}/${repo} under ${login}: ${(error as Error).message}`);
        return { login, ownsRepo };
    }
}
