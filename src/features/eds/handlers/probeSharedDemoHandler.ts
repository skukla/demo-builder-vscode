/**
 * probe-shared-demo — read a colleague's repository before "Add a demo" offers it.
 *
 * Its own file, like `checkRepoReadinessHandler`: `edsGitHubHandlers` sits at
 * the handler size threshold. Pattern B: the answer is RETURNED; nothing is
 * pushed and nothing is written.
 *
 * @module features/eds/handlers/probeSharedDemoHandler
 */

import { probeSharedDemo } from '../services/storefront/sharedDemoProbe';
import { getGitHubServices } from './edsHelpers';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { ProbeSharedDemoRequest, SharedDemoProbeResult } from '@/types/webviewRequests';

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

    const { fileOperations, repoOperations } = getGitHubServices(context.context.secrets);
    const result = await probeSharedDemo(
        { fileOps: fileOperations, repoOps: repoOperations },
        owner,
        repo,
        context.logger,
    );
    return { success: true, result };
}
