/**
 * probe-shared-demo — read a colleague's repository before "Add a demo package" offers it.
 *
 * Its own file, like `checkRepoReadinessHandler`: `edsGitHubHandlers` sits at
 * the handler size threshold. Pattern B: the answer is RETURNED; nothing is
 * pushed and nothing is written.
 *
 * @module features/eds/handlers/probeSharedDemoHandler
 */

import { probeSharedDemo } from '../services/storefront/sharedDemoProbe';
import { adoptExistingGitHubSession } from './edsGitHubHandlers';
import { getGitHubServices } from './edsHelpers';
import { assertGitHubName, parseStorefrontLink } from '@/core/utils/githubUrlParser';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { ProbeSharedDemoRequest, SharedDemoProbeResult } from '@/types/webviewRequests';

/** The refusal when no GitHub session can be found: the dialog and the agent both name the sign-in. */
export const GITHUB_SIGN_IN_REQUIRED = 'Sign in to GitHub to read this demo.';

/**
 * Probe the requested repository.
 *
 * Refuses a missing or unsafe owner/repo (the names reach GitHub API paths and,
 * later, a `git clone`). A probe that cannot read the repository is a result
 * (`outcome: 'unreadable'`), not a failure: the dialog shows it. A missing
 * GitHub sign-in IS a failure, with `needsAuth` for the agent: every read here
 * needs a token, and the Add a demo package dialog opens before the Storefront step's
 * sign-in, so the session VS Code already holds is adopted first. Found live
 * 2026-09-12: without this an unauthenticated probe answered "we couldn't find
 * this repository" for a repository that exists.
 */
export async function handleProbeSharedDemo(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: SharedDemoProbeResult; needsAuth?: 'github' }> {
    const request = (data ?? {}) as Partial<ProbeSharedDemoRequest>;
    // A link is read to its repository the way the dialog's field reads it (a
    // GitHub link, or the demo's site address); owner and repo win when given.
    const fromLink = request.owner || request.repo ? null : parseStorefrontLink(request.link);
    const owner = request.owner ?? fromLink?.owner;
    const repo = request.repo ?? fromLink?.repo;
    if (!owner || !repo) {
        return {
            success: false,
            error: request.link
                ? 'The link is not a GitHub link or a demo site address'
                : 'owner and repo are required',
        };
    }
    try {
        assertGitHubName(owner, 'owner');
        assertGitHubName(repo, 'repo');
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    const { fileOperations, repoOperations, tokenService } = getGitHubServices(context.context.secrets);
    if (!(await tokenService.getToken()) && !(await adoptExistingGitHubSession(tokenService))) {
        return { success: false, error: GITHUB_SIGN_IN_REQUIRED, needsAuth: 'github' };
    }
    const result = await probeSharedDemo(
        { fileOps: fileOperations, repoOps: repoOperations },
        owner,
        repo,
        context.logger,
    );
    return { success: true, result };
}
