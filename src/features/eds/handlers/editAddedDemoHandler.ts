/**
 * edit-added-demo — rename an added demo package's card and change its description.
 *
 * Settings only: no GitHub call, no project touched (each project carries its
 * own row, D2), and no confirmation, because editing again undoes it. Pattern
 * B: the edited row is RETURNED; the card changes on the Welcome step through
 * the settings listener's `addedDemosUpdated` push. Headless-safe, so the
 * agent's `edit_added_demo` runs the same code.
 *
 * @module features/eds/handlers/editAddedDemoHandler
 */

import { gitHubSourceProblem } from '@/core/utils/githubUrlParser';
import { editAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { EditAddedDemoRequest, EditAddedDemoResult } from '@/types/webviewRequests';

/** The refusal both doors give for a demo that is not remembered. */
export function notOnWelcomeStep(source: EditAddedDemoRequest['source']): string {
    return `${source.owner}/${source.repo} is not on your Welcome step.`;
}

function isRequest(value: unknown): value is EditAddedDemoRequest {
    const request = value as Partial<EditAddedDemoRequest> | null;
    return (
        typeof request === 'object' &&
        request !== null &&
        typeof request.name === 'string' &&
        typeof request.description === 'string' &&
        typeof request.source?.owner === 'string' &&
        typeof request.source.repo === 'string'
    );
}

/**
 * Validate, edit, and answer the edited row.
 */
export async function handleEditAddedDemo(
    context: Pick<HandlerContext, 'logger'>,
    data: unknown,
): Promise<HandlerResponse & { result?: EditAddedDemoResult }> {
    if (!isRequest(data)) {
        return { success: false, error: 'A demo source, name and description are required' };
    }
    const { source, name, description } = data;
    if (!name.trim()) return { success: false, error: 'A demo package needs a name.' };
    const nameProblem = gitHubSourceProblem(source.owner, source.repo);
    if (nameProblem) return { success: false, error: nameProblem };

    const demo = await editAddedDemo({ owner: source.owner, repo: source.repo }, { name, description });
    if (!demo) return { success: false, error: notOnWelcomeStep(source) };
    context.logger.info(`[SharedDemo] Edited the card for ${source.owner}/${source.repo}`);
    return { success: true, result: { demo } };
}
