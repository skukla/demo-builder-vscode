/**
 * add-shared-demo — the "Add demo" commit: keep a copy when asked, then
 * remember the row (Pattern B: the answer is RETURNED).
 *
 * The fork is a cloud write into the SC's own account (D28: personal account
 * only); the dialog's tick box is its confirmation. It is skipped when the
 * repository is already the SC's own. The remembered row's `source` is the
 * fork when one was kept, so reset and updates follow the copy.
 *
 * @module features/eds/handlers/addSharedDemoHandler
 */

import { getGitHubServices } from './edsHelpers';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AddedDemo } from '@/types/projectFile';
import type { AddSharedDemoRequest, AddSharedDemoResult } from '@/types/webviewRequests';

function isAddedDemo(value: unknown): value is AddedDemo {
    const demo = value as Partial<AddedDemo> | null;
    return (
        typeof demo === 'object' &&
        demo !== null &&
        demo.kind === 'demo' &&
        typeof demo.name === 'string' &&
        typeof demo.source?.owner === 'string' &&
        typeof demo.source.repo === 'string' &&
        (demo.storefrontKind === 'eds' || demo.storefrontKind === 'headless')
    );
}

/**
 * Keep a copy when asked, remember the row, hand it back.
 */
export async function handleAddSharedDemo(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: AddSharedDemoResult }> {
    const { demo, keepCopy } = (data ?? {}) as Partial<AddSharedDemoRequest>;
    if (!isAddedDemo(demo)) {
        return { success: false, error: 'A demo row with a source is required' };
    }
    try {
        assertGitHubName(demo.source.owner, 'owner');
        assertGitHubName(demo.source.repo, 'repo');
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    const { tokenService, repoOperations } = getGitHubServices(context.context.secrets);
    let row: AddedDemo = demo;
    let forkedTo: string | undefined;
    if (keepCopy) {
        const validation = await tokenService.validateToken();
        const login = validation.user?.login;
        const ownRepo = login !== undefined && login.toLowerCase() === demo.source.owner.toLowerCase();
        if (!ownRepo) {
            try {
                const fork = await repoOperations.createFork(demo.source.owner, demo.source.repo);
                const [owner, repo] = fork.fullName.split('/');
                row = { ...demo, source: { owner, repo, branch: fork.defaultBranch } };
                forkedTo = fork.fullName;
                // We own the copy, so it can be a GitHub template: project creation
                // then generates from it. Best effort; the create path reads the
                // flag live and falls back to a reset when it is not set.
                try {
                    await repoOperations.setTemplateFlag(owner, repo);
                } catch (error) {
                    context.logger.warn(`[SharedDemo] Could not flag ${fork.fullName} as a template: ${(error as Error).message}`);
                }
            } catch (error) {
                context.logger.warn(`[SharedDemo] Could not keep a copy of ${demo.source.owner}/${demo.source.repo}: ${(error as Error).message}`);
                return {
                    success: false,
                    error: "We couldn't make your own copy of this demo. Nothing was added; you can try again, or add it without a copy.",
                };
            }
        }
    }

    await rememberAddedDemo(row);
    context.logger.info(`[SharedDemo] Remembered ${row.source.owner}/${row.source.repo}${forkedTo ? ` (copy: ${forkedTo})` : ''}`);
    return { success: true, result: { demo: row, ...(forkedTo ? { forkedTo } : {}) } };
}
