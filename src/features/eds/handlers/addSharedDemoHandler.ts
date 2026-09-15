/**
 * add-shared-demo — the "Add demo" commit: remember the row (Pattern B: the
 * answer is RETURNED). The remembered setting is what puts the card on the
 * Welcome grid. Nothing is created on GitHub: an added demo reads from its
 * link, as a shipped package does (shareable-demo step 11).
 *
 * @module features/eds/handlers/addSharedDemoHandler
 */

import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { isAddedDemo, rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AddSharedDemoRequest, AddSharedDemoResult } from '@/types/webviewRequests';

/**
 * Remember the row and hand it back.
 */
export async function handleAddSharedDemo(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: AddSharedDemoResult }> {
    const { demo } = (data ?? {}) as Partial<AddSharedDemoRequest>;
    if (!isAddedDemo(demo)) {
        return { success: false, error: 'A demo row with a source is required' };
    }
    try {
        assertGitHubName(demo.source.owner, 'owner');
        assertGitHubName(demo.source.repo, 'repo');
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    await rememberAddedDemo(demo);
    context.logger.info(`[SharedDemo] Remembered ${demo.source.owner}/${demo.source.repo}`);
    return { success: true, result: { demo } };
}
