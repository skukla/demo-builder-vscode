/**
 * What a reset does about an added demo's source, decided once in the one storefront reset
 * (`edsResetRun`), which the window and the agent both run (owner, 2026-11-14; PL-104 fix 1). Its
 * own file so the check it reads (`checkDemoSource`) stays a seam a test can replace.
 *
 * @module features/eds/services/reset/resetSourceDecision
 */

import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { checkDemoSource, type DemoSourceCheckContext } from './demoSourceCheck';
import type { Project } from '@/types/base';

/** What a reset does about an added demo's source: refuse, or go on, keeping the content or not. */
export interface ResetSourceDecision {
    /** The repository can't be reached: the reset refuses in the check's sentence. */
    refused?: { error: string; errorType: 'DEMO_SOURCE_UNREACHABLE' };
    /** The content site can't be reached: reset the code only, keeping the content. */
    keepContent: boolean;
}

/**
 * The window's reset and the agent's alike (owner, 2026-11-14): an unreachable repository refuses;
 * an unreachable content site keeps the content and asks nothing (P5-Q8), the caller saying
 * `CONTENT_KEPT_LINE`. A project not built on an added demo goes on as it is.
 *
 * @param getRepoOps - the GitHub reader, fetched only when there is a demo to check
 */
export async function decideResetSource(
    project: Project,
    getRepoOps: () => Pick<GitHubRepoOperations, 'getRepository'>,
    context: DemoSourceCheckContext,
    fetchImpl?: typeof fetch,
): Promise<ResetSourceDecision> {
    if (!project.demo) return { keepContent: false };
    const check = await checkDemoSource(project, getRepoOps(), context, fetchImpl);
    if (!check.reachable) {
        context.logger.warn(`[DemoSource] Reset refused: ${check.message}`);
        return { refused: { error: check.message, errorType: 'DEMO_SOURCE_UNREACHABLE' }, keepContent: false };
    }
    if (check.contentReachable) return { keepContent: false };
    context.logger.warn(`[DemoSource] ${check.contentMessage ?? 'Content site unreachable'}; content kept`);
    return { keepContent: true };
}
