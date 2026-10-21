/**
 * Fix with AI (EDS-57 step 4): after an apply kept one or more clashes for fixing, open the
 * SC's chosen AI on them, in one new chat.
 *
 * The engine is not this module's to choose: it hands `open` the prompt and the files, and
 * the boundary passes the Chat command (`demoBuilder.openInClaude`), which reads
 * `demoBuilder.ai.engine` and opens Copilot or Claude Code.
 *
 * @module features/updates/services/fixWithAi
 */

import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { buildClashPrompt, clashForPrompt, type ClashForPrompt } from '@/features/updates/services/clashPrompt';
import { openLocalCopy } from '@/features/updates/services/localStorefrontRefresh';
import { readPendingClash } from '@/features/updates/services/pendingClash';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';

/** What the Chat command takes: a prompt, a new chat, and the files to put in front of the agent. */
export interface FixWithAiRequest {
    prompt: string;
    fresh: true;
    attachFiles: string[];
}

/**
 * Open the SC's AI on every kept clash among `projects`. Does nothing when none is kept.
 *
 * @param open - opens the chosen engine's chat with the request
 * @returns whether a chat was opened
 */
export async function openFixWithAi(
    projects: Project[],
    ctx: UpdateContext,
    open: (request: FixWithAiRequest) => PromiseLike<unknown>,
): Promise<boolean> {
    const token = (await getGitHubServices(ctx.secrets).tokenService.getToken())?.token;
    if (!token) return false;
    const items: ClashForPrompt[] = [];
    for (const project of projects) {
        const clash = readPendingClash(project);
        const copy = clash ? await openLocalCopy(project, ctx, token) : undefined;
        if (clash && copy) items.push(await clashForPrompt(project, clash, copy));
    }
    if (items.length === 0) return false;
    const attachFiles = items.flatMap((item) => item.files.map((file) => `${item.storefrontPath}/${file.path}`));
    await open({ prompt: buildClashPrompt(items), fresh: true, attachFiles });
    ctx.logger.info(`[Updates] Opened Fix with AI on ${items.length} kept clash(es)`);
    return true;
}
