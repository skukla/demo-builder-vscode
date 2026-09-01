/**
 * check-repo-readiness — classify a repo before the wizard asks about resetting it.
 *
 * The repo-selection step needs to know what the chosen repo actually contains
 * before it can decide whether "Reset to template?" is a question worth asking.
 * Its own file rather than an addition to `edsGitHubHandlers`, which sits at the
 * handler size threshold already.
 *
 * @module features/eds/handlers/checkRepoReadinessHandler
 */

import {
    classifyRepoForStorefront,
    type RepoReadiness,
} from '../services/storefront/repoStorefrontReadiness';
import { getGitHubServices } from './edsHelpers';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

interface CheckRepoReadinessRequest {
    owner?: string;
    repo?: string;
}

/**
 * Classify the requested repo.
 *
 * Never throws for a classification failure. A thrown handler surfaces as a step
 * error, and "we could not check" is not a reason to stop someone — it resolves
 * to `undetermined`, the no-block path, and the mid-pipeline checks still run.
 */
export async function handleCheckRepoReadiness(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { readiness?: RepoReadiness }> {
    const { owner, repo } = (data ?? {}) as CheckRepoReadinessRequest;

    if (!owner || !repo) {
        context.logger.debug('[RepoReadiness] Ignoring request without owner and repo');
        return { success: false, error: 'owner and repo are required' };
    }

    try {
        const { fileOperations } = getGitHubServices(context.context.secrets);
        const readiness = await classifyRepoForStorefront(
            fileOperations,
            owner,
            repo,
            context.logger,
        );
        return { success: true, readiness };
    } catch (error) {
        const reason = (error as Error).message;
        context.logger.warn(`[RepoReadiness] Check failed for ${owner}/${repo}: ${reason}`);
        return { success: true, readiness: { kind: 'undetermined', reason } };
    }
}
