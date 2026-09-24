/**
 * probe-shared-demo — read a colleague's repository before "Add a demo package" offers it.
 *
 * Its own file, like `checkRepoReadinessHandler`: `edsGitHubHandlers` sits at
 * the handler size threshold. Pattern B: the answer is RETURNED; nothing is
 * pushed and nothing is written.
 *
 * @module features/eds/handlers/probeSharedDemoHandler
 */

import { publicRepoReaders } from '../services/github/publicGitHubReads';
import { probeSharedDemo } from '../services/storefront/sharedDemoProbe';
import { adoptExistingGitHubSession } from './edsGitHubHandlers';
import { getGitHubServices } from './edsHelpers';
import { gitHubSourceProblem, parseStorefrontLink } from '@/core/utils/githubUrlParser';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { ProbeSharedDemoRequest, SharedDemoProbeResult } from '@/types/webviewRequests';

/**
 * The refusal when no GitHub session can be found.
 *
 * Kept for the callers that DO need a credential (adding the demo clones it);
 * the probe itself no longer refuses, since a public repository reads without
 * one.
 */
export const GITHUB_SIGN_IN_REQUIRED = 'Sign in to GitHub to read this demo.';

/**
 * Probe the requested repository.
 *
 * Refuses a missing or unsafe owner/repo (the names reach GitHub API paths and,
 * later, a `git clone`). A probe that cannot read the repository is a result
 * (`outcome: 'unreadable'`), not a failure: the dialog shows it. A missing
 * GitHub sign-in is NOT: the probe only reads, and a public repository reads
 * without a credential. The session VS Code already holds is still adopted when
 * there is one — it raises GitHub's rate limit and reaches private repositories
 * the SC can see.
 *
 * The 2026-09-12 note here said an unauthenticated probe answered "we couldn't
 * find this repository" for a repository that exists, and concluded every read
 * needs a token. The unauthenticated read was never the problem: the message
 * was, and a credential that GitHub had stopped accepting produced it too
 * (2026-09-17, on a public repository).
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
    const nameProblem = gitHubSourceProblem(owner, repo);
    if (nameProblem) return { success: false, error: nameProblem };

    const { fileOperations, repoOperations, tokenService } = getGitHubServices(context.context.secrets);
    const publicReaders = publicRepoReaders();
    // A public repository needs no credential, and this probe only reads. So a
    // missing sign-in is no longer a refusal: it reads publicly, and says so if
    // GitHub refuses. A repository that IS private then answers 404, which the
    // probe words as not found or no access — where the sign-in belongs.
    const signedIn = Boolean((await tokenService.getToken()) ?? (await adoptExistingGitHubSession(tokenService)));
    const result = await probeSharedDemo(
        signedIn
            ? { fileOps: fileOperations, repoOps: repoOperations, publicReaders }
            : { fileOps: publicReaders.fileOps, repoOps: publicReaders.repoOps },
        owner,
        repo,
        context.logger,
    );
    return { success: true, result };
}
