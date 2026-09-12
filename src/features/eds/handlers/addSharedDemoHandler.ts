/**
 * add-shared-demo — the "Add demo" commit: keep a copy when asked, then
 * remember the row (Pattern B: the answer is RETURNED).
 *
 * The copy is {@link keepOwnCopy}; what this handler adds is the remembered
 * setting, which is what puts the card on the Welcome grid.
 *
 * @module features/eds/handlers/addSharedDemoHandler
 */

import { getGitHubServices } from './edsHelpers';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { isAddedDemo, keepOwnCopy } from '@/features/eds/services/sharedDemoCopy';
import { rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AddedDemo } from '@/types/projectFile';
import type { AddSharedDemoRequest, AddSharedDemoResult } from '@/types/webviewRequests';

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

    let row: AddedDemo = demo;
    let forkedTo: string | undefined;
    if (keepCopy) {
        const copy = await keepOwnCopy(demo, getGitHubServices(context.context.secrets), context.logger);
        if ('error' in copy) {
            return {
                success: false,
                error: "We couldn't make your own copy of this demo. Nothing was added; you can try again, or add it without a copy.",
            };
        }
        row = copy.row;
        forkedTo = copy.forkedTo;
    }

    await rememberAddedDemo(row);
    context.logger.info(`[SharedDemo] Remembered ${row.source.owner}/${row.source.repo}${forkedTo ? ` (copy: ${forkedTo})` : ''}`);
    return { success: true, result: { demo: row, ...(forkedTo ? { forkedTo } : {}) } };
}
